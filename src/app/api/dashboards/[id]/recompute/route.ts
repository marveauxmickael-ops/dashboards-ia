import { canEdit, getWorkspace } from "@/lib/auth/session";
import { FiltersSchema, NO_FILTERS } from "@/lib/filters";
import { ImportError, MAX_FILE_BYTES } from "@/lib/ingest/parse";
import { IncompatibleFileError, recomputeDashboard, type DashboardResult } from "@/lib/pipeline";
import type { Json } from "@/lib/supabase/database.types";

export const maxDuration = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Recalcul d'un dashboard enregistré sur le fichier source, sans nouvelle conception par l'IA :
// - action « filter » : vue filtrée, rien n'est enregistré, aucun appel à l'IA ;
// - action « reimport » (US-08) : nouveau fichier de même structure, le dashboard enregistré est mis à jour.
// Le fichier n'est jamais conservé.
export async function POST(request: Request, { params }: RouteContext<"/api/dashboards/[id]/recompute">) {
  const { id } = await params;
  if (!UUID.test(id)) return Response.json({ error: "Dashboard introuvable." }, { status: 404 });

  const workspace = await getWorkspace();
  if (!workspace) return Response.json({ error: "Votre session a expiré. Reconnectez-vous." }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Requête invalide." }, { status: 400 });
  }
  const file = form.get("file");
  const action = form.get("action") === "reimport" ? "reimport" : "filter";
  if (!(file instanceof File)) return Response.json({ error: "Aucun fichier reçu." }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) return Response.json({ error: "Le fichier dépasse 20 Mo." }, { status: 413 });
  if (action === "reimport" && !canEdit(workspace.role)) {
    return Response.json({ error: "Votre rôle (lecteur) ne permet pas de mettre à jour un dashboard." }, { status: 403 });
  }

  let filters = NO_FILTERS;
  if (action === "filter") {
    try {
      const parsed = FiltersSchema.safeParse(JSON.parse(String(form.get("filters") ?? "{}")));
      if (!parsed.success) return Response.json({ error: "Filtres invalides." }, { status: 400 });
      filters = parsed.data;
    } catch {
      return Response.json({ error: "Filtres invalides." }, { status: 400 });
    }
  }

  const { supabase, user, organization } = workspace;
  const { data: dashboard } = await supabase.from("dashboards").select("id, ai_mode, result").eq("id", id).maybeSingle();
  if (!dashboard) return Response.json({ error: "Dashboard introuvable." }, { status: 404 });
  const mode = dashboard.ai_mode === "strict" ? "strict" : "standard";

  let result: DashboardResult;
  try {
    result = await recomputeDashboard({
      previous: dashboard.result as unknown as DashboardResult,
      fileName: file.name,
      data: await file.arrayBuffer(),
      filters,
      mode,
      organizationId: organization.id,
      allowAi: action === "reimport",
    });
  } catch (error) {
    if (error instanceof ImportError || error instanceof IncompatibleFileError) return Response.json({ error: error.message }, { status: 400 });
    console.error("Recalcul du dashboard en échec", error instanceof Error ? error.message : error);
    return Response.json({ error: "Une erreur inattendue est survenue. Réessayez." }, { status: 500 });
  }

  if (action === "reimport") {
    const { error } = await supabase
      .from("dashboards")
      .update({ result: result as unknown as Json, file_name: result.fileName, row_count: result.profile.rowCount, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("Mise à jour du dashboard en échec", error.code);
      return Response.json({ error: "La mise à jour n'a pas pu être enregistrée." }, { status: 500 });
    }
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
  }

  return Response.json({ result });
}
