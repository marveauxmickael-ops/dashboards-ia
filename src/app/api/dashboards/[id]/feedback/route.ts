import { z } from "zod";
import { getWorkspace } from "@/lib/auth/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FeedbackSchema = z.object({
  variationId: z.string().min(1).max(120),
  suggestionIndex: z.number().int().min(0).max(20),
  useful: z.boolean(),
});

// Avis « utile / pas utile » sur une piste d'amélioration (US-10). Écriture sous la RLS de l'utilisateur :
// le dashboard doit appartenir à son organisation, un nouvel avis remplace le précédent.
export async function POST(request: Request, { params }: RouteContext<"/api/dashboards/[id]/feedback">) {
  const { id } = await params;
  if (!UUID.test(id)) return Response.json({ error: "Dashboard introuvable." }, { status: 404 });

  const workspace = await getWorkspace();
  if (!workspace) return Response.json({ error: "Votre session a expiré. Reconnectez-vous." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Requête invalide." }, { status: 400 });
  }
  const parsed = FeedbackSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Requête invalide." }, { status: 400 });

  const { supabase, user, organization } = workspace;
  const { error } = await supabase.from("analysis_feedback").upsert(
    {
      organization_id: organization.id,
      dashboard_id: id,
      user_id: user.id,
      variation_id: parsed.data.variationId,
      suggestion_index: parsed.data.suggestionIndex,
      useful: parsed.data.useful,
      created_at: new Date().toISOString(),
    },
    { onConflict: "dashboard_id,user_id,variation_id,suggestion_index" },
  );
  if (error) {
    console.error("Enregistrement de l'avis en échec", error.code);
    return Response.json({ error: "Avis non enregistré." }, { status: 400 });
  }
  return Response.json({ ok: true });
}
