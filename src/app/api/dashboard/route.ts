import { AiError } from "@/lib/ai/gateway";
import { canEdit, getWorkspace } from "@/lib/auth/session";
import { ImportError, MAX_FILE_BYTES } from "@/lib/ingest/parse";
import { generateDashboard } from "@/lib/pipeline";
import { CleaningPlanSchema, type CleaningPlan } from "@/lib/quality";
import { logEvent } from "@/lib/audit";
import { saveVersion } from "@/lib/dashboards/versions";
import { sourceFingerprint } from "@/lib/dashboards/fingerprint";
import type { Json } from "@/lib/supabase/database.types";
import { viewFromPreferences } from "@/lib/preferences";
import { isDefaultView } from "@/lib/view";

// La région d'exécution (Paris) est fixée pour tout le projet dans vercel.json.
export const maxDuration = 120;

export async function POST(request: Request) {
  const workspace = await getWorkspace();
  if (!workspace) return Response.json({ error: "Votre session a expiré. Reconnectez-vous." }, { status: 401 });
  if (!canEdit(workspace.role)) {
    return Response.json({ error: "Votre rôle (lecteur) ne permet pas de créer de dashboard." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Requête invalide : envoyez le fichier dans un formulaire." }, { status: 400 });
  }

  const file = form.get("file");
  const mode = form.get("mode") === "strict" ? "strict" : "standard";
  // Colonne qui distingue des fichiers regroupés (US-16) : un simple nom de colonne, vérifié contre le fichier.
  const compareField = form.get("compareBy");
  const compareBy = typeof compareField === "string" && compareField.length > 0 && compareField.length <= 200 ? compareField : null;
  if (!(file instanceof File)) return Response.json({ error: "Aucun fichier reçu." }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) return Response.json({ error: "Le fichier dépasse 20 Mo." }, { status: 413 });

  // Corrections validées par l'utilisateur au contrôle qualité (US-11), appliquées avant tout calcul.
  let cleaning: CleaningPlan | undefined;
  const cleaningField = form.get("cleaning");
  if (typeof cleaningField === "string" && cleaningField !== "") {
    try {
      const parsed = CleaningPlanSchema.safeParse(JSON.parse(cleaningField));
      if (!parsed.success) return Response.json({ error: "Corrections invalides." }, { status: 400 });
      cleaning = parsed.data;
    } catch {
      return Response.json({ error: "Corrections invalides." }, { status: 400 });
    }
  }

  let result;
  let fingerprint: string | null = null;
  try {
    // La clé de pseudonymisation est dérivée par organisation : jetons propres à chaque client.
    result = await generateDashboard({ fileName: file.name, data: await file.arrayBuffer(), mode, organizationId: workspace.organization.id, cleaning, compareBy, onSource: (raw) => (fingerprint = sourceFingerprint(raw, workspace.organization.id)) });
  } catch (error) {
    if (error instanceof ImportError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof AiError) return Response.json({ error: error.message }, { status: 502 });
    console.error("Génération du dashboard en échec", error instanceof Error ? error.message : error);
    return Response.json({ error: "Une erreur inattendue est survenue. Réessayez." }, { status: 500 });
  }

  // Le fichier importé n'est pas conservé : seul le résultat est enregistré, sous la RLS de l'utilisateur.
  const { supabase, user, organization } = workspace;
  // Affichage habituel de l'utilisateur (US-13), appliqué d'office au nouveau dashboard.
  const { data: habit } = await supabase.from("display_preferences").select("preferences").eq("user_id", user.id).maybeSingle();
  // Sans réglage enregistré : vue essentielle (les principaux indicateurs et graphiques, le reste masqué).
  const display = viewFromPreferences(habit?.preferences, result.charts, result.kpis);
  const habitualApplied = !isDefaultView(display);
  const { data: saved, error: saveError } = await supabase
    .from("dashboards")
    .insert({
      organization_id: organization.id,
      created_by: user.id,
      title: result.title,
      file_name: result.fileName,
      row_count: result.profile.rowCount,
      ai_mode: mode,
      result: result as unknown as Json,
      display: display as unknown as Json,
      source_fingerprint: fingerprint,
    })
    .select("id")
    .single();
  if (saveError) console.error("Enregistrement du dashboard en échec", saveError.code);
  else {
    await saveVersion(workspace, saved.id, result, { fingerprint, label: "Création" });
    await logEvent(workspace, "dashboard.created", { type: "dashboard", id: saved.id }, { file: result.fileName, rows: result.profile.rowCount, mode, corrections: result.cleaning?.log.lines.length ?? 0 });
  }

  // Journal des appels IA : métadonnées uniquement, jamais le contenu.
  const calls = [result.ai, ...(result.analysis?.writtenBy === "ai" ? [result.analysis] : [])];
  const { error: logError } = await supabase.from("ai_calls").insert(
    calls.map((call) => ({
      organization_id: organization.id,
      user_id: user.id,
      dashboard_id: saved?.id ?? null,
      provider: call.provider,
      model: call.model,
      ai_mode: mode,
      input_tokens: call.inputTokens,
      output_tokens: call.outputTokens,
    })),
  );
  if (logError) console.error("Journalisation de l'appel IA en échec", logError.code);

  return Response.json({ result, dashboardId: saved?.id ?? null, display: saved ? display : null, habitualApplied: !!saved && habitualApplied });
}
