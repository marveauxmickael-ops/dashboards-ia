import type { CellValue } from "@/lib/types";

// Fichiers reliés (US-15) : chaque ligne vient d'un des fichiers, indiqué dans la colonne « Fichier source ».
// Une colonne propre à un fichier est vide, par construction, sur les lignes de l'autre : ces cellules ne sont
// ni des valeurs manquantes ni des anomalies. La portée de chaque colonne se déduit des données elles-mêmes,
// si bien qu'elle survit à l'export du fichier relié en CSV.

export const SOURCE_COLUMN = "Fichier source";

export interface ColumnScopes {
  column: string;
  /** Fichiers d'origine, dans l'ordre d'apparition (le fichier principal d'abord). */
  sources: string[];
  /** Colonnes propres à certains fichiers : fichiers où elles s'appliquent. Les autres colonnes valent pour tous. */
  applies: Record<string, string[]>;
}

/** Portée des colonnes d'un fichier relié, ou null pour un fichier ordinaire. */
export function columnScopes(columns: string[], rows: Record<string, CellValue>[]): ColumnScopes | null {
  if (!columns.includes(SOURCE_COLUMN)) return null;
  const sources = [...new Set(rows.map((r) => r[SOURCE_COLUMN]).filter((v): v is string | number => v !== null && v !== undefined).map(String))];
  if (sources.length < 2) return null;
  const applies: Record<string, string[]> = {};
  for (const c of columns) {
    if (c === SOURCE_COLUMN) continue;
    const used = new Set<string>();
    for (const r of rows) if (r[c] !== null && r[c] !== undefined) used.add(String(r[SOURCE_COLUMN]));
    if (used.size > 0 && used.size < sources.length) applies[c] = sources.filter((s) => used.has(s));
  }
  return { column: SOURCE_COLUMN, sources, applies };
}

/** La cellule (ligne, colonne) est-elle attendue ? Faux pour une colonne propre à un autre fichier que celui de la ligne. */
export function inScope(scopes: ColumnScopes | null | undefined, row: Record<string, CellValue>, column: string): boolean {
  const list = scopes?.applies[column];
  return !list || list.includes(String(row[scopes!.column]));
}
