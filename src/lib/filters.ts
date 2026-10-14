import { z } from "zod";
import type { DatasetProfile, TypedRow } from "@/lib/types";
import { inScope, type ColumnScopes } from "@/lib/ingest/scopes";

// Filtres interactifs : période (mois de début et de fin) et valeurs retenues par dimension.
// Ils s'appliquent aux lignes du fichier avant tout calcul : chaque chiffre est recalculé, rien n'est estimé.

/** Au-delà, une dimension n'est pas proposée en filtre (trop de valeurs pour une liste à cocher). */
const MAX_FILTER_VALUES = 100;

export const FiltersSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}$/).nullable().default(null),
  to: z.string().regex(/^\d{4}-\d{2}$/).nullable().default(null),
  /** Valeurs retenues par dimension ; une dimension absente n'est pas filtrée. */
  dimensions: z.record(z.string().max(200), z.array(z.string().max(500)).max(MAX_FILTER_VALUES)).default({}),
});

export type Filters = z.infer<typeof FiltersSchema>;

export const NO_FILTERS: Filters = { from: null, to: null, dimensions: {} };

export interface FilterOptions {
  dateColumn: string | null;
  /** Fichiers reliés (US-15) : un filtre sur une colonne propre à un fichier ne s'applique qu'aux lignes de ce fichier. */
  scopes?: ColumnScopes | null;
  /** Mois disponibles (AAAA-MM), du plus ancien au plus récent. */
  periods: string[];
  dimensions: { column: string; values: string[] }[];
}

export function isFiltered(f: Filters): boolean {
  return f.from !== null || f.to !== null || Object.keys(f.dimensions).length > 0;
}

export function filterOptions(profile: DatasetProfile, rows: TypedRow[]): FilterOptions {
  const dateColumn = profile.columns.find((c) => c.role === "date")?.name ?? null;
  const periods = dateColumn
    ? [...new Set(rows.map((r) => r[dateColumn]).filter((v): v is string => typeof v === "string").map((d) => d.slice(0, 7)))].sort()
    : [];
  const dimensions = profile.columns
    .filter((c) => c.role === "dimension" && c.distinct >= 2 && c.distinct <= MAX_FILTER_VALUES)
    .map((c) => ({
      column: c.name,
      values: [...new Set(rows.map((r) => r[c.name]).filter((v) => v !== null).map(String))].sort((a, b) => a.localeCompare(b, "fr")),
    }));
  return { dateColumn, periods, dimensions, ...(profile.scopes ? { scopes: profile.scopes } : {}) };
}

export function applyFilters(rows: TypedRow[], filters: Filters, options: Pick<FilterOptions, "dateColumn" | "scopes">): TypedRow[] {
  const dims = Object.entries(filters.dimensions).map(([column, values]) => [column, new Set(values)] as const);
  const date = options.dateColumn;
  return rows.filter((r) => {
    if (date && (filters.from || filters.to) && inScope(options.scopes, r, date)) {
      const value = r[date];
      if (typeof value !== "string") return false;
      const month = value.slice(0, 7);
      if (filters.from && month < filters.from) return false;
      if (filters.to && month > filters.to) return false;
    }
    for (const [column, allowed] of dims) {
      if (!inScope(options.scopes, r, column)) continue;
      const value = r[column];
      if (value === null || !allowed.has(String(value))) return false;
    }
    return true;
  });
}

/** Résumé lisible des filtres actifs, affiché au-dessus du dashboard et dans le PDF. */
export function describeFilters(f: Filters, formatPeriod: (p: string) => string): string[] {
  const parts: string[] = [];
  if (f.from && f.to) parts.push(`Période : ${formatPeriod(f.from)} → ${formatPeriod(f.to)}`);
  else if (f.from) parts.push(`Depuis ${formatPeriod(f.from)}`);
  else if (f.to) parts.push(`Jusqu'à ${formatPeriod(f.to)}`);
  for (const [column, values] of Object.entries(f.dimensions)) {
    parts.push(`${column} : ${values.length <= 3 ? values.join(", ") : `${values.slice(0, 3).join(", ")} et ${values.length - 3} autre(s)`}`);
  }
  return parts;
}
