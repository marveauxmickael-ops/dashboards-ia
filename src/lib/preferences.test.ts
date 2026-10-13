import { describe, expect, it } from "vitest";
import type { ComputedChart } from "@/lib/engine/compute";
import { preferencesFromView, PreferencesSchema, STANDARD_PREFERENCES, viewFromPreferences } from "./preferences";
import { EMPTY_VIEW, isDefaultView } from "./view";

const chart = (id: string, chronological: boolean, values = [3, 2, 1]): ComputedChart =>
  ({
    id,
    title: id,
    type: chronological ? "line" : "bar",
    chronological,
    format: "currency",
    formula: "",
    othersCount: 0,
    data: values.map((value, i) => ({ category: `Client ${i}`, value })),
  }) as unknown as ComputedChart;

describe("affichage habituel (US-13)", () => {
  const charts = [chart("evo", true), chart("ventes-region", false), chart("ventes-client", false)];

  it("ne retient que des réglages indépendants du fichier, jamais de valeur", () => {
    const view = {
      ...EMPTY_VIEW,
      layout: "compact" as const,
      grouping: "free" as const,
      hiddenKpis: ["ca"],
      hiddenCategories: { "ventes-client": ["Client 0"] },
      chartTypes: { evo: "bar" as const, "ventes-region": "pie" as const, "ventes-client": "pie" as const },
      chartSizes: { evo: "l" as const, "ventes-region": "s" as const, "ventes-client": "s" as const },
      chartOrder: ["ventes-client", "evo"],
      hideSuggestions: true,
    };
    const prefs = preferencesFromView(view, charts);
    expect(prefs).toEqual({ ...STANDARD_PREFERENCES, layout: "compact", grouping: "free", chartSize: "s", evolutionType: "bar", breakdownType: "pie", hideSuggestions: true });
    const json = JSON.stringify(Object.values(prefs));
    for (const leaked of ["Client", "ca", "evo", "ventes"]) expect(json).not.toContain(leaked);
  });

  it("applique les réglages à un nouveau dashboard, en ignorant les types non pertinents", () => {
    const negative = chart("marge", false, [5, -2]);
    const view = viewFromPreferences({ ...STANDARD_PREFERENCES, layout: "compact", chartSize: "l", breakdownType: "pie", hideInsights: true }, [...charts, negative]);
    expect(view.layout).toBe("compact");
    expect(view.hideInsights).toBe(true);
    expect(view.chartSizes).toEqual({ evo: "l", "ventes-region": "l", "ventes-client": "l", marge: "l" });
    // Secteurs : seulement pour des parts positives, et jamais pour une évolution.
    expect(view.chartTypes).toEqual({ "ventes-region": "pie", "ventes-client": "pie" });
    expect(view.hiddenKpis).toEqual([]);
    expect(view.hiddenCategories).toEqual({});
  });

  it("affichage standard sans réglage enregistré ou avec un réglage invalide", () => {
    expect(isDefaultView(viewFromPreferences(null, charts))).toBe(true);
    expect(isDefaultView(viewFromPreferences({ layout: "geant" }, charts))).toBe(true);
    expect(PreferencesSchema.safeParse({ ...STANDARD_PREFERENCES, breakdownType: "radar" }).success).toBe(false);
  });
});
