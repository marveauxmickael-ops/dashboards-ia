import type { Aggregation, Chart, DashboardSpec, Insight, Kpi, Measure } from "@/lib/ai/spec";
import type { DatasetProfile, TypedRow } from "@/lib/types";
import { aggregate, groupRows } from "./aggregate";
import { inScope } from "@/lib/ingest/scopes";

// Validation de la spécification produite par l'IA, puis calcul de chaque valeur sur les vraies données.

export type ValueFormat = Measure["format"];

export interface ComputedKpi {
  id: string;
  label: string;
  description: string;
  value: number | null;
  format: ValueFormat;
  formula: string;
  /** Qualité des données (US-03) : lignes sans valeur ou non numériques, ignorées dans le calcul. */
  quality?: { column: string; missing: number; invalid: number }[];
}

export interface ComputedChart {
  id: string;
  type: Chart["type"];
  title: string;
  measureLabel: string;
  format: ValueFormat;
  formula: string;
  chronological: boolean;
  /** Colonne de regroupement (absente des dashboards créés avant la complétion automatique). */
  dimension?: string;
  data: { category: string; value: number | null }[];
  /** Catégories regroupées sous « Autres » (au-delà de la limite). */
  othersCount: number;
  /** Catégories masquées par l'utilisateur (personnalisation de l'affichage, exports). */
  maskedCount?: number;
}

export type InsightStatus = "verified" | "mismatch" | "unverified" | "qualitative";

export interface CheckedInsight {
  text: string;
  status: InsightStatus;
  details: string[];
}

const AGG_LABEL: Record<Aggregation, string> = {
  sum: "Somme",
  avg: "Moyenne",
  min: "Minimum",
  max: "Maximum",
  count: "Nombre",
  count_distinct: "Nombre distinct",
};

/** Retire de la spécification tout élément qui référence une colonne ou une mesure inconnue. */
export function validateSpec(spec: DashboardSpec, profile: DatasetProfile): { spec: DashboardSpec; issues: string[] } {
  const issues: string[] = [];
  const usable = new Map(profile.columns.filter((c) => c.role !== "ignored").map((c) => [c.name, c]));

  const measures: Measure[] = [];
  const measureIds = new Set<string>();
  for (const m of spec.measures) {
    if (m.id === "rows" || measureIds.has(m.id)) {
      issues.push(`Mesure « ${m.label} » ignorée : identifiant ${m.id} déjà utilisé.`);
      continue;
    }
    if (m.column !== null) {
      if (!usable.has(m.column)) {
        issues.push(`Mesure « ${m.label} » ignorée : colonne « ${m.column} » inconnue ou exclue.`);
        continue;
      }
    } else if (!m.operation || !m.left || !m.right || !measureIds.has(m.left) || !measureIds.has(m.right)) {
      issues.push(`Mesure dérivée « ${m.label} » ignorée : elle doit combiner deux mesures déjà définies.`);
      continue;
    }
    measures.push(m);
    measureIds.add(m.id);
  }
  const byId = new Map(measures.map((m) => [m.id, m]));

  const measureOk = (measureId: string, aggregation: Aggregation, what: string): boolean => {
    if (measureId === "rows") {
      if (aggregation !== "count") {
        issues.push(`${what} ignoré : seul un comptage est possible sur les lignes.`);
        return false;
      }
      return true;
    }
    const m = byId.get(measureId);
    if (!m) {
      issues.push(`${what} ignoré : mesure « ${measureId} » inconnue.`);
      return false;
    }
    if (m.column === null && aggregation !== "sum") {
      issues.push(`${what} ignoré : une mesure dérivée se calcule sur des sommes.`);
      return false;
    }
    if (m.column !== null && ["sum", "avg", "min", "max"].includes(aggregation) && usable.get(m.column)?.role !== "measure") {
      issues.push(`${what} ignoré : « ${m.column} » n'est pas une colonne numérique.`);
      return false;
    }
    return true;
  };

  const kpis = spec.kpis.filter((k) => measureOk(k.measure, k.aggregation, `KPI « ${k.label} »`));
  const charts = spec.charts.filter((c) => {
    const col = usable.get(c.dimension);
    if (!col || col.role === "measure") {
      issues.push(`Graphique « ${c.title} » ignoré : « ${c.dimension} » n'est pas une dimension utilisable.`);
      return false;
    }
    if (col.role === "date" && c.granularity === null) {
      issues.push(`Graphique « ${c.title} » ignoré : une granularité est nécessaire pour une date.`);
      return false;
    }
    return measureOk(c.measure, c.aggregation, `Graphique « ${c.title} »`);
  });

  return { spec: { ...spec, measures, kpis, charts }, issues };
}

