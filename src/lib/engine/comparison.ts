import type { DashboardSpec } from "@/lib/ai/spec";
import { storeColumnOf } from "@/lib/combine";
import type { DatasetProfile, TypedRow } from "@/lib/types";
import { groupRows } from "./aggregate";
import { measureEvaluator, type ComputedKpi, type ValueFormat } from "./compute";

// Comparaison (US-17) : chaque indicateur clé recalculé par le moteur pour chaque magasin, rayon, produit… (une valeur
// de la colonne de comparaison), avec le classement et l'écart à la moyenne. Aucun chiffre ne vient de l'IA.

/** Au-delà, la comparaison n'est pas proposée : un tableau de plus de 50 lignes ne se lit plus d'un coup d'œil. */
export const MAX_COMPARED = 50;

export interface Comparison {
  column: string;
  /** Indicateurs comparés, dans l'ordre du dashboard ; `average` : moyenne des valeurs comparées. */
  kpis: { id: string; label: string; format: ValueFormat; average: number | null }[];
  /** Une ligne par valeur, classée selon le premier indicateur (rang 1 = la plus forte). */
  rows: { value: string; rank: number; lines: number; values: (number | null)[] }[];
}

/**
 * Colonne de comparaison : celle qui distingue les fichiers regroupés si elle est utilisable, sinon une colonne
 * magasin (site, agence…) d'un export multi-magasins. Elle doit compter entre 2 et 50 valeurs.
 */
export function comparisonColumn(profile: DatasetProfile, preferred?: string | null): string | null {
  const usable = profile.columns.filter((c) => c.role === "dimension" && c.distinct >= 2 && c.distinct <= MAX_COMPARED);
  if (preferred && usable.some((c) => c.name === preferred)) return preferred;
  return storeColumnOf(usable.map((c) => c.name));
}

export function computeComparison(spec: DashboardSpec, rows: TypedRow[], column: string | null, kpis: ComputedKpi[]): Comparison | null {
  if (!column) return null;
  const groups = [...groupRows(rows, column, null)];
  if (groups.length < 2 || groups.length > MAX_COMPARED) return null;
  const valueOf = measureEvaluator(spec);
  const labels = new Map(kpis.map((k) => [k.id, k]));
  // Le simple nombre de lignes vient en dernier : il compare la taille des fichiers plus que l'activité.
  const compared = spec.kpis.filter((k) => labels.has(k.id)).sort((a, b) => Number(a.measure === "rows") - Number(b.measure === "rows"));
  if (compared.length === 0) return null;

  const table = groups.map(([value, list]) => ({ value, lines: list.length, values: compared.map((k) => valueOf(list, k.measure, k.aggregation)) }));
  table.sort((a, b) => (b.values[0] ?? -Infinity) - (a.values[0] ?? -Infinity) || a.value.localeCompare(b.value, "fr"));
  return {
    column,
    kpis: compared.map((k, i) => {
      const present = table.map((r) => r.values[i]).filter((v): v is number => v !== null);
      return { id: k.id, label: labels.get(k.id)!.label, format: labels.get(k.id)!.format, average: present.length > 0 ? present.reduce((a, b) => a + b, 0) / present.length : null };
    }),
    rows: table.map((r, i) => ({ ...r, rank: i + 1 })),
  };
}

/**
 * Écart à la moyenne : en points pour un pourcentage (marge 34 % contre 36 % en moyenne : −2 points),
 * en part de la moyenne sinon (CA 120 contre 100 en moyenne : +20 %). Null si la moyenne ne permet pas de le calculer.
 */
export function gapToAverage(value: number | null, average: number | null, format: ValueFormat): { gap: number; unit: "points" | "percent" } | null {
  if (value === null || average === null) return null;
  if (format === "percent") return { gap: value - average, unit: "points" };
  return average === 0 ? null : { gap: (value - average) / Math.abs(average), unit: "percent" };
}

/** Titre de la section : « Libellé site » → « Comparaison par site ». */
export function comparisonTitle(column: string): string {
  const name = column.replace(/^(libell[ée]|nom|d[ée]signation)\s+(du |de la |de l'|des |de |d')?/i, "").trim() || column;
  // Minuscule initiale, sauf pour un sigle (EAN, PDV).
  return `Comparaison par ${/^.[a-zà-ÿ]/.test(name) ? name.charAt(0).toLowerCase() + name.slice(1) : name}`;
}
