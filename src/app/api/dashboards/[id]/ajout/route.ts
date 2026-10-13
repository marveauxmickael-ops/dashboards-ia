import { logEvent } from "@/lib/audit";
import { canEdit, getWorkspace } from "@/lib/auth/session";
import { sourceFingerprint } from "@/lib/dashboards/fingerprint";
import { saveVersion } from "@/lib/dashboards/versions";
import { NO_FILTERS } from "@/lib/filters";
import { ImportError, MAX_FILE_BYTES, parseFile } from "@/lib/ingest/parse";
import { profileDataset } from "@/lib/ingest/profile";
import { mergeDatasets, mergedFileName, type KeepPolicy, type MergePreview, type MergeSnapshot } from "@/lib/merge";
import { compatibilityProblems, IncompatibleFileError, recomputeDashboard, type DashboardResult } from "@/lib/pipeline";
import { cleanedCsv } from "@/lib/quality";
import type { Json } from "@/lib/supabase/database.types";

export const maxDuration = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" });

/** Indicateurs comparés avant / après : montants d'abord (chiffre d'affaires), trois au plus. */
function snapshot(result: DashboardResult): MergeSnapshot {
  const kpis = [...result.kpis].sort((a, b) => Number(b.format === "currency") - Number(a.format === "currency")).slice(0, 3);
  return { rows: result.profile.rowCount, period: result.period ?? null, kpis: kpis.map((k) => ({ id: k.id, label: k.label, value: k.value, format: k.format })) };
}