/** Calcule la valeur d'une mesure (de base ou dérivée) sur un ensemble de lignes. */
export function measureEvaluator(spec: DashboardSpec) {
  const byId = new Map(spec.measures.map((m) => [m.id, m]));
  const valueOf = (list: TypedRow[], measureId: string, aggregation: Aggregation): number | null => {
    if (measureId === "rows") return list.length;
    const m = byId.get(measureId)!;
    if (m.column !== null) return aggregate(list.map((r) => r[m.column!]), aggregation);
    const left = valueOf(list, m.left!, "sum");
    const right = valueOf(list, m.right!, "sum");
    if (left === null || right === null) return null;
    if (m.operation === "difference") return Math.round((left - right) * 1e6) / 1e6;
    return right === 0 ? null : left / right;
  };
  return valueOf;
}

export function computeDashboard(spec: DashboardSpec, rows: TypedRow[], profile: DatasetProfile) {
  const byId = new Map(spec.measures.map((m) => [m.id, m]));
  const dateColumns = new Set(profile.columns.filter((c) => c.role === "date").map((c) => c.name));
  const valueOf = measureEvaluator(spec);

  const formulaOf = (measureId: string, aggregation: Aggregation): string => {
    if (measureId === "rows") return "Nombre de lignes";
    const m = byId.get(measureId)!;
    if (m.column !== null) return `${AGG_LABEL[aggregation]}(${m.column})`;
    const sign = m.operation === "difference" ? " − " : " ÷ ";
    const operand = (id: string) => (byId.get(id)?.column === null ? `(${formulaOf(id, "sum")})` : formulaOf(id, "sum"));
    return `${operand(m.left!)}${sign}${operand(m.right!)}`;
  };

  const formatOf = (measureId: string, aggregation: Aggregation): ValueFormat =>
    measureId === "rows" || aggregation === "count" || aggregation === "count_distinct"
      ? "number"
      : byId.get(measureId)!.format;

  // Colonnes sources d'une mesure (une mesure dérivée remonte à ses deux opérandes).
  const columnsOf = (measureId: string): string[] => {
    if (measureId === "rows") return [];
    const m = byId.get(measureId)!;
    return m.column !== null ? [m.column] : [...new Set([...columnsOf(m.left!), ...columnsOf(m.right!)])];
  };
  const invalidByColumn = new Map(profile.columns.map((c) => [c.name, c.invalid]));
  // Une valeur absente ou illisible n'est jamais remplacée par zéro : elle est ignorée et signalée.
  const qualityOf = (measureId: string) =>
    columnsOf(measureId)
      // Fichiers reliés : une ligne de l'autre fichier n'a pas cette colonne, ce n'est pas une valeur manquante.
      .map((column) => ({ column, missing: rows.filter((r) => r[column] === null && inScope(profile.scopes, r, column)).length, invalid: invalidByColumn.get(column) ?? 0 }))
      .filter((q) => q.missing > 0 || q.invalid > 0);

  const kpis: ComputedKpi[] = spec.kpis.map((k: Kpi) => {
    const quality = qualityOf(k.measure);
    return {
      id: k.id,
      label: k.label,
      description: k.description,
      value: valueOf(rows, k.measure, k.aggregation),
      format: formatOf(k.measure, k.aggregation),
      formula: formulaOf(k.measure, k.aggregation),
      ...(quality.length > 0 ? { quality } : {}),
    };
  });

  const charts: ComputedChart[] = spec.charts.map((c) => {
    const chronological = dateColumns.has(c.dimension);
    let data = [...groupRows(rows, c.dimension, chronological ? c.granularity : null)].map(([category, list]) => ({
      category,
      value: valueOf(list, c.measure, c.aggregation),
    }));
    let othersCount = 0;
    if (chronological) {
      data.sort((a, b) => a.category.localeCompare(b.category));
    } else {
      data.sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
      const limit = c.limit ?? (c.type === "pie" ? 6 : 12);
      if (data.length > limit) {
        othersCount = data.length - limit;
        data = data.slice(0, limit);
      }
    }
    return {
      id: c.id,
      type: c.type,
      title: c.title,
      measureLabel: c.measure === "rows" ? "Lignes" : byId.get(c.measure)!.label,
      format: formatOf(c.measure, c.aggregation),
      formula: `${formulaOf(c.measure, c.aggregation)} par ${c.dimension}${c.granularity && chronological ? ` (${c.granularity})` : ""}`,
      chronological,
      dimension: c.dimension,
      data,
      othersCount,
    };
  });

  return { kpis, charts };
}

