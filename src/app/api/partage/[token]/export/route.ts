import type { NextRequest } from "next/server";
import { parseBranding } from "@/lib/branding";
import { loadSharedDashboard } from "@/lib/dashboards/shared";
import { buildCsv, buildXlsx, exportFileName } from "@/lib/export/dashboard-export";

// Téléchargement depuis un lien partagé, seulement si son niveau d'accès l'autorise.
export async function GET(request: NextRequest, { params }: RouteContext<"/api/partage/[token]/export">) {
  const { token } = await params;
  const shared = await loadSharedDashboard(token);
  if (!shared || shared.access !== "view_export") return Response.json({ error: "Lien indisponible." }, { status: 404 });

  const format = request.nextUrl.searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const meta = { organization: shared.organization, createdAt: new Date(shared.refreshed_at), exportedAt: new Date(), aiMode: "standard", branding: parseBranding(shared.branding) };
  const headers = {
    "Content-Disposition": `attachment; filename="${exportFileName(shared.title, meta.exportedAt, format)}"`,
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
  };
  if (format === "csv") return new Response(buildCsv(shared.result, meta), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } });
  const xlsx = await buildXlsx(shared.result, meta);
  return new Response(new Uint8Array(xlsx), { headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } });
}
