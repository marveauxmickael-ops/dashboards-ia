import { canonicalDataset } from "@/lib/merge";
import { parseDate, parseNumber } from "@/lib/ingest/values";
import type { RawDataset, Row } from "@/lib/types";

// Dépôt de plusieurs fichiers (US-16) : les fichiers de même structure (un export par magasin, par rayon, par produit…)
// sont empilés en un seul jeu de données, par le moteur et sans IA. La colonne qui distingue les fichiers est repérée
// pour les comparer (US-17). Un fichier déposé deux fois ou de structure différente est signalé, jamais additionné
// en silence. Les fichiers restent en mémoire.

export const MAX_FILES = 10;

/** Colonne qui désigne le magasin (ou le site, l'agence…) de chaque ligne. */
export const STORE_HEADER = /magasin|boutique|\bsites?\b|store|point de vente|\bpdv\b|agence|[ée]tablissement|succursale|enseigne/i;
const LABEL_HEADER = /libell|nom|name|d[ée]signation/i;

/** Colonne ajoutée quand aucune colonne ne distingue les fichiers : chaque ligne porte le nom de son fichier. */
export const FILE_COLUMN = "Fichier";

export type CombinedFileStatus = "added" | "duplicate" | "incompatible";

export interface CombinedFile {
  name: string;
  rows: number;
  status: CombinedFileStatus;
  /** Valeur(s) de la colonne de comparaison dans ce fichier (le magasin, le rayon… ou le nom du fichier). */
  values: string[];
  /** Raison lisible d'un fichier écarté. */
  reason?: string;
}

export interface CombineSummary {
  files: CombinedFile[];
  /** Colonne qui distingue les fichiers (magasin, rayon, produit…), ou `FILE_COLUMN` si elle a été ajoutée. */
  column: string | null;
  columnAdded: boolean;
  values: string[];
  rows: number;
}

/** Colonne magasin d'un fichier : le libellé est préféré au code (« Libellé site » plutôt que « Code site »). */
export function storeColumnOf(columns: string[]): string | null {
  const candidates = columns.filter((c) => STORE_HEADER.test(c));
  return candidates.find((c) => LABEL_HEADER.test(c)) ?? candidates.find((c) => !/code|\bid\b|n[°o]/i.test(c)) ?? candidates[0] ?? null;
}

