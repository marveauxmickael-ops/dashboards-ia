import { parseDate, parseNumber } from "@/lib/ingest/values";
import type { ValueFormat } from "@/lib/engine/compute";
import type { CellValue, RawDataset, Row } from "@/lib/types";

// Ajout de données (US-12) : fusion, par le moteur et sans IA, du fichier de la version en cours et d'un nouveau
// fichier qui le recoupe. Seules les lignes nouvelles ou modifiées sont ajoutées ; les deux fichiers restent en mémoire.

export type KeepPolicy = "new" | "old";

export interface MergeSummary {
  /** Lignes du nouveau fichier identiques à une ligne du fichier précédent : ignorées. */
  alreadyPresent: number;
  /** Lignes nouvelles : ajoutées. */
  added: number;
  /** Lignes au même identifiant que dans le fichier précédent, avec des valeurs différentes. */
  modified: number;
  /** Colonne d'identifiant utilisée pour repérer les lignes modifiées (n° de commande, de facture…). */
  idColumn: string | null;
  keep: KeepPolicy;
  rowsBefore: number;
  rowsAfter: number;
}

/** Chiffres comparés avant / après l'ajout, dans le récapitulatif. */
export interface MergeSnapshot {
  rows: number;
  period: { from: string; to: string } | null;
  kpis: { id: string; label: string; value: number | null; format: ValueFormat }[];
}

export interface MergePreview {
  summary: MergeSummary;
  before: MergeSnapshot;
  after: MergeSnapshot;
  /** Dashboard antérieur à l'empreinte : le fichier précédent n'a pas pu être vérifié. */
  unverified: boolean;
}

/** Valeur comparable quel que soit le format du fichier : « 12,5 » = « 12.5 » = 12,5 ; « 15/01/2024 » = « 2024-01-15 ». */
export function canonicalCell(v: CellValue): string {
  if (v === null) return "";
  if (typeof v === "number") return `n:${v}`;
  const date = parseDate(v);
  if (date) return `d:${date}`;
  const n = parseNumber(v);
  return n !== null ? `n:${n}` : `s:${v}`;
}

/** Empreinte lisible du contenu d'une ligne, sur les colonnes données. */
export function rowKey(row: Row, columns: string[]): string {
  return columns.map((c) => canonicalCell(row[c] ?? null)).join("\u001f");
}

/** Contenu canonique d'un fichier (colonnes et lignes triées) : base de son empreinte. */
export function canonicalDataset(ds: RawDataset): string {
  const columns = [...ds.columns].sort();
  return [columns.join("\u001f"), ...ds.rows.map((r) => rowKey(r, columns)).sort()].join("\u001e");
}

const ID_HEADER = /(^|[\s_(-])(id|identifiant|n[°o]|num|num[ée]ro|r[ée]f|r[ée]f[ée]rence)(?=$|[\s_).:-])|commande|facture|order|invoice|transaction|ticket/i;

/** Colonne d'identifiant de ligne : nom évocateur, renseignée et unique dans les deux fichiers. */
export function lineIdColumn(previous: RawDataset, next: RawDataset): string | null {
  const unique = (ds: RawDataset, c: string) => {
    const seen = new Set<string>();
    for (const r of ds.rows) {
      const v = r[c] ?? null;
      if (v === null) return false;
      const k = canonicalCell(v);
      if (k.startsWith("d:") || seen.has(k)) return false;
      seen.add(k);
    }
    return true;
  };
  return previous.columns.find((c) => ID_HEADER.test(c) && next.columns.includes(c) && unique(previous, c) && unique(next, c)) ?? null;
}

export function mergeDatasets(previous: RawDataset, next: RawDataset, keep: KeepPolicy = "new"): { dataset: RawDataset; summary: MergeSummary } {
  const common = previous.columns.filter((c) => next.columns.includes(c));
  const fill = (row: Row): Row => Object.fromEntries(previous.columns.map((c) => [c, row[c] ?? null]));

  // Lignes identiques : comptées une à une (deux lignes identiques dans l'ancien fichier en absorbent deux dans le nouveau).
  const remaining = new Map<string, number>();
  for (const r of previous.rows) {
    const k = rowKey(r, common);
    remaining.set(k, (remaining.get(k) ?? 0) + 1);
  }
  const idColumn = lineIdColumn(previous, next);
  const byId = new Map<string, number>();
  if (idColumn) previous.rows.forEach((r, i) => byId.set(canonicalCell(r[idColumn]), i));

  const rows = previous.rows.map((r) => ({ ...r }));
  let alreadyPresent = 0, added = 0, modified = 0;
  for (const row of next.rows) {
    const k = rowKey(row, common);
    const left = remaining.get(k) ?? 0;
    if (left > 0) {
      remaining.set(k, left - 1);
      alreadyPresent++;
      continue;
    }
    const index = idColumn ? byId.get(canonicalCell(row[idColumn] ?? null)) : undefined;
    if (index !== undefined) {
      modified++;
      if (keep === "new") rows[index] = fill(row);
      continue;
    }
    added++;
    rows.push(fill(row));
  }
  return {
    dataset: { fileName: previous.fileName, columns: previous.columns, rows },
    summary: { alreadyPresent, added, modified, idColumn, keep, rowsBefore: previous.rows.length, rowsAfter: rows.length },
  };
}

/** Nom du fichier fusionné : « ventes-fusionne.csv » (sans répéter le suffixe à chaque ajout). */
export function mergedFileName(fileName: string): string {
  const base = fileName.replace(/\.(csv|xlsx|pdf)$/i, "").replace(/-fusionne$/i, "") || "fichier";
  return `${base}-fusionne.csv`;
}
