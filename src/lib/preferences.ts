import { z } from "zod";
import type { ComputedChart, ComputedKpi } from "@/lib/engine/compute";
import { allowedChartTypes, EMPTY_VIEW, SHRINKAGE_PARTS, type ChartSize, type ChartType, type ViewState } from "@/lib/view";

// Affichage habituel d'un utilisateur (US-13) : seulement des réglages indépendants du fichier. Aucune valeur
// (catégorie, nom de client, montant) ni aucun identifiant d'indicateur ou de graphique n'y figure.
// Les éléments masqués ou réaffichés sont retenus par leur calcul (« Somme(Montant achat) », « … par Libellé marque ») :
// des noms de colonnes, jamais des valeurs. Ils s'appliquent à tout dashboard qui contient le même calcul.

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
  /** Comparaison (US-17) et démarque (US-18) : sections et éléments de la démarque masqués d'un dashboard à l'autre. */
  hideComparison: z.boolean().default(false),
  hideShrinkage: z.boolean().default(false),
  shrinkageHidden: z.array(z.enum(SHRINKAGE_PARTS)).max(SHRINKAGE_PARTS.length).default([]),
  /** Vue essentielle d'office : indicateurs et graphiques principaux, le reste dans « Personnaliser l'affichage ». */
  essential: z.boolean().default(true),
  /** Calculs masqués (« k:Somme(Montant achat) », « c:Somme(Montant achat) par Libellé marque »). */
  hiddenItems: z.array(z.string().max(300)).max(400).default([]),
  /** Calculs réaffichés alors que la vue essentielle les masquerait. */
  shownItems: z.array(z.string().max(300)).max(400).default([]),
});

/** Mise à jour des réglages depuis un dashboard : `scope` liste les calculs de ce dashboard (fusion, voir `mergePreferences`). */
export const PreferencesUpdateSchema = PreferencesSchema.extend({ scope: z.array(z.string().max(300)).max(400).default([]) });
export type PreferencesUpdate = z.infer<typeof PreferencesUpdateSchema>;

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

type KpiLike = Pick<ComputedKpi, "id" | "formula">;
type ChartLike = Pick<ComputedChart, "id" | "chronological" | "formula" | "measureLabel"> & Partial<Pick<ComputedChart, "dimension" | "data">>;

/** Clé d'un indicateur ou d'un graphique : son calcul, identique d'un fichier de même structure à l'autre. */
export const kpiKey = (k: Pick<ComputedKpi, "formula">) => `k:${k.formula}`;
export const chartKey = (c: Pick<ComputedChart, "formula">) => `c:${c.formula}`;

const ESSENTIAL_KPIS = 6;
const ESSENTIAL_TRENDS = 2;
const ESSENTIAL_BREAKDOWNS = 6;
const COUNTS = /^Nombre (de lignes|distinct\()/;
/** Codes et identifiants (EAN, référence…) : utiles en filtre, pas en ventilation d'office. */
const CODE_DIMENSION = /(^|[\s_(-])(code|ean|id|r[ée]f|r[ée]f[ée]rence|n°|num[ée]ro)(?=$|[\s_).:-])/i;

/**
 * Vue essentielle d'un nouveau dashboard : les 6 premiers indicateurs (choix de l'IA d'abord), hors simples comptages ;
 * les 2 premières évolutions et la mesure principale ventilée par 6 dimensions au plus. Le reste est masqué, pas supprimé.
 */
export function essentialHidden(kpis: KpiLike[], charts: ChartLike[]): { kpis: string[]; charts: string[] } {
  const keptKpis = kpis.filter((k) => !COUNTS.test(k.formula)).slice(0, ESSENTIAL_KPIS).map((k) => k.id);
  const counted = (c: ChartLike) => COUNTS.test(c.formula);
  // Une évolution sur une seule période n'apprend rien : elle reste disponible, pas affichée d'office.
  const trends = charts.filter((c) => c.chronological && !counted(c) && (c.data === undefined || c.data.length >= 2)).slice(0, ESSENTIAL_TRENDS);
  const lead = charts.find((c) => !counted(c))?.measureLabel;
  const breakdowns = charts
    .filter((c) => !c.chronological && !counted(c) && c.measureLabel === lead && !CODE_DIMENSION.test(c.dimension ?? ""))
    .slice(0, ESSENTIAL_BREAKDOWNS);
  // Taux entre fichiers reliés (US-15) : la raison d'être du rapprochement, toujours affichés.
  const linked = charts.filter((c) => c.id.startsWith("link_c")).slice(0, 4);
  const keptCharts = new Set([...trends, ...linked, ...breakdowns].map((c) => c.id));
  // Au moins un graphique : un fichier sans mesure ne garde que ses comptages.
  if (keptCharts.size === 0 && charts[0]) keptCharts.add(charts[0].id);
  return { kpis: kpis.filter((k) => !keptKpis.includes(k.id)).map((k) => k.id), charts: charts.filter((c) => !keptCharts.has(c.id)).map((c) => c.id) };
}

/** Réglages à retenir pour les prochains dashboards, déduits de l'affichage d'un dashboard. */
export function preferencesFromView(view: ViewState, charts: ChartLike[], kpis: KpiLike[] = []): PreferencesUpdate {
  const essential = essentialHidden(kpis, charts);
  const hiddenKpis = new Set(view.hiddenKpis);
  const hiddenCharts = new Set(view.hiddenCharts);
  const hiddenItems: string[] = [];
  const shownItems: string[] = [];
  const track = (key: string, hidden: boolean, essentialHides: boolean) => {
    if (hidden) hiddenItems.push(key);
    else if (essentialHides) shownItems.push(key);
  };
  for (const k of kpis) track(kpiKey(k), hiddenKpis.has(k.id), essential.kpis.includes(k.id));
  for (const c of charts) track(chartKey(c), hiddenCharts.has(c.id), essential.charts.includes(c.id));
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
    hideComparison: view.hideComparison,
    hideShrinkage: view.hideShrinkage,
    shrinkageHidden: view.shrinkageHidden,
    essential: true,
    hiddenItems: [...new Set(hiddenItems)],
    shownItems: [...new Set(shownItems)],
    scope: [...new Set([...kpis.map(kpiKey), ...charts.map(chartKey)])],
  };
}

