import type { Aggregation, Chart, DashboardSpec, Kpi, Measure } from "@/lib/ai/spec";
import type { ColumnProfile, DatasetProfile } from "@/lib/types";

// Complétion déterministe du dashboard : après la conception par l'IA (indicateurs clés, mesures dérivées),
// le moteur ajoute tous les indicateurs et graphiques que les colonnes du fichier permettent de calculer.
// Rien n'est inventé : chaque ajout est une agrégation standard d'une colonne existante.
// L'utilisateur masque ensuite ce qui ne l'intéresse pas (personnalisation de l'affichage).

export const MAX_KPIS = 18;
export const MAX_CHARTS = 48;
/** Mesures ventilées sur toutes les dimensions ; les suivantes le sont sur les dimensions courtes uniquement. */
const MAIN_MEASURES = 3;
const SHORT_DIMENSION = 20;
/** Au-delà, une dimension ressemble à un identifiant (une valeur par ligne) : pas de ventilation. */
const MAX_DIMENSION_VALUES = 200;
const MAX_TREND_MEASURES = 6;

const MONEY = /chiffre|\bca\b|montant|prix|co[uû]t|marge|achat|charge|vente|revenu|€|\bht\b|\bttc\b|eur/i;
/** Colonnes dont la somme n'a pas de sens (taux, prix unitaires, notes…) : agrégées par moyenne. */
const NON_ADDITIVE = /taux|%|pourcent|ratio|unitaire|moyen|note|score|[âa]ge\b|remise|d[ée]lai|dur[ée]e|temp[ée]rature|anciennet/i;
const PERCENT = /taux|%|pourcent|ratio/i;

/**
 * Format d'une mesure tirée d'une colonne : pourcentage si les valeurs sont des fractions (0,37),
 * nombre suivi de « (%) » si elles sont déjà en points (37), montant pour les colonnes monétaires.
 */
function columnMeasure(m: Measure, column: ColumnProfile | undefined): Measure {
  if (!column || !PERCENT.test(column.name)) return m;
  if (column.percentScale === "points") return { ...m, format: "number", label: m.label.includes("%") ? m.label : `${m.label} (%)` };
  return { ...m, format: "percent" };
}

export function isAdditiveColumn(name: string): boolean {
  return !NON_ADDITIVE.test(name);
}

