import { z } from "zod";
import type { ComputedChart } from "@/lib/engine/compute";
import { allowedChartTypes, EMPTY_VIEW, type ChartSize, type ChartType, type ViewState } from "@/lib/view";

// Affichage habituel d'un utilisateur (US-13) : seulement des réglages indépendants du fichier. Aucune valeur
// (catégorie, nom de client, montant) ni aucun identifiant d'indicateur ou de graphique n'y figure.

export const PreferencesSchema = z.object({
  layout: z.enum(["standard", "compact"]).default("standard"),
  grouping: z.enum(["sections", "free"]).default("sections"),
  /** Taille par défaut des graphiques (absente : celle de la mise en page). */
  chartSize: z.enum(["s", "m", "l"]).nullable().default(null),
  /** Type préféré pour les évolutions (graphiques chronologiques) et pour les répartitions. */
  evolutionType: z.enum(["line", "bar", "table"]).nullable().default(null),
  breakdownType: z.enum(["bar", "pie", "table"]).nullable().default(null),
  hideInsights: z.boolean().default(false),
  hideAnalysis: z.boolean().default(false),
  hideExplanations: z.boolean().default(false),
  hideSuggestions: z.boolean().default(false),
});

export type Preferences = z.infer<typeof PreferencesSchema>;

export const STANDARD_PREFERENCES: Preferences = PreferencesSchema.parse({});

/** Valeur la plus fréquente (la première rencontrée en cas d'égalité), ou null. */
function mostFrequent<T>(values: T[]): T | null {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | null = null;
  let bestCount = 0;
  for (const [v, n] of counts) if (n > bestCount) [best, bestCount] = [v, n];
  return best;
}

/** Réglages à retenir pour les prochains dashboards, déduits de l'affichage d'un dashboard. */
export function preferencesFromView(view: ViewState, charts: Pick<ComputedChart, "id" | "chronological">[]): Preferences {
  const chosen = (chronological: boolean) => charts.filter((c) => !!c.chronological === chronological).flatMap((c) => (view.chartTypes[c.id] ? [view.chartTypes[c.id]] : []));
  const evolution = mostFrequent(chosen(true));
  const breakdown = mostFrequent(chosen(false));
  return {
    layout: view.layout,
    grouping: view.grouping,
    chartSize: mostFrequent(Object.values(view.chartSizes)),
    evolutionType: evolution === "pie" ? null : evolution,
    breakdownType: breakdown === "line" ? null : breakdown,
    hideInsights: view.hideInsights,
    hideAnalysis: view.hideAnalysis,
    hideExplanations: view.hideExplanations,
    hideSuggestions: view.hideSuggestions,
  };
}

/** Affichage initial d'un nouveau dashboard d'après les réglages habituels (types non pertinents ignorés). */
export function viewFromPreferences(raw: unknown, charts: ComputedChart[]): ViewState {
  const parsed = PreferencesSchema.safeParse(raw ?? {});
  const p = parsed.success ? parsed.data : STANDARD_PREFERENCES;
  const chartSizes: Record<string, ChartSize> = {};
  const chartTypes: Record<string, ChartType> = {};
  for (const chart of charts) {
    if (p.chartSize) chartSizes[chart.id] = p.chartSize;
    const wanted = chart.chronological ? p.evolutionType : p.breakdownType;
    if (wanted && wanted !== chart.type && allowedChartTypes(chart).includes(wanted)) chartTypes[chart.id] = wanted;
  }
  return {
    ...EMPTY_VIEW,
    layout: p.layout,
    grouping: p.grouping,
    chartSizes,
    chartTypes,
    hideInsights: p.hideInsights,
    hideAnalysis: p.hideAnalysis,
    hideExplanations: p.hideExplanations,
    hideSuggestions: p.hideSuggestions,
  };
}