// Ajout de données (US-12) : le fichier de la version en cours et le nouveau fichier sont fusionnés en mémoire,
// par le moteur et sans IA ; seules les lignes nouvelles ou modifiées sont ajoutées. Étapes :
// - « preview » : récapitulatif (lignes déjà présentes, nouvelles, modifiées, période, indicateurs avant / après) ;
// - « apply » : nouvelle version du dashboard ; l'analyse des variations peut être rédigée comme lors d'une mise à jour ;
// - « download » : fichier fusionné en CSV, à conserver pour le prochain ajout.
// Aucun des fichiers n'est conservé : seule l'empreinte (HMAC) du fichier fusionné est enregistrée.
export async function POST(request: Request, { params }: RouteContext<"/api/dashboards/[id]/ajout">) {
  const { id } = await params;
  if (!UUID.test(id)) return Response.json({ error: "Dashboard introuvable." }, { status: 404 });
  const workspace = await getWorkspace();
  if (!workspace) return Response.json({ error: "Votre session a expiré. Reconnectez-vous." }, { status: 401 });
  if (!canEdit(workspace.role)) return Response.json({ error: "Votre rôle (lecteur) ne permet pas d'ajouter des données." }, { status: 403 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Requête invalide." }, { status: 400 });
  }
  const previousFile = form.get("previous");
  const file = form.get("file");
  const step = form.get("step");
  const keep: KeepPolicy = form.get("keep") === "old" ? "old" : "new";
  if (step !== "preview" && step !== "apply" && step !== "download") return Response.json({ error: "Requête invalide." }, { status: 400 });
  if (!(previousFile instanceof File) || !(file instanceof File)) return Response.json({ error: "Chargez le fichier de la version en cours et le nouveau fichier." }, { status: 400 });
  if (previousFile.size > MAX_FILE_BYTES || file.size > MAX_FILE_BYTES) return Response.json({ error: "Un fichier dépasse 20 Mo." }, { status: 413 });

  const { supabase, user, organization } = workspace;
  const { data: dashboard } = await supabase
    .from("dashboards")
    .select("id, ai_mode, result, source_fingerprint, file_name, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (!dashboard) return Response.json({ error: "Dashboard introuvable." }, { status: 404 });
  const previous = dashboard.result as unknown as DashboardResult;
  if (!previous.spec) return Response.json({ error: "Ce dashboard a été créé avant les mises à jour : générez-le à nouveau pour pouvoir y ajouter des données." }, { status: 400 });
  const mode = dashboard.ai_mode === "strict" ? "strict" : "standard";

  try {
    const [before, next] = await Promise.all([parseFile(previousFile.name, await previousFile.arrayBuffer()), parseFile(file.name, await file.arrayBuffer())]);

    // Le fichier précédent doit être celui de la version en cours, reconnu par son empreinte.
    if (dashboard.source_fingerprint && sourceFingerprint(before, organization.id) !== dashboard.source_fingerprint) {
      const when = dateFormat.format(new Date(dashboard.updated_at ?? dashboard.created_at));
      return Response.json(
        {
          error: `« ${previousFile.name} » n'est pas le fichier de la version en cours (« ${dashboard.file_name} », du ${when}). Chargez ce fichier, ou le fichier fusionné téléchargé lors du dernier ajout.`,
        },
        { status: 409 },
      );
    }

    // Même contrôle de compatibilité qu'une mise à jour (US-02) : rien n'est modifié si une colonne manque.
    const problems = compatibilityProblems(previous.spec, previous.profile, profileDataset(next).profile);
    if (problems.length > 0) return Response.json({ error: `Le nouveau fichier n'est pas compatible avec le dashboard : ${problems.join(" ; ")}.` }, { status: 400 });

    const { dataset, summary } = mergeDatasets({ ...before, fileName: mergedFileName(dashboard.file_name) }, next, keep);
    const changes = summary.added + (keep === "new" ? summary.modified : 0);

    if (step === "download") {
      return new Response(cleanedCsv(dataset), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(dataset.fileName)}`,
          "Cache-Control": "no-store",
        },
      });
    }

    // Les corrections du contrôle qualité enregistrées sur le dashboard sont rejouées sur le résultat fusionné.
    const result = await recomputeDashboard({ previous, source: dataset, filters: NO_FILTERS, mode, organizationId: organization.id, allowAi: step === "apply" });

    if (step === "preview") {
      const preview: MergePreview = { summary, before: snapshot(previous), after: snapshot(result), unverified: !dashboard.source_fingerprint };
      return Response.json({ preview });
    }

    if (changes === 0) return Response.json({ error: "Aucune ligne nouvelle ou modifiée : le dashboard est déjà à jour." }, { status: 400 });
    const fingerprint = sourceFingerprint(dataset, organization.id);
    // Dashboard créé avant l'historique : sa version d'origine est conservée avant d'être remplacée.
    const { count } = await supabase.from("dashboard_versions").select("id", { count: "exact", head: true }).eq("dashboard_id", id);
    if (count === 0) await saveVersion(workspace, id, previous, { createdAt: dashboard.updated_at ?? dashboard.created_at, fingerprint: dashboard.source_fingerprint });
    const { error } = await supabase
      .from("dashboards")
      .update({ result: result as unknown as Json, file_name: result.fileName, row_count: result.profile.rowCount, updated_at: new Date().toISOString(), source_fingerprint: fingerprint })
      .eq("id", id);
    if (error) {
      console.error("Ajout de données en échec", error.code);
      return Response.json({ error: "L'ajout n'a pas pu être enregistré : la version précédente reste affichée." }, { status: 500 });
    }
    const label = `Ajout : ${summary.added.toLocaleString("fr-FR")} ligne(s)${keep === "new" && summary.modified > 0 ? `, ${summary.modified.toLocaleString("fr-FR")} modifiée(s)` : ""}`;
    await saveVersion(workspace, id, result, { fingerprint, label });
    await logEvent(workspace, "dashboard.data_added", { type: "dashboard", id }, { file: file.name, added: summary.added, modified: summary.modified, ignored: summary.alreadyPresent, rows: result.profile.rowCount });
    if (result.analysis?.writtenBy === "ai") {
      await supabase.from("ai_calls").insert({
        organization_id: organization.id,
        user_id: user.id,
        dashboard_id: id,
        provider: result.analysis.provider,
        model: result.analysis.model,
        ai_mode: mode,
        input_tokens: result.analysis.inputTokens,
        output_tokens: result.analysis.outputTokens,
      });
    }
    return Response.json({ result, summary });
  } catch (error) {
    if (error instanceof ImportError || error instanceof IncompatibleFileError) return Response.json({ error: error.message }, { status: 400 });
    console.error("Ajout de données en échec", error instanceof Error ? error.message : error);
    return Response.json({ error: "Une erreur inattendue est survenue. Réessayez." }, { status: 500 });
  }
}