export function completeSpec(spec: DashboardSpec, profile: DatasetProfile): DashboardSpec {
  const usable = profile.columns.filter((c) => c.role !== "ignored");
  const dates = usable.filter((c) => c.role === "date");
  const dims = usable
    .filter((c) => c.role === "dimension" && c.distinct >= 2 && c.distinct <= MAX_DIMENSION_VALUES && c.distinct < profile.rowCount)
    // Classifications (région, produit…) d'abord, puis les longues listes (clients), puis les oui / non.
    .sort((a, b) => dimensionRank(a) - dimensionRank(b) || a.distinct - b.distinct);

  // 1. Une mesure de base pour chaque colonne numérique que l'IA n'a pas reprise.
  const columnByName = new Map(profile.columns.map((c) => [c.name, c]));
  const measures: Measure[] = spec.measures.map((m) => (m.column ? columnMeasure(m, columnByName.get(m.column)) : m));
  const withColumn = new Set(measures.filter((m) => m.column !== null).map((m) => m.column));
  let n = 0;
  const nextId = (prefix: string, taken: Set<string>) => {
    let id = `${prefix}${++n}`;
    while (taken.has(id)) id = `${prefix}${++n}`;
    taken.add(id);
    return id;
  };
  const measureIds = new Set(measures.map((m) => m.id));
  for (const c of usable.filter((c) => c.role === "measure" && !withColumn.has(c.name))) {
    measures.push(columnMeasure({
      id: nextId("auto_m", measureIds),
      label: c.name,
      column: c.name,
      operation: null,
      left: null,
      right: null,
      format: MONEY.test(c.name) ? "currency" : "number",
    }, c));
  }

  // Agrégation pertinente par mesure : somme pour les montants et quantités, moyenne pour les taux et prix unitaires.
  const aggregationOf = (m: Measure): Aggregation => (m.column === null || isAdditiveColumn(m.column) ? "sum" : "avg");
  const labelOf = (m: Measure) => m.label;

  // Ordre de priorité : mesures déjà en KPI (choix de l'IA), puis les autres dans l'ordre du fichier.
  const kpiOrder = spec.kpis.map((k) => k.measure);
  const ranked = [...measures].sort((a, b) => rank(kpiOrder, a.id) - rank(kpiOrder, b.id));

  // 2. Indicateurs : un par mesure, le nombre de lignes, et un comptage distinct par dimension.
  const kpis: Kpi[] = [...spec.kpis];
  const kpiIds = new Set(kpis.map((k) => k.id));

  // Fichiers reliés (US-15) : le montant principal de l'autre fichier rapporté à celui du fichier principal
  // (ex. démarque / CA HT), juste après le premier indicateur. Un taux que seul le rapprochement rend calculable.
  const link = linkedRatio(profile, measures);
  let linkMeasure: Measure | null = null;
  if (link && !measures.some((m) => m.operation === "ratio" && m.left === link.other.id && m.right === link.main.id)) {
    const id = nextId("link_m", measureIds);
    linkMeasure = { id, label: `${link.other.label} / ${link.main.label}`, column: null, operation: "ratio", left: link.other.id, right: link.main.id, format: "percent" };
    measures.push(linkMeasure);
    kpis.splice(Math.min(1, kpis.length), 0, {
      id: nextId("link_k", kpiIds),
      label: `${link.other.label} / ${link.main.label}`,
      description: `Somme de ${link.other.label} (${link.otherSource}) rapportée à la somme de ${link.main.label} (${link.mainSource}), sur les mêmes filtres.`,
      measure: id,
      aggregation: "sum",
    });
  }
  const hasKpi = (measure: string, aggregation: Aggregation) => kpis.some((k) => k.measure === measure && k.aggregation === aggregation);
  for (const m of ranked) {
    const aggregation = aggregationOf(m);
    if (kpis.some((k) => k.measure === m.id) || kpis.length >= MAX_KPIS) continue;
    kpis.push({
      id: nextId("auto_k", kpiIds),
      label: aggregation === "avg" ? `${labelOf(m)} (moyenne)` : m.column === null ? labelOf(m) : `${labelOf(m)} total`,
      description: aggregation === "avg" ? `Moyenne de ${labelOf(m)} sur les lignes du fichier.` : `Somme de ${labelOf(m)} sur la période.`,
      measure: m.id,
      aggregation,
    });
  }
  placeTaxIncluded(kpis, measures);
  if (!hasKpi("rows", "count") && kpis.length < MAX_KPIS) {
    kpis.push({ id: nextId("auto_k", kpiIds), label: "Nombre de lignes", description: "Nombre d'enregistrements dans le fichier.", measure: "rows", aggregation: "count" });
  }
  // Comptages distincts pour les entités suivies (clients, commerciaux, produits…), pas pour les petites classifications.
  for (const d of dims.filter((x) => x.treatment === "tokenize" || x.distinct >= 10)) {
    if (kpis.length >= MAX_KPIS) break;
    let m = measures.find((x) => x.column === d.name);
    if (!m) {
      m = { id: nextId("auto_m", measureIds), label: d.name, column: d.name, operation: null, left: null, right: null, format: "number" };
      measures.push(m);
    }
    if (hasKpi(m.id, "count_distinct")) continue;
    kpis.push({
      id: nextId("auto_k", kpiIds),
      label: `${d.name} (nombre distinct)`,
      description: `Nombre de valeurs différentes de ${d.name} dans le fichier.`,
      measure: m.id,
      aggregation: "count_distinct",
    });
  }

  // 3. Graphiques : évolutions dans le temps, puis ventilation de chaque mesure par chaque dimension.
  const charts: Chart[] = [...spec.charts];
  const chartIds = new Set(charts.map((c) => c.id));
  const seen = new Set(charts.map((c) => `${c.dimension}|${c.measure}|${c.aggregation}`));
  const add = (chart: Omit<Chart, "id">) => {
    const key = `${chart.dimension}|${chart.measure}|${chart.aggregation}`;
    if (seen.has(key) || charts.length >= MAX_CHARTS) return;
    seen.add(key);
    charts.push({ id: nextId("auto_c", chartIds), ...chart });
  };
  const chartMeasures = ranked.filter((m) => m.column === null || measureColumn(usable, m)?.role === "measure");
  // Fichiers reliés : une mesure n'est ventilée que par une colonne présente sur les lignes du même fichier.
  const sourcesOf = (column: string): string[] => profile.scopes?.applies[column] ?? profile.scopes?.sources ?? [];
  const byId = new Map(measures.map((m) => [m.id, m]));
  const measureSources = (m: Measure): string[] =>
    m.column !== null ? sourcesOf(m.column) : [...new Set([...measureSources(byId.get(m.left!)!), ...measureSources(byId.get(m.right!)!)])];
  const compatible = (m: Measure, d: ColumnProfile) => !profile.scopes || measureSources(m).every((s) => sourcesOf(d.name).includes(s));

  for (const date of dates) {
    for (const m of chartMeasures.slice(0, MAX_TREND_MEASURES)) {
      const aggregation = aggregationOf(m);
      add({ type: "line", title: `Évolution mensuelle — ${labelOf(m)}`, dimension: date.name, granularity: "month", measure: m.id, aggregation, limit: null });
    }
    add({ type: "bar", title: "Nombre de lignes par mois", dimension: date.name, granularity: "month", measure: "rows", aggregation: "count", limit: null });
  }

  // Taux entre fichiers reliés, par dimension courte (rayon, famille…) : identifiants « link_c », gardés dans la vue essentielle.
  if (linkMeasure) {
    for (const d of dims.filter((x) => x.distinct <= SHORT_DIMENSION && compatible(linkMeasure!, x)).slice(0, 4)) {
      const key = `${d.name}|${linkMeasure.id}|sum`;
      if (seen.has(key) || charts.length >= MAX_CHARTS) continue;
      seen.add(key);
      charts.push({ id: nextId("link_c", chartIds), type: "bar", title: `${linkMeasure.label} par ${d.name}`, dimension: d.name, granularity: null, measure: linkMeasure.id, aggregation: "sum", limit: 12 });
    }
  }

  // Ventilations : les mesures principales sur toutes les dimensions, les autres sur les dimensions courtes.
  const breakdown = (m: Measure, d: ColumnProfile) => {
    if (!compatible(m, d)) return;
    const aggregation = aggregationOf(m);
    const pie = m === chartMeasures[0] && d.distinct <= 6 && aggregation === "sum" && m.format !== "percent" && m.column !== null;
    add({
      type: pie ? "pie" : "bar",
      title: `${labelOf(m)}${aggregation === "avg" ? " moyen" : ""} par ${d.name}`,
      dimension: d.name,
      granularity: null,
      measure: m.id,
      aggregation,
      limit: pie ? null : 12,
    });
  };
  for (const d of dims) for (const m of chartMeasures.slice(0, MAIN_MEASURES)) breakdown(m, d);
  for (const m of chartMeasures.slice(MAIN_MEASURES)) for (const d of dims.filter((x) => x.distinct <= SHORT_DIMENSION)) breakdown(m, d);
  for (const d of dims) add({ type: "bar", title: `Nombre de lignes par ${d.name}`, dimension: d.name, granularity: null, measure: "rows", aggregation: "count", limit: 12 });

  return { ...spec, measures, kpis, charts };
}

