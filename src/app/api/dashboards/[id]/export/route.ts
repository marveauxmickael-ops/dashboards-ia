import type { NextRequest } from "next/server";
import { withTitle } from "@/lib/dashboards/title";
import { logEvent } from "@/lib/audit";
import { getWorkspace } from "@/lib/auth/session";
import { buildCsv, buildXlsx, exportFileName } from "@/lib/export/dashboard-export";
import type { DashboardResult } from "@/lib/pipeline";
import { applyView, decodeView } from "@/lib/view";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Téléchargement d'un dashboard enregistré. La lecture passe par la session de l'utilisateur :
// la RLS empêche d'exporter le dashboard d'une autre organisation.
export async function GET(request: NextRequest, { params }: RouteContext<"/api/dashboards/[id]/export">) {
  const { id } = await params;
  const format = request.nextUrl.searchParams.get("format") === "csv" ? "csv" : "xlsx";
  if (!UUID.test(id)) return Response.json({ error: "Dashboard introuvable." }, { status: 404 });

  const workspace = await getWorkspace();
  if (!workspace) return Response.json({ error: "Votre session a expiré. Reconnectez-vous." }, { status: 401 });

  const { data: dashboard } = await workspace.supabase
    .from("dashboards")
    .select("title, ai_mode, result, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!dashboard) return Response.json({ error: "Dashboard introuvable." }, { status: 404 });

  // L'export reprend la sélection affichée à l'écran (éléments cochés), sans modifier aucune valeur.
  const saved = withTitle(dashboard.result as unknown as DashboardResult, dashboard.title);
  const result = applyView(saved, decodeView(request.nextUrl.searchParams.get("vue"), saved));
  const meta = { organization: workspace.organization.name, createdAt: new Date(dashboard.created_at), exportedAt: new Date(), aiMode: dashboard.ai_mode, branding: workspace.organization.branding };
  const fileName = exportFileName(dashboard.title, meta.exportedAt, format);
  const headers = {
    "Content-Disposition": `attachment; filename="${fileName}"`,
    "Cache-Control": "private, no-store",
  };

  await logEvent(workspace, "dashboard.exported", { type: "dashboard", id }, { format });
  if (format === "csv") {
    return new Response(buildCsv(result, meta), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } });
  }
  const xlsx = await buildXlsx(result, meta);
  return new Response(new Uint8Array(xlsx), {
    headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  });
}
