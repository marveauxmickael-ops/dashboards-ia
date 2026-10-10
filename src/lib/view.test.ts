import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateDashboard } from "@/lib/pipeline";
import { applyView, decodeView, EMPTY_VIEW, encodeView, isDefaultView, type ViewState } from "./view";

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
      hiddenCategories: { [chart.id]: [0, 2] },
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

  it("encode la sélection pour l'URL d'export et rejette une valeur invalide", () => {
    const view: ViewState = { ...EMPTY_VIEW, hiddenCharts: ["c_é"], hiddenCategories: { c1: [1] }, hideExplanations: true };
    const encoded = encodeView(view);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeView(encoded)).toEqual(view);
    expect(isDefaultView(decodeView("pas-du-base64!"))).toBe(true);
    expect(isDefaultView(decodeView(encodeView({ ...EMPTY_VIEW, chartTypes: { c1: "radar" } } as unknown as ViewState)))).toBe(true);
  });
});
