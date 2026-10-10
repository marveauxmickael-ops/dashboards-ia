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
  /** Catégories masquées par graphique, désignées par leur position (jamais par leur nom dans l'URL). */
  hiddenCategories: z.record(z.string().max(64), z.array(z.number().int().min(0).max(1000)).max(1000)).default({}),
  chartTypes: z.record(z.string().max(64), z.enum(["bar", "line", "pie", "table"])).default({}),
  hideInsights: z.boolean().default(false),
  hideAnalysis: z.boolean().default(false),
  /** Dans l'analyse des variations : constats et hypothèses (explications), pistes d'amélioration (suggestions). */
  hideExplanations: z.boolean().default(false),
  hideSuggestions: z.boolean().default(false),
});

export type ViewState = z.infer<typeof ViewSchema>;

export const EMPTY_VIEW: ViewState = { hiddenKpis: [], hiddenCharts: [], hiddenCategories: {}, chartTypes: {}, hideInsights: false, hideAnalysis: false, hideExplanations: false, hideSuggestions: false };

export function isDefaultView(v: ViewState): boolean {
  return (
    v.hiddenKpis.length === 0 &&
    v.hiddenCharts.length === 0 &&
    Object.values(v.hiddenCategories).every((l) => l.length === 0) &&
    Object.keys(v.chartTypes).length === 0 &&
    !v.hideInsights &&
    !v.hideAnalysis &&
    !v.hideExplanations &&
    !v.hideSuggestions
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
  return chart.data.filter((_, i) => !hidden.has(i));
}

/** Applique la sélection au résultat (exports) : éléments masqués retirés, valeurs inchangées. */
export function applyView(result: DashboardResult, view: ViewState): DashboardResult {
  const hiddenKpis = new Set(view.hiddenKpis);
  const hiddenCharts = new Set(view.hiddenCharts);
  return {
    ...result,
    kpis: result.kpis.filter((k) => !hiddenKpis.has(k.id)),
    charts: result.charts
      .filter((c) => !hiddenCharts.has(c.id))
      .map((c) => {
        const data = visibleData(c, view);
        return { ...c, type: chartTypeOf(c, view), data, maskedCount: c.data.length - data.length };
      }),
    insights: view.hideInsights ? [] : result.insights,
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

/** Encodage compact pour l'URL d'export (base64url d'un JSON validé à la lecture). */
export function encodeView(view: ViewState): string {
  const bytes = new TextEncoder().encode(JSON.stringify(view));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeView(encoded: string | null): ViewState {
  if (!encoded || encoded.length > 8000) return EMPTY_VIEW;
  try {
    const binary = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
    const json = new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
    const parsed = ViewSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : EMPTY_VIEW;
  } catch {
    return EMPTY_VIEW;
  }
}
