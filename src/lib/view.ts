import { z } from "zod";
import type { AnalysisResult } from "@/lib/analysis";
import type { ComputedChart } from "@/lib/engine/compute";
import type { DashboardResult } from "@/lib/pipeline";

// Personnalisation de l'affichage : l'utilisateur coche les indicateurs, graphiques, catégories
// et sections qu'il veut voir. Les valeurs ne sont jamais recalculées : on masque, on ne modifie pas.
// La même sélection s'applique à l'écran, au PDF et aux exports Excel / CSV.

export type ChartType = ComputedChart["type"];

export const ViewSchema = z.object({
  hiddenKpis: z.array(z.string().max(64)).max(50).default([]),
  hiddenCharts: z.array(z.string().max(64)).max(50).default([]),
  /** Catégories masquées par graphique, par leur valeur (stable quand des filtres changent les données). */
  hiddenCategories: z.record(z.string().max(64), z.array(z.string().max(500)).max(1000)).default({}),
  chartTypes: z.record(z.string().max(64), z.enum(["bar", "line", "pie", "table"])).default({}),
  hideInsights: z.boolean().default(false),
  hideAnalysis: z.boolean().default(false),
  /** Dans l'analyse des variations : constats et hypothèses (explications), pistes d'amélioration (suggestions). */
  hideExplanations: z.boolean().default(false),
  hideSuggestions: z.boolean().default(false),
  /** Comparaison par magasin, rayon, produit… (US-17). */
  hideComparison: z.boolean().default(false),
  /** Mise en page : « compact » resserre tout (indicateurs, graphiques, sections) pour tenir sur un écran ou une page. */
  layout: z.enum(["standard", "compact"]).default("standard"),
  /** Taille de chaque graphique : petit (1/4 de largeur), moyen (1/2), grand (pleine largeur). */
  chartSizes: z.record(z.string().max(64), z.enum(["s", "m", "l"])).default({}),
  /** Graphiques réduits : titre et principales valeurs seulement. */
  collapsedCharts: z.array(z.string().max(64)).max(100).default([]),
  /** Ordre choisi des graphiques (identifiants) ; les autres suivent dans l'ordre d'origine. */
  chartOrder: z.array(z.string().max(64)).max(100).default([]),
  /** Disposition : par sections (évolutions, puis une section par dimension) ou libre (une seule grille, tout se déplace). */
  grouping: z.enum(["sections", "free"]).default("sections"),
});

export type ViewState = z.infer<typeof ViewSchema>;

export const EMPTY_VIEW: ViewState = { hiddenKpis: [], hiddenCharts: [], hiddenCategories: {}, chartTypes: {}, hideInsights: false, hideAnalysis: false, hideExplanations: false, hideSuggestions: false, hideComparison: false, layout: "standard", chartSizes: {}, collapsedCharts: [], chartOrder: [], grouping: "sections" };

/** Affichage enregistré avec le dashboard (colonne `display`) : vue par défaut si absent ou invalide. */
export function parseView(raw: unknown): ViewState {
  const parsed = ViewSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : EMPTY_VIEW;
}

export type ChartSize = "s" | "m" | "l";

/** Taille d'un graphique : choix de l'utilisateur, sinon petit en mise en page compacte et moyen sinon. */
export function chartSizeOf(chartId: string, view: ViewState): ChartSize {
  return view.chartSizes[chartId] ?? (view.layout === "compact" ? "s" : "m");
}

/** Trie des graphiques selon l'ordre choisi par l'utilisateur (stable pour les autres). */
export function orderCharts<T extends { id: string }>(charts: T[], view: ViewState): T[] {
  const rank = new Map(view.chartOrder.map((id, i) => [id, i]));
  return charts
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (rank.get(a.c.id) ?? view.chartOrder.length + a.i) - (rank.get(b.c.id) ?? view.chartOrder.length + b.i))
    .map(({ c }) => c);
}

/** Déplace un graphique d'un cran parmi `siblings` (même section) ; renvoie le nouvel ordre complet. */
export function moveChart(allIds: string[], siblings: string[], id: string, direction: -1 | 1): string[] {
  const i = siblings.indexOf(id);
  const j = i + direction;
  if (i === -1 || j < 0 || j >= siblings.length) return allIds;
  const order = [...allIds];
  const a = order.indexOf(id);
  const b = order.indexOf(siblings[j]);
  [order[a], order[b]] = [order[b], order[a]];
  return order;
}

/**
 * Glisser-déposer : place `id` à l'emplacement de `targetId`. Vers l'avant, il se place après la cible ;
 * vers l'arrière, avant elle (comportement habituel d'une liste réordonnable).
 */
export function placeChart(allIds: string[], id: string, targetId: string): string[] {
  if (id === targetId) return allIds;
  const from = allIds.indexOf(id);
  const to = allIds.indexOf(targetId);
  if (from === -1 || to === -1) return allIds;
  const order = allIds.filter((x) => x !== id);
  order.splice(order.indexOf(targetId) + (from < to ? 1 : 0), 0, id);
  return order;
}