/** Montant principal propre à chaque fichier relié : celui des ventes (HT de préférence), sinon le premier montant. */
function linkedRatio(profile: DatasetProfile, measures: Measure[]) {
  const scopes = profile.scopes;
  if (!scopes || scopes.sources.length < 2) return null;
  const roles = new Map(profile.columns.map((c) => [c.name, c.role]));
  const leadOf = (source: string) => {
    const own = measures.filter(
      (m) => m.column !== null && roles.get(m.column) === "measure" && scopes.applies[m.column]?.length === 1 && scopes.applies[m.column][0] === source && MONEY.test(m.column) && isAdditiveColumn(m.column),
    );
    const sales = own.filter((m) => /vente|chiffre|\bca\b|revenu/i.test(m.column!));
    return sales.find((m) => /\bht\b/i.test(m.column!)) ?? sales[0] ?? own[0] ?? null;
  };
  const main = leadOf(scopes.sources[0]);
  const other = leadOf(scopes.sources[1]);
  return main && other ? { main, other, mainSource: scopes.sources[0], otherSource: scopes.sources[1] } : null;
}

function dimensionRank(c: ColumnProfile): number {
  if (c.distinct <= 2) return 2;
  return c.distinct > SHORT_DIMENSION ? 1 : 0;
}

function rank(order: string[], id: string): number {
  const i = order.indexOf(id);
  return i === -1 ? order.length : i;
}

function measureColumn(columns: ColumnProfile[], m: Measure): ColumnProfile | undefined {
  return m.column === null ? undefined : columns.find((c) => c.name === m.column);
}

/**
 * Montant TTC (« Montant vente TTC ») : juste après son HT (et le taux entre fichiers reliés), pour qu'ils se lisent ensemble
 * et que la vue essentielle les affiche tous les deux.
 */
function placeTaxIncluded(kpis: Kpi[], measures: Measure[]) {
  const columnOf = (k: Kpi) => (k.aggregation === "sum" ? measures.find((m) => m.id === k.measure)?.column ?? null : null);
  for (const ttc of kpis.filter((k) => / TTC$/.test(columnOf(k) ?? ""))) {
    const base = columnOf(ttc)!.slice(0, -" TTC".length);
    const isHt = (k: Kpi) => (columnOf(k) ?? "").toLowerCase() === `${base} ht`.toLowerCase();
    if (!kpis.some(isHt)) continue;
    kpis.splice(kpis.indexOf(ttc), 1);
    // Le taux entre fichiers reliés garde sa place, juste après le premier indicateur.
    let at = kpis.findIndex(isHt) + 1;
    while (kpis[at]?.id.startsWith("link_k")) at++;
    kpis.splice(at, 0, ttc);
  }
}
