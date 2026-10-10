import type { Aggregation, Granularity } from "@/lib/ai/spec";
import type { TypedRow } from "@/lib/types";

// Fonctions de calcul déterministes : seule source des chiffres affichés.

export function aggregate(values: (string | number | null)[], aggregation: Aggregation): number | null {
  if (aggregation === "count") return values.length;
  const present = values.filter((v) => v !== null);
  if (aggregation === "count_distinct") return new Set(present.map(String)).size;
  const nums = present.filter((v): v is number => typeof v === "number");
  if (nums.length === 0) return null;
  switch (aggregation) {
    case "sum":
      return roundCents(nums.reduce((a, b) => a + b, 0));
    case "avg":
      return nums.reduce((a, b) => a + b, 0) / nums.length;
    case "min":
      return Math.min(...nums);
    case "max":
      return Math.max(...nums);
  }
}

// Évite les artefacts de virgule flottante (0.1 + 0.2) sur les sommes monétaires.
function roundCents(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** Clé de regroupement temporel pour une date ISO (AAAA-MM-JJ). */
export function timeBucket(isoDate: string, granularity: Granularity): string {
  const [y, m] = isoDate.split("-");
  switch (granularity) {
    case "day":
      return isoDate;
    case "month":
      return `${y}-${m}`;
    case "quarter":
      return `${y}-T${Math.ceil(Number(m) / 3)}`;
    case "year":
      return y;
    case "week": {
      // Lundi de la semaine.
      const d = new Date(`${isoDate}T00:00:00Z`);
      const day = (d.getUTCDay() + 6) % 7;
      d.setUTCDate(d.getUTCDate() - day);
      return d.toISOString().slice(0, 10);
    }
  }
}

/** Regroupe les lignes par valeur de colonne (ou par période si une granularité est donnée). */
export function groupRows(rows: TypedRow[], column: string, granularity: Granularity | null): Map<string, TypedRow[]> {
  const groups = new Map<string, TypedRow[]>();
  for (const r of rows) {
    const raw = r[column];
    if (raw === null || raw === undefined) continue;
    const key = granularity ? timeBucket(String(raw), granularity) : String(raw);
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }
  return groups;
}