/**
 * Vérifie chaque chiffre cité par l'IA contre le calcul du moteur.
 * `resolveCategory` ré-identifie un jeton cité (ex. CLIENT_a3f91c02) en valeur en clair.
 */
export function checkInsights(
  insights: Insight[],
  kpis: ComputedKpi[],
  charts: ComputedChart[],
  resolveCategory: (category: string) => string,
): (CheckedInsight & { citationsChecked: number })[] {
  const kpiById = new Map(kpis.map((k) => [k.id, k]));
  const chartById = new Map(charts.map((c) => [c.id, c]));

  return insights.map((insight) => {
    const details: string[] = [];
    let mismatch = false;
    for (const cit of insight.citations) {
      let actual: number | null | undefined;
      let format: ValueFormat = "number";
      if (cit.kpi) {
        const k = kpiById.get(cit.kpi);
        actual = k?.value;
        format = k?.format ?? "number";
      } else if (cit.chart && cit.category !== null) {
        const ch = chartById.get(cit.chart);
        const pointValue = (c: string) => ch?.data.find((d) => d.category === resolveCategory(c))?.value;
        if (cit.compare_to) {
          const current = pointValue(cit.category);
          const reference = pointValue(cit.compare_to);
          actual = current == null || reference == null || reference === 0 ? undefined : (current - reference) / Math.abs(reference);
          format = "percent";
        } else {
          actual = pointValue(cit.category);
          format = ch?.format ?? "number";
        }
      }
      if (actual === undefined || actual === null) {
        mismatch = true;
        details.push(`Valeur ${cit.value} : élément cité introuvable dans le calcul.`);
      } else if (!close(cit.value, actual, format)) {
        mismatch = true;
        details.push(`Valeur citée ${cit.value}, valeur calculée ${round(actual)}.`);
      }
    }
    const hasDigits = /\d/.test(insight.text.replace(/\b[A-Z][A-Z0-9_]*_[0-9a-f]{8,12}\b/g, ""));
    const status: InsightStatus = mismatch
      ? "mismatch"
      : insight.citations.length > 0
        ? "verified"
        : hasDigits
          ? "unverified"
          : "qualitative";
    return { text: insight.text, status, details, citationsChecked: insight.citations.length };
  });
}

function close(cited: number, actual: number, format: ValueFormat): boolean {
  const tolerance = Math.max(Math.abs(actual) * 0.01, 1e-9);
  if (Math.abs(cited - actual) <= tolerance) return true;
  // Un pourcentage peut être cité en points (18,2) plutôt qu'en fraction (0,182).
  return format === "percent" && Math.abs(cited / 100 - actual) <= tolerance;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
