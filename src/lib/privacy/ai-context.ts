import { aggregate, groupRows } from "@/lib/engine/aggregate";
import type { AiMode, ColumnProfile, DatasetProfile, TypedRow } from "@/lib/types";
import type { Pseudonymizer } from "./pseudonymize";

// Construit le contexte envoyé à l'IA. C'est la seule donnée qui quitte le backend :
// aucune valeur en clair d'une colonne identifiante, aucun identifiant direct, aucun petit groupe.

/** En dessous de ce nombre de lignes, un groupe n'est pas transmis (risque de ré-identification). */
export const MIN_GROUP_SIZE = 5;
const MAX_GROUPS = 15;
const SAMPLE_SIZE = 15;
const MAX_BREAKDOWN_DIMENSIONS = 6;

export interface AiColumn {
  name: string;
  type: ColumnProfile["type"];
  role: ColumnProfile["role"];
  values: "jetons" | "en clair";
  distinct: number;
  missing: number;
}

export interface AiContext {
  mode: AiMode;
  rowCount: number;
  columns: AiColumn[];
  /** Mode standard uniquement. */
  dateRanges?: Record<string, { min: string; max: string }>;
  measures?: Record<string, { sum: number | null; avg: number | null; min: number | null; max: number | null }>;
  breakdowns?: Breakdown[];
  timeSeries?: TimeSeries[];
  sample?: Record<string, string | number | null>[];
}

export interface Breakdown {
  dimension: string;
  measure: string;
  groups: { category: string; rows: number; sum: number | null }[];
  /** Groupes de moins de MIN_GROUP_SIZE lignes ou au-delà du top, fusionnés. */
  others: { groups: number; rows: number; sum: number | null } | null;
}

export interface TimeSeries {
  date: string;
  measure: string;
  granularity: "month";
  points: { period: string; rows: number; sum: number | null }[];
}

export function buildAiContext(
  profile: DatasetProfile,
  rows: TypedRow[],
  mode: AiMode,
  pseudo: Pseudonymizer,
): AiContext {
  const usable = profile.columns.filter((c) => c.role !== "ignored");
  const ctx: AiContext = {
    mode,
    rowCount: profile.rowCount,
    columns: usable.map((c) => ({
      name: c.name,
      type: c.type,
      role: c.role,
      values: c.treatment === "tokenize" ? "jetons" : "en clair",
      distinct: c.distinct,
      missing: c.missing,
    })),
  };
  if (mode === "strict") return ctx;

  const byName = new Map(usable.map((c) => [c.name, c]));
  const label = (column: string, value: string) =>
    byName.get(column)?.treatment === "tokenize" ? pseudo.tokenize(column, value) : value;

  const dates = usable.filter((c) => c.role === "date");
  const measures = usable.filter((c) => c.role === "measure");
  const dimensions = usable
    .filter((c) => c.role === "dimension")
    .sort((a, b) => a.distinct - b.distinct)
    .slice(0, MAX_BREAKDOWN_DIMENSIONS);

  ctx.dateRanges = {};
  for (const d of dates) {
    const values = rows.map((r) => r[d.name]).filter((v): v is string => typeof v === "string").sort();
    if (values.length > 0) ctx.dateRanges[d.name] = { min: values[0], max: values[values.length - 1] };
  }

  ctx.measures = {};
  for (const m of measures) {
    const values = rows.map((r) => r[m.name]);
    ctx.measures[m.name] = {
      sum: aggregate(values, "sum"),
      avg: aggregate(values, "avg"),
      min: aggregate(values, "min"),
      max: aggregate(values, "max"),
    };
  }

  ctx.breakdowns = [];
  for (const dim of dimensions) {
    const groups = [...groupRows(rows, dim.name, null)];
    for (const m of measures.length > 0 ? measures.slice(0, 3) : [null]) {
      const measureName = m?.name ?? "rows";
      const stats = groups.map(([category, groupRowsList]) => ({
        category,
        rows: groupRowsList.length,
        sum: m ? aggregate(groupRowsList.map((r) => r[m.name]), "sum") : groupRowsList.length,
      }));
      const shown = stats
        .filter((s) => s.rows >= MIN_GROUP_SIZE)
        .sort((a, b) => (b.sum ?? 0) - (a.sum ?? 0))
        .slice(0, MAX_GROUPS);
      const shownKeys = new Set(shown.map((s) => s.category));
      const rest = stats.filter((s) => !shownKeys.has(s.category));
      ctx.breakdowns.push({
        dimension: dim.name,
        measure: measureName,
        groups: shown.map((s) => ({ ...s, category: label(dim.name, s.category) })),
        others:
          rest.length > 0
            ? othersSummary(rest)
            : null,
      });
    }
  }

  ctx.timeSeries = [];
  if (dates.length > 0) {
    const date = dates[0];
    const periods = [...groupRows(rows, date.name, "month")].sort(([a], [b]) => a.localeCompare(b));
    for (const m of measures.slice(0, 3)) {
      ctx.timeSeries.push({
        date: date.name,
        measure: m.name,
        granularity: "month",
        points: periods.map(([period, list]) => ({
          period,
          rows: list.length,
          // Une période trop peu fournie révélerait des transactions individuelles.
          sum: list.length >= MIN_GROUP_SIZE ? aggregate(list.map((r) => r[m.name]), "sum") : null,
        })),
      });
    }
  }

  ctx.sample = rows.slice(0, SAMPLE_SIZE).map((r) => {
    const out: Record<string, string | number | null> = {};
    for (const c of usable) {
      const v = r[c.name];
      out[c.name] = v !== null && c.treatment === "tokenize" ? pseudo.tokenize(c.name, String(v)) : v;
    }
    return out;
  });

  return ctx;
}

function othersSummary(rest: { rows: number; sum: number | null }[]): NonNullable<Breakdown["others"]> {
  const rows = rest.reduce((n, s) => n + s.rows, 0);
  return { groups: rest.length, rows, sum: rows >= MIN_GROUP_SIZE ? sumOrNull(rest.map((s) => s.sum)) : null };
}

function sumOrNull(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null);
  return nums.length === 0 ? null : Math.round(nums.reduce((a, b) => a + b, 0) * 1e6) / 1e6;
}
