import { getWorkspace } from "@/lib/auth/session";
import { ImportError, MAX_FILE_BYTES } from "@/lib/ingest/parse";
import { askDashboardQuestion, IncompatibleFileError, type DashboardResult } from "@/lib/pipeline";
import { QuestionError } from "@/lib/questions";

export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Question en langage naturel (US-07) sur le fichier source d'un dashboard enregistré.
// L'IA ne reçoit que la question pseudonymisée et la structure du fichier ; le fichier n'est pas conservé.
export async function POST(request: Request, { params }: RouteContext<"/api/dashboards/[id]/question">) {
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
  const question = String(form.get("question") ?? "");
  if (!(file instanceof File)) return Response.json({ error: "Aucun fichier reçu." }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) return Response.json({ error: "Le fichier dépasse 20 Mo." }, { status: 413 });

  const { supabase, organization, user } = workspace;
  const { data: dashboard } = await supabase.from("dashboards").select("ai_mode, result").eq("id", id).maybeSingle();
  if (!dashboard) return Response.json({ error: "Dashboard introuvable." }, { status: 404 });
  const mode = dashboard.ai_mode === "strict" ? "strict" : "standard";

  try {
    const answer = await askDashboardQuestion({
      previous: dashboard.result as unknown as DashboardResult,
      fileName: file.name,
      data: await file.arrayBuffer(),
      question,
      mode,
      organizationId: organization.id,
    });
    if (answer.interpretedBy === "ai") {
      await supabase.from("ai_calls").insert({
        organization_id: organization.id,
        user_id: user.id,
        dashboard_id: id,
        provider: answer.provider,
        model: answer.model,
        ai_mode: mode,
        input_tokens: answer.inputTokens,
        output_tokens: answer.outputTokens,
      });
    }
    return Response.json({ answer });
  } catch (error) {
    if (error instanceof ImportError || error instanceof IncompatibleFileError || error instanceof QuestionError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error("Question en échec", error instanceof Error ? error.message : error);
    return Response.json({ error: "Une erreur inattendue est survenue. Réessayez." }, { status: 500 });
  }
}
