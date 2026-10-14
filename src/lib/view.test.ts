import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateDashboard } from "@/lib/pipeline";
import { applyView, decodeView, dropInSection, EMPTY_VIEW, encodeView, isDefaultView, placeChart, type ViewState } from "./view";

const demo = readFileSync(path.resolve(import.meta.dirname, "../../public/demo/ventes-demo.csv"), "utf-8");

async function demoResult() {
  const data = new TextEncoder().encode(demo).buffer as ArrayBuffer;
  return generateDashboard({ fileName: "ventes-demo.csv", data, mode: "standard", organizationId: "org-1" });
}

describe("personnalisation de l'affichage", () => {
  it("masque sans modifier les valeurs", async () => {
    const result = await demoResult();
    const chart = result.charts.find((c) => c.data.length >= 3)!;
    const view: ViewState = {
      ...EMPTY_VIEW,
      hiddenKpis: [result.kpis[0].id],
      hiddenCharts: [result.charts.find((c) => c.id !== chart.id)!.id],
      hiddenCategories: { [chart.id]: [chart.data[0].category, chart.data[2].category] },
      chartTypes: { [chart.id]: "table" },
      hideSuggestions: true,
    };
    const shown = applyView(result, view);
    expect(shown.kpis.map((k) => k.id)).not.toContain(result.kpis[0].id);
    expect(shown.kpis[0].value).toBe(result.kpis[1].value);
    const filtered = shown.charts.find((c) => c.id === chart.id)!;
    expect(filtered.type).toBe("table");
    expect(filtered.data).toEqual(chart.data.filter((_, i) => i !== 0 && i !== 2));
    expect(filtered.maskedCount).toBe(2);
    expect(shown.charts).toHaveLength(result.charts.length - 1);
    for (const insight of shown.analysis?.insights ?? []) expect(insight.suggestions).toEqual([]);
    expect(shown.analysis?.insights.map((i) => i.facts)).toEqual(result.analysis?.insights.map((i) => i.facts));
  });

  it("encode la sélection pour l'URL d'export par positions, sans les noms, et rejette une valeur invalide", async () => {
    const result = await demoResult();
    const chart = result.charts.find((c) => c.data.length >= 3)!;
    const view: ViewState = { ...EMPTY_VIEW, hiddenCharts: ["c_é"], hiddenCategories: { [chart.id]: [chart.data[1].category] }, hideExplanations: true };
    const encoded = encodeView(view, result);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(atob(encoded.replace(/-/g, "+").replace(/_/g, "/"))).not.toContain(chart.data[1].category);
    expect(decodeView(encoded, result)).toEqual(view);
    expect(isDefaultView(decodeView("pas-du-base64!", result))).toBe(true);
    expect(isDefaultView(decodeView(encodeView({ ...EMPTY_VIEW, chartTypes: { c1: "radar" } } as unknown as ViewState, result), result))).toBe(true);
  });

  it("place un graphique déposé avant ou après la cible selon le sens du déplacement", () => {
    const ids = ["a", "b", "c", "d"];
    expect(placeChart(ids, "a", "c")).toEqual(["b", "c", "a", "d"]);
    expect(placeChart(ids, "d", "b")).toEqual(["a", "d", "b", "c"]);
    expect(placeChart(ids, "b", "b")).toEqual(ids);
    expect(placeChart(ids, "x", "b")).toEqual(ids);
  });
});

describe("déposer un graphique dans un espace libre", () => {
  const ids = ["evo", "rayon-ca", "famille-ca", "fichier-ca"];
  it("le place en fin d'une autre section et le retient", () => {
    const v = dropInSection(EMPTY_VIEW, ids, "fichier-ca", { title: "Par Libellé rayon", ids: ["rayon-ca"] }, "Par Fichier");
    expect(v.chartSections).toEqual({ "fichier-ca": "Par Libellé rayon" });
    expect(v.chartOrder).toEqual(["evo", "rayon-ca", "fichier-ca", "famille-ca"]);
    expect(isDefaultView(v)).toBe(false);
  });
  it("prend la place du graphique sur lequel il est déposé", () => {
    const v = dropInSection(EMPTY_VIEW, ids, "fichier-ca", { title: "Par Libellé rayon", ids: ["rayon-ca"] }, "Par Fichier", "rayon-ca");
    expect(v.chartOrder).toEqual(["evo", "fichier-ca", "rayon-ca", "famille-ca"]);
  });
  it("revenu dans sa section, il n'est plus noté comme déplacé", () => {
    const moved = dropInSection(EMPTY_VIEW, ids, "fichier-ca", { title: "Par Libellé rayon", ids: ["rayon-ca"] }, "Par Fichier");
    const back = dropInSection(moved, moved.chartOrder, "fichier-ca", { title: "Par Fichier", ids: ["fichier-ca"] }, "Par Fichier");
    expect(back.chartSections).toEqual({});
  });
});
