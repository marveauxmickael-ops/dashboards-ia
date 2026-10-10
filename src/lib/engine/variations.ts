import type { Aggregation, DashboardSpec } from "@/lib/ai/spec";
import type { DatasetProfile, TypedRow } from "@/lib/types";
import { groupRows } from "./aggregate";
import { measureEvaluator, type ValueFormat } from "./compute";

// Analyse des variations (US-10), entièrement déterministe : détection des hausses et baisses
// significatives, puis décomposition de chaque variation par dimension. L'IA ne fait que rédiger
// l'explication à partir de ces chiffres.

export const DEFAULT_THRESHOLD = 0.1;
const MAX_MEASURES = 4;
const MAX_DIMENSIONS = 4;
const MAX_ITEMS = 5;
const MAX_DIMENSION_VALUES = 100;

export interface DriverItem {
  category: string;
  current: number;
  previous: number;
  delta: number;
  /** Part de la variation totale expliquée par ce segment (fraction, ex. 0,62). */
  share: number;
  rowsCurrent: number;
  rowsPrevious: number;
}

export interface Driver {
  dimension: string;
  items: DriverItem[];
  /** Segments qui évoluent à contre-sens (ex. une région en recul malgré la hausse globale). */
  opposite: DriverItem[];
  /** Part expliquée par le premier segment : plus elle est élevée, plus la cause est localisée. */
  concentration: number;
}

export interface Variation {
  id: string;
  measureId: string;
  measureLabel: string;
  format: ValueFormat;
  dateColumn: string;
  comparison: "previous_period" | "same_period_last_year" | "rolling_quarter";
  period: string;
  previousPeriod: string;
  current: number;
  previous: number;
  delta: number;
  changePct: number;
  direction: "up" | "down";
  drivers: Driver[];
  limitations: string[];
}

export interface VariationReport {
  threshold: number;
  variations: Variation[];
  notes: string[];
}

export function analyzeVariations(
  spec: DashboardSpec,
  rows: TypedRow[],
  profile: DatasetProfile,
  threshold = DEFAULT_THRESHOLD,
): VariationReport {
  const notes: string[] = [];
  const dateColumn = profile.columns.find((c) => c.role === "date")?.name;
  if (!dateColumn) return { threshold, variations: [], notes: ["Aucune colonne de date : l'évolution dans le temps ne peut pas être analysée."] };

  const valueOf = measureEvaluator(spec);
  const byMonth = groupRows(rows, dateColumn, "month");
  let months = [...byMonth.keys()].sort();
  if (months.length < 2) return { threshold, variations: [], notes: ["Moins de deux mois de données : aucune comparaison n'est possible."] };

  // Un dernier mois incomplet comparé à un mois entier créerait une fausse baisse : il est écarté.
  const lastDate = rows.map((r) => r[dateColumn]).filter((v): v is string => typeof v === "string").sort().at(-1)!;
  if (!isMonthComplete(lastDate)) {
    notes.push(`Le mois ${months.at(-1)} est incomplet (données jusqu'au ${formatDay(lastDate)}) : il n'est pas comparé.`);
    months = months.slice(0, -1);
    if (months.length < 2) return { threshold, variations: [], notes };
  }

  const measures = uniqueMeasures(spec).slice(0, MAX_MEASURES);
  const formatOf = new Map(spec.measures.map((m) => [m.id, m.format]));
  const labelOf = new Map(spec.measures.map((m) => [m.id, m.label]));
  const isRatio = new Set(spec.measures.filter((m) => m.operation === "ratio").map((m) => m.id));
  const dimensions = profile.columns
    .filter((c) => c.role === "dimension" && c.distinct >= 2 && c.distinct <= MAX_DIMENSION_VALUES)
    .map((c) => c.name);

  const period = months.at(-1)!;
  const rowsOf = (list: string[]) => list.flatMap((m) => byMonth.get(m) ?? []);
  const comparisons: { kind: Variation["comparison"]; current: string[]; reference: string[] }[] = [
    { kind: "previous_period", current: [period], reference: [months.at(-2)!] },
  ];
  const lastYear = `${Number(period.slice(0, 4)) - 1}${period.slice(4)}`;
  if (byMonth.has(lastYear)) comparisons.push({ kind: "same_period_last_year", current: [period], reference: [lastYear] });
  // Tendance de fond : les 3 derniers mois comparés aux 3 précédents (lisse les effets d'un mois atypique).
  if (months.length >= 6) comparisons.push({ kind: "rolling_quarter", current: months.slice(-3), reference: months.slice(-6, -3) });

  const variations: Variation[] = [];
  for (const { measureId, aggregation } of measures) {
    for (const { kind, current: currentMonths, reference } of comparisons) {
      const currentRows = rowsOf(currentMonths);
      const previousRows = rowsOf(reference);
      const current = valueOf(currentRows, measureId, aggregation);
      const previous = valueOf(previousRows, measureId, aggregation);
      if (current === null || previous === null || previous === 0) continue;
      const delta = round(current - previous);
      const changePct = delta / Math.abs(previous);
      if (Math.abs(changePct) < threshold) continue;

      const limitations: string[] = [];
      let drivers: Driver[] = [];
      if (isRatio.has(measureId)) {
        limitations.push("Un taux ne se décompose pas en contributions additives : seule son évolution globale est présentée.");
      } else if (dimensions.length === 0) {
        limitations.push("Aucune dimension (commercial, région, produit…) ne permet d'expliquer cette variation.");
      } else {
        drivers = dimensions
          .map((dimension) => decompose(dimension, currentRows, previousRows, (list) => valueOf(list, measureId, aggregation), delta))
          .filter((d): d is Driver => d !== null)
          // Une part supérieure à 100 % traduit des compensations entre segments : on la plafonne pour le classement.
          .sort((a, b) => Math.min(b.concentration, 1) - Math.min(a.concentration, 1) || b.items.length - a.items.length)
          .slice(0, MAX_DIMENSIONS);
      }

      variations.push({
        id: `v${variations.length + 1}`,
        measureId,
        measureLabel: measureId === "rows" ? "Nombre de lignes" : labelOf.get(measureId) ?? measureId,
        format: measureId === "rows" || aggregation === "count" ? "number" : formatOf.get(measureId) ?? "number",
        dateColumn,
        comparison: kind,
        period: periodLabel(currentMonths),
        previousPeriod: periodLabel(reference),
        current,
        previous,
        delta,
        changePct,
        direction: delta >= 0 ? "up" : "down",
        drivers,
        limitations,
      });
    }
  }

  if (variations.length === 0) {
    notes.push(`Aucune variation supérieure à ${Math.round(threshold * 100)} % entre ${period} et la période de comparaison.`);
  }
  // Les baisses d'abord : ce sont elles qui appellent une action.
  variations.sort((a, b) => (a.direction === b.direction ? Math.abs(b.changePct) - Math.abs(a.changePct) : a.direction === "down" ? -1 : 1));
  return { threshold, variations, notes };
}

