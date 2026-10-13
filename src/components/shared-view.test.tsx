import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { generateDashboard, type DashboardResult } from "@/lib/pipeline";
import { applyView, EMPTY_VIEW, parseView } from "@/lib/view";
import { DashboardWorkspace } from "./dashboard-workspace";

// Lien partagé : la fonction shared_dashboard retire aiContext, spec, filterOptions et issues du résultat.
// L'affichage doit fonctionner sans ces champs (régression : « This page couldn't load »).
async function demo() {
  const b = readFileSync(path.resolve(import.meta.dirname, "../../public/demo/ventes-demo.csv"));
  return generateDashboard({ fileName: "ventes.csv", data: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, mode: "standard", organizationId: "org-1" });
}

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

describe("dashboard partagé", () => {
  it("conserve l'affichage choisi par l'éditeur, sans commandes de personnalisation", async () => {
    const full = await demo();
    const [hiddenKpi, keptKpi] = full.kpis;
    const chart = full.charts.find((c) => !c.chronological && c.data.length > 2)!;
    const hiddenCategory = chart.data[0].category;
    const view = parseView({ ...EMPTY_VIEW, hiddenKpis: [hiddenKpi.id], hiddenCategories: { [chart.id]: [hiddenCategory] }, layout: "compact", hideInsights: true });
    // Comme loadSharedDashboard : l'affichage est appliqué sur le serveur avant l'envoi au navigateur.
    const result = applyView(full, view);
    expect(result.kpis.map((k) => k.id)).not.toContain(hiddenKpi.id);
    expect(result.charts.find((c) => c.id === chart.id)!.data.map((d) => d.category)).not.toContain(hiddenCategory);
    const html = renderToString(<DashboardWorkspace initial={result} exportable={false} tools={false} fixedView={view} />);
    expect(html).not.toContain(escape(hiddenKpi.label));
    expect(html).toContain(escape(keptKpi.label));
    expect(html).not.toContain("Personnaliser l");
    expect(html).not.toContain("Masquer l");
    expect(html).not.toContain(">Constats<");
    expect(html).toContain("lg:grid-cols-6"); // mise en page compacte
  });

  it("affiche le dashboard complet si aucun affichage n'est enregistré ou s'il est invalide", () => {
    expect(parseView({})).toEqual(EMPTY_VIEW);
    expect(parseView(null)).toEqual(EMPTY_VIEW);
    expect(parseView({ layout: "geant" })).toEqual(EMPTY_VIEW);
  });

  it("s'affiche sans les champs retirés par la fonction de partage", async () => {
    const b = readFileSync(path.resolve(import.meta.dirname, "../../public/demo/ventes-demo.csv"));
    const full = await generateDashboard({ fileName: "ventes.csv", data: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, mode: "standard", organizationId: "org-1" });
    const shared = { ...full } as Partial<DashboardResult>;
    for (const key of ["aiContext", "spec", "filterOptions", "issues"] as const) delete shared[key];
    const html = renderToString(<DashboardWorkspace initial={shared as DashboardResult} exportable={false} tools={false} />);
    expect(html).toContain("dashboard-print-root");
    expect(html).toContain(full.title.replace("'", "&#x27;"));
  });
});