/** Nom lisible d'un fichier : « ventes_bastille-sept.xlsx » → « ventes bastille sept ». */
export function fileLabel(fileName: string): string {
  return fileName.replace(/\.(csv|xlsx|xls|pdf)$/i, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim() || fileName;
}

const structureKey = (columns: string[]) => [...columns].sort().join("\u001f");

/** Fichier regroupé : « regroupement-5-fichiers.csv ». */
export function combinedFileName(count: number): string {
  return `regroupement-${count}-fichiers.csv`;
}

export function combineDatasets(datasets: RawDataset[]): { dataset: RawDataset; summary: CombineSummary } {
  if (datasets.length === 0) throw new CombineError("Aucun fichier reçu.");
  if (datasets.length > MAX_FILES) throw new CombineError(`Déposez au plus ${MAX_FILES} fichiers à la fois.`);

  // Structure de référence : celle du plus grand nombre de fichiers (la première déposée en cas d'égalité).
  const counts = new Map<string, number>();
  for (const ds of datasets) counts.set(structureKey(ds.columns), (counts.get(structureKey(ds.columns)) ?? 0) + 1);
  let reference = structureKey(datasets[0].columns);
  for (const ds of datasets) if ((counts.get(structureKey(ds.columns)) ?? 0) > (counts.get(reference) ?? 0)) reference = structureKey(ds.columns);
  const base = datasets.find((ds) => structureKey(ds.columns) === reference)!;

  const kept = uniqueDatasets(datasets.filter((ds) => structureKey(ds.columns) === reference));
  const found = distinguishingColumn(base.columns, kept);
  // Sans colonne qui les distingue, chaque ligne est repérée par le nom de son fichier (dès qu'il y a plusieurs fichiers).
  const addFileColumn = !found && kept.length > 1;
  const column = found ?? (addFileColumn ? uniqueName(FILE_COLUMN, base.columns) : null);
  const columns = addFileColumn ? [...base.columns, column!] : base.columns;

  const seen = new Map<string, string>();
  const files: CombinedFile[] = [];
  const rows: Row[] = [];
  for (const ds of datasets) {
    const entry = { name: ds.fileName, rows: ds.rows.length };
    if (structureKey(ds.columns) !== reference) {
      const missing = base.columns.filter((c) => !ds.columns.includes(c));
      const extra = ds.columns.filter((c) => !base.columns.includes(c));
      const detail = [missing.length > 0 && `il manque ${quoteList(missing)}`, extra.length > 0 && `en plus : ${quoteList(extra)}`].filter(Boolean).join(" ; ");
      files.push({ ...entry, status: "incompatible", values: [], reason: `Colonnes différentes des autres fichiers (${detail}).` });
      continue;
    }
    const fingerprint = canonicalDataset(ds);
    const twin = seen.get(fingerprint);
    if (twin !== undefined) {
      files.push({ ...entry, status: "duplicate", values: [], reason: `Contenu identique à « ${twin} » : déjà pris en compte.` });
      continue;
    }
    seen.set(fingerprint, ds.fileName);
    const label = fileLabel(ds.fileName);
    for (const r of ds.rows) {
      const row: Row = {};
      for (const c of base.columns) row[c] = r[c] ?? null;
      if (addFileColumn) row[column!] = label;
      rows.push(row);
    }
    const values = found ? distinctValues(ds.rows, found) : addFileColumn ? [label] : [];
    files.push({ ...entry, status: "added", values });
  }

  if (rows.length === 0) throw new CombineError("Aucune ligne à regrouper : les fichiers retenus sont vides.");
  const added = files.filter((f) => f.status === "added").length;
  const notes = [...new Set(kept.flatMap((ds) => ds.notes ?? []))];
  if (added > 1) notes.push(`${added} fichiers regroupés : ${files.filter((f) => f.status === "added").map((f) => f.name).join(", ")}.`);
  return {
    dataset: { fileName: combinedFileName(added), columns, rows, ...(notes.length > 0 ? { notes } : {}) },
    summary: {
      files,
      column,
      columnAdded: addFileColumn,
      values: column ? distinctValues(rows, column) : [],
      rows: rows.length,
    },
  };
}

export class CombineError extends Error {}

/**
 * Colonne qui distingue les fichiers : une seule valeur par fichier, différente d'un fichier à l'autre
 * (« Libellé site » pour un export par magasin, « Libellé rayon » pour un export par rayon…). Les libellés sont
 * préférés aux codes ; dates et nombres sont écartés. Aucune : null.
 */
export function distinguishingColumn(columns: string[], datasets: RawDataset[]): string | null {
  if (datasets.length < 2) return null;
  const candidates = columns.filter((c) => {
    const values = datasets.map((ds) => distinctValues(ds.rows, c));
    if (values.some((v) => v.length !== 1)) return false;
    if (new Set(values.map((v) => v[0])).size !== datasets.length) return false;
    return values.every(([v]) => parseDate(v) === null && parseNumber(v) === null);
  });
  const rank = (c: string) => (LABEL_HEADER.test(c) ? 0 : 2) + (STORE_HEADER.test(c) ? 0 : 1) + (/code|\bid\b|n[°o]/i.test(c) ? 4 : 0);
  // À égalité, la colonne la plus à droite : la plus fine dans une hiérarchie (département → rayon → famille).
  return [...candidates].sort((a, b) => rank(a) - rank(b) || columns.indexOf(b) - columns.indexOf(a))[0] ?? null;
}

/** Fichiers sans les doublons exacts (un même fichier déposé deux fois). */
function uniqueDatasets(datasets: RawDataset[]): RawDataset[] {
  const seen = new Set<string>();
  return datasets.filter((ds) => {
    const key = canonicalDataset(ds);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function distinctValues(rows: Row[], column: string): string[] {
  return [...new Set(rows.map((r) => r[column]).filter((v) => v !== null && v !== undefined).map(String))].sort((a, b) => a.localeCompare(b, "fr"));
}

function uniqueName(name: string, taken: string[]): string {
  let candidate = name;
  for (let i = 2; taken.includes(candidate); i++) candidate = `${name} (${i})`;
  return candidate;
}

function quoteList(names: string[]): string {
  const shown = names.slice(0, 3).map((n) => `« ${n} »`).join(", ");
  return names.length > 3 ? `${shown} et ${names.length - 3} autre(s)` : shown;
}