function decompose(
  dimension: string,
  currentRows: TypedRow[],
  previousRows: TypedRow[],
  valueOf: (rows: TypedRow[]) => number | null,
  totalDelta: number,
): Driver | null {
  const current = groupRows(currentRows, dimension, null);
  const previous = groupRows(previousRows, dimension, null);
  const categories = new Set([...current.keys(), ...previous.keys()]);
  if (categories.size < 2 || totalDelta === 0) return null;

  const items: DriverItem[] = [...categories].map((category) => {
    const cur = current.get(category) ?? [];
    const prev = previous.get(category) ?? [];
    const c = cur.length > 0 ? valueOf(cur) ?? 0 : 0;
    const p = prev.length > 0 ? valueOf(prev) ?? 0 : 0;
    const delta = round(c - p);
    return { category, current: c, previous: p, delta, share: delta / totalDelta, rowsCurrent: cur.length, rowsPrevious: prev.length };
  });
  // Dimension tautologique : un seul segment porte toute la mesure (ex. « Vente additionnelle = Oui »
  // pour le CA des ventes additionnelles). Elle n'explique rien.
  if (items.filter((i) => i.current !== 0 || i.previous !== 0).length < 2) return null;
  // Segments qui vont dans le sens de la variation, du plus contributeur au moins contributeur.
  const sorted = items.filter((i) => i.share > 0).sort((a, b) => b.share - a.share).slice(0, MAX_ITEMS);
  if (sorted.length === 0) return null;
  // Segments à contre-sens d'au moins 10 % de leur niveau précédent.
  const opposite = items
    .filter((i) => i.share < 0 && i.previous !== 0 && Math.abs(i.delta / i.previous) >= 0.1)
    .sort((a, b) => a.share - b.share)
    .slice(0, 2);
  return { dimension, items: sorted, opposite, concentration: sorted[0].share };
}

function uniqueMeasures(spec: DashboardSpec): { measureId: string; aggregation: Aggregation }[] {
  const seen = new Set<string>();
  const out: { measureId: string; aggregation: Aggregation }[] = [];
  for (const k of spec.kpis) {
    // Les moyennes, minimums et maximums ne se comparent pas utilement d'un mois à l'autre ici.
    if (!["sum", "count"].includes(k.aggregation) || seen.has(k.measure)) continue;
    seen.add(k.measure);
    out.push({ measureId: k.measure, aggregation: k.aggregation });
  }
  return out;
}

/** « 2026-09 » ou « 2026-07 → 2026-09 » pour une période de plusieurs mois. */
function periodLabel(months: string[]): string {
  return months.length === 1 ? months[0] : `${months[0]} → ${months.at(-1)}`;
}

function isMonthComplete(isoDate: string): boolean {
  const [y, m, d] = isoDate.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d >= daysInMonth - 3;
}

function formatDay(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