/**
 * Fusion avec les réglages déjà enregistrés : les calculs de ce dashboard (`scope`) prennent l'état choisi ici,
 * ceux des autres dashboards gardent le leur. Les listes sont bornées (les plus récents d'abord).
 */
export function mergePreferences(previous: unknown, update: PreferencesUpdate): Preferences {
  const parsed = PreferencesSchema.safeParse(previous ?? {});
  const before = parsed.success ? parsed.data : STANDARD_PREFERENCES;
  const scope = new Set(update.scope);
  const keep = (list: string[], fresh: string[]) => [...new Set([...fresh, ...list.filter((x) => !scope.has(x))])].slice(0, 400);
  const { scope: _scope, ...rest } = update;
  void _scope;
  return { ...rest, hiddenItems: keep(before.hiddenItems, update.hiddenItems), shownItems: keep(before.shownItems, update.shownItems) };
}

/** Affichage initial d'un nouveau dashboard d'après les réglages habituels (types non pertinents ignorés). */
export function viewFromPreferences(raw: unknown, charts: ComputedChart[], kpis: KpiLike[] = []): ViewState {
  const parsed = PreferencesSchema.safeParse(raw ?? {});
  const p = parsed.success ? parsed.data : STANDARD_PREFERENCES;
  // Masquage : choix retenu pour ce calcul, sinon vue essentielle (si active).
  const essential = p.essential ? essentialHidden(kpis, charts) : { kpis: [], charts: [] };
  const hidden = new Set(p.hiddenItems);
  const shown = new Set(p.shownItems);
  const hides = (key: string, essentialHides: boolean) => hidden.has(key) || (essentialHides && !shown.has(key));
  const hiddenKpis = kpis.filter((k) => hides(kpiKey(k), essential.kpis.includes(k.id))).map((k) => k.id);
  const hiddenCharts = charts.filter((c) => hides(chartKey(c), essential.charts.includes(c.id))).map((c) => c.id);
  const chartSizes: Record<string, ChartSize> = {};
  const chartTypes: Record<string, ChartType> = {};
  for (const chart of charts) {
    if (p.chartSize) chartSizes[chart.id] = p.chartSize;
    const wanted = chart.chronological ? p.evolutionType : p.breakdownType;
    if (wanted && wanted !== chart.type && allowedChartTypes(chart).includes(wanted)) chartTypes[chart.id] = wanted;
  }
  return {
    ...EMPTY_VIEW,
    hiddenKpis,
    hiddenCharts,
    layout: p.layout,
    grouping: p.grouping,
    chartSizes,
    chartTypes,
    hideInsights: p.hideInsights,
    hideAnalysis: p.hideAnalysis,
    hideExplanations: p.hideExplanations,
    hideSuggestions: p.hideSuggestions,
    hideComparison: p.hideComparison,
    hideShrinkage: p.hideShrinkage,
    shrinkageHidden: p.shrinkageHidden,
  };
}