export function isDefaultView(v: ViewState): boolean {
  return (
    v.hiddenKpis.length === 0 &&
    v.hiddenCharts.length === 0 &&
    Object.values(v.hiddenCategories).every((l) => l.length === 0) &&
    Object.keys(v.chartTypes).length === 0 &&
    v.layout === "standard" &&
    Object.keys(v.chartSizes).length === 0 &&
    v.collapsedCharts.length === 0 &&
    v.chartOrder.length === 0 &&
    v.grouping === "sections" &&
    !v.hideInsights &&
    !v.hideAnalysis &&
    !v.hideExplanations &&
    !v.hideSuggestions &&
    !v.hideComparison
  );
}

/** Types de graphique pertinents : courbe pour une série temporelle, secteurs pour des parts positives. */
export function allowedChartTypes(chart: ComputedChart): ChartType[] {
  const positive = chart.data.length > 0 && chart.data.every((d) => d.value === null || d.value >= 0);
  const types: ChartType[] = chart.chronological ? ["line", "bar"] : ["bar"];
  if (!chart.chronological && positive && chart.format !== "percent") types.push("pie");
  types.push("table");
  return types;
}

export function chartTypeOf(chart: ComputedChart, view: ViewState): ChartType {
  const wanted = view.chartTypes[chart.id];
  return wanted && allowedChartTypes(chart).includes(wanted) ? wanted : chart.type;
}

/** Données d'un graphique après masquage des catégories décochées. */
export function visibleData(chart: ComputedChart, view: ViewState) {
  const hidden = new Set(view.hiddenCategories[chart.id] ?? []);
  return chart.data.filter((d) => !hidden.has(d.category));
}

/** Applique la sélection au résultat (exports) : éléments masqués retirés, valeurs inchangées. */
export function applyView(result: DashboardResult, view: ViewState): DashboardResult {
  const hiddenKpis = new Set(view.hiddenKpis);
  const hiddenCharts = new Set(view.hiddenCharts);
  return {
    ...result,
    kpis: result.kpis.filter((k) => !hiddenKpis.has(k.id)),
    charts: orderCharts(result.charts, view)
      .filter((c) => !hiddenCharts.has(c.id))
      .map((c) => {
        const data = visibleData(c, view);
        return { ...c, type: chartTypeOf(c, view), data, maskedCount: c.data.length - data.length };
      }),
    insights: view.hideInsights ? [] : result.insights,
    comparison: view.hideComparison ? null : result.comparison,
    analysis: view.hideAnalysis || !result.analysis ? undefined : analysisView(result.analysis, view),
  };
}

/** Analyse des variations limitée aux parties cochées : chiffres toujours affichés, explications et suggestions au choix. */
export function analysisView(analysis: AnalysisResult, view: ViewState): AnalysisResult {
  return {
    ...analysis,
    insights: analysis.insights.map((i) => ({
      ...i,
      facts: view.hideExplanations ? [] : i.facts,
      hypotheses: view.hideExplanations ? [] : i.hypotheses,
      suggestions: view.hideSuggestions ? [] : i.suggestions,
    })),
  };
}

// Dans l'URL d'export, les catégories masquées sont désignées par leur position dans le dashboard enregistré,
// jamais par leur valeur (noms de clients, etc.), pour qu'elles n'apparaissent pas dans les journaux d'accès.
const ExportViewSchema = ViewSchema.extend({
  hiddenCategories: z.record(z.string().max(64), z.array(z.number().int().min(0).max(1000)).max(1000)).default({}),
});

/** Encodage compact pour l'URL d'export (base64url d'un JSON validé à la lecture). */
export function encodeView(view: ViewState, base: Pick<DashboardResult, "charts">): string {
  const hiddenCategories: Record<string, number[]> = {};
  for (const chart of base.charts) {
    const hidden = new Set(view.hiddenCategories[chart.id] ?? []);
    const positions = chart.data.flatMap((d, i) => (hidden.has(d.category) ? [i] : []));
    if (positions.length > 0) hiddenCategories[chart.id] = positions;
  }
  const bytes = new TextEncoder().encode(JSON.stringify({ ...view, hiddenCategories }));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeView(encoded: string | null, base: Pick<DashboardResult, "charts">): ViewState {
  if (!encoded || encoded.length > 8000) return EMPTY_VIEW;
  try {
    const binary = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
    const json = new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
    const parsed = ExportViewSchema.safeParse(JSON.parse(json));
    if (!parsed.success) return EMPTY_VIEW;
    const hiddenCategories: Record<string, string[]> = {};
    for (const chart of base.charts) {
      const positions = new Set(parsed.data.hiddenCategories[chart.id] ?? []);
      const names = chart.data.flatMap((d, i) => (positions.has(i) ? [d.category] : []));
      if (names.length > 0) hiddenCategories[chart.id] = names;
    }
    return { ...parsed.data, hiddenCategories };
  } catch {
    return EMPTY_VIEW;
  }
}
