import { describe, expect, it } from "vitest";
import type { ComputedChart } from "@/lib/engine/compute";
import { essentialHidden, mergePreferences, preferencesFromView, PreferencesSchema, STANDARD_PREFERENCES, viewFromPreferences } from "./preferences";
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
    expect(prefs).toEqual({ ...STANDARD_PREFERENCES, layout: "compact", grouping: "free", chartSize: "s", evolutionType: "bar", breakdownType: "pie", hideSuggestions: true, scope: ["c:"] });
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
    expect(view.hiddenCharts).toEqual([]);
    expect(view.hiddenCategories).toEqual({});
  });

  it("affichage standard sans réglage enregistré ou avec un réglage invalide (petit dashboard : rien à alléger)", () => {
    expect(isDefaultView(viewFromPreferences(null, charts))).toBe(true);
    expect(isDefaultView(viewFromPreferences({ layout: "geant" }, charts))).toBe(true);
    expect(PreferencesSchema.safeParse({ ...STANDARD_PREFERENCES, breakdownType: "radar" }).success).toBe(false);
  });
});

// Dashboard complet : 9 indicateurs, 2 évolutions, ventilations de 2 mesures par 7 dimensions, comptages.
const kpi = (id: string, formula: string) => ({ id, formula });
const big = {
  kpis: [
    kpi("ca", "Somme(Montant vente HT)"),
    kpi("marge", "Somme(Marge)"),
    ...["Qté", "Montant achat", "Montant vente", "Montant marge", "Montant Marge", "Taux Marge"].map((c, i) => kpi(`k${i}`, `Somme(${c})`)),
    kpi("lignes", "Nombre de lignes"),
    kpi("articles", "Nombre distinct(Libellé article)"),
  ],
  charts: [
    { id: "evo-ca", chronological: true, formula: "Somme(Montant vente HT) par Date (month)", measureLabel: "Montant vente HT" },
    { id: "evo-marge", chronological: true, formula: "Somme(Marge) par Date (month)", measureLabel: "Marge" },
    { id: "evo-qte", chronological: true, formula: "Somme(Qté) par Date (month)", measureLabel: "Qté" },
    ...["Rayon", "Famille", "Site", "Marque", "Département", "Promo", "Article"].flatMap((d) => [
      { id: `ca-${d}`, chronological: false, formula: `Somme(Montant vente HT) par ${d}`, measureLabel: "Montant vente HT" },
      { id: `marge-${d}`, chronological: false, formula: `Somme(Marge) par ${d}`, measureLabel: "Marge" },
    ]),
    { id: "lignes-Rayon", chronological: false, formula: "Nombre de lignes par Rayon", measureLabel: "Lignes" },
  ],
};
const asCharts = (list: typeof big.charts) => list.map((c) => ({ ...c, title: c.id, type: "bar", format: "currency", othersCount: 0, data: [] })) as unknown as ComputedChart[];

describe("vue essentielle et masquages retenus", () => {
  it("garde d'office 6 indicateurs, 2 évolutions et la mesure principale par 6 dimensions", () => {
    const hidden = essentialHidden(big.kpis, big.charts);
    expect(big.kpis.filter((k) => !hidden.kpis.includes(k.id)).map((k) => k.id)).toEqual(["ca", "marge", "k0", "k1", "k2", "k3"]);
    const kept = big.charts.filter((c) => !hidden.charts.includes(c.id)).map((c) => c.id);
    expect(kept).toEqual(["evo-ca", "evo-marge", "ca-Rayon", "ca-Famille", "ca-Site", "ca-Marque", "ca-Département", "ca-Promo"]);
    const view = viewFromPreferences(null, asCharts(big.charts), big.kpis);
    expect(view.hiddenKpis).toContain("lignes");
    expect(view.hiddenCharts).toContain("lignes-Rayon");
  });

  it("retient ce que l'utilisateur masque ou réaffiche, par calcul, et l'applique au dashboard suivant", () => {
    const charts = asCharts(big.charts);
    const first = viewFromPreferences(null, charts, big.kpis);
    // Il masque la marge, réaffiche le nombre d'articles distincts.
    const edited = { ...first, hiddenKpis: [...first.hiddenKpis.filter((id) => id !== "articles"), "marge"] };
    const prefs = mergePreferences(null, preferencesFromView(edited, charts, big.kpis));
    expect(prefs.hiddenItems).toContain("k:Somme(Marge)");
    expect(prefs.shownItems).toEqual(["k:Nombre distinct(Libellé article)"]);
    // Nouveau dashboard de même structure, identifiants différents.
    const next = big.kpis.map((k) => ({ ...k, id: `n-${k.id}` }));
    const view = viewFromPreferences(prefs, charts, next);
    expect(view.hiddenKpis).toContain("n-marge");
    expect(view.hiddenKpis).not.toContain("n-articles");
    expect(JSON.stringify(prefs)).not.toMatch(/Express|Bastille|\d{3,}/);
  });

  it("garde les choix faits sur d'autres dashboards", () => {
    const previous = { ...STANDARD_PREFERENCES, hiddenItems: ["k:Somme(Poids)"], shownItems: ["k:Somme(Marge)"] };
    const merged = mergePreferences(previous, { ...STANDARD_PREFERENCES, hiddenItems: ["k:Somme(Marge)"], shownItems: [], scope: ["k:Somme(Marge)"] });
    expect(merged.hiddenItems).toEqual(["k:Somme(Marge)", "k:Somme(Poids)"]);
    expect(merged.shownItems).toEqual([]);
    expect("scope" in merged).toBe(false);
  });
});

describe("vue essentielle : graphiques peu parlants", () => {
  it("écarte les ventilations par code et les évolutions sur une seule période", () => {
    const charts = [
      { id: "evo", chronological: true, formula: "Somme(CA) par Date (month)", measureLabel: "CA", data: [{ category: "2026-09", value: 1 }] },
      { id: "ean", chronological: false, formula: "Somme(CA) par EAN", measureLabel: "CA", dimension: "EAN" },
      { id: "num", chronological: false, formula: "Somme(CA) par N° commande", measureLabel: "CA", dimension: "N° commande" },
      { id: "rayon", chronological: false, formula: "Somme(CA) par Libellé rayon", measureLabel: "CA", dimension: "Libellé rayon" },
    ];
    expect(essentialHidden([], charts as never).charts).toEqual(["evo", "ean", "num"]);
  });
});
