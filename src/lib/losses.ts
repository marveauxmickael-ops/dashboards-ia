import type { FilterOptions, Filters } from "@/lib/filters";

// « Pertes uniquement » : dans un journal de démarque, les régularisations mélangent des pertes (périmé, casse,
// dons, vol…) et des corrections de stock (inventaire, comptage), positives ou négatives. Le moteur repère la
// colonne qui porte ce type de mouvement et les valeurs qui sont des pertes : un filtre prêt à l'emploi, sans IA.

const LOSS = /p[ée]rim|cass|\bdons?\b|\bvols?\b|d[ée]marque|perte|d[ée]t[ée]rior|ab[îi]m|freinte|destruct|jet[ée]|rebut|\bdlc\b|\bdluo\b|invendu|d[ée]class|avari|sinistre/i;
const NOT_LOSS = /inventaire|comptage|recomptage|correction|ajustement|transfert|retour|r[ée]ception|entr[ée]e/i;
const TYPE_HEADER = /r[ée]gul|motif|type|nature|mouvement|raison|cause|code/i;

export interface LossPreset {
  column: string;
  /** Valeurs qui sont des pertes. */
  losses: string[];
  /** Autres mouvements (inventaire, comptage…), écartés quand le filtre est actif. */
  others: string[];
}

/** Colonne de type de mouvement d'un journal de démarque : au moins une perte et au moins un autre mouvement. */
export function lossPreset(options: FilterOptions | undefined): LossPreset | null {
  if (!options) return null;
  const candidates = options.dimensions
    .map((d) => ({ column: d.column, losses: d.values.filter((v) => LOSS.test(v) && !NOT_LOSS.test(v)), others: d.values.filter((v) => !LOSS.test(v) || NOT_LOSS.test(v)) }))
    .filter((c) => c.losses.length > 0 && c.others.length > 0 && c.others.some((v) => NOT_LOSS.test(v)));
  return candidates.sort((a, b) => Number(TYPE_HEADER.test(b.column)) - Number(TYPE_HEADER.test(a.column)) || b.losses.length - a.losses.length)[0] ?? null;
}

/**
 * Colonne de motif d'un journal de démarque, au sens large : comme `lossPreset`, ou une colonne de motif
 * (« Motif », « Code regul »…) dont les valeurs sont toutes des pertes. Sert au bilan de la démarque (US-18).
 */
export function lossColumn(dimensions: { column: string; values: string[] }[]): LossPreset | null {
  const strict = lossPreset({ dateColumn: null, periods: [], dimensions });
  if (strict) return strict;
  return (
    dimensions
      .filter((d) => TYPE_HEADER.test(d.column) && d.values.length > 0 && d.values.every((v) => LOSS.test(v) && !NOT_LOSS.test(v)))
      .map((d) => ({ column: d.column, losses: d.values, others: [] }))[0] ?? null
  );
}

/** Le filtre « pertes uniquement » est-il exactement celui appliqué sur la colonne ? */
export function lossesOnly(filters: Filters | undefined, preset: LossPreset): boolean {
  const applied = filters?.dimensions[preset.column];
  return !!applied && applied.length === preset.losses.length && preset.losses.every((v) => applied.includes(v));
}

/** Active ou retire le filtre, sans toucher aux autres filtres (période, magasin…). */
export function withLossesOnly(filters: Filters, preset: LossPreset, on: boolean): Filters {
  const { [preset.column]: _removed, ...rest } = filters.dimensions;
  void _removed;
  return { ...filters, dimensions: on ? { ...rest, [preset.column]: preset.losses } : rest };
}
