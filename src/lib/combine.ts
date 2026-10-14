import { canonicalDataset } from "@/lib/merge";
import { parseDate, parseNumber } from "@/lib/ingest/values";
import { linkCandidates, linkDatasets, type LinkSummary } from "@/lib/link";
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

export type CombinedFileStatus = "added" | "linked" | "duplicate" | "incompatible";

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
  /** Second type de fichier relié par une clé (US-15). */
  link?: LinkSummary | null;
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

/** Choix de l'utilisateur pour relier un second type de fichier (US-15) : la clé de chaque côté. */
export interface LinkChoice {
  main: string;
  other: string;
  /** Ne garder que les lignes de l'autre fichier rattachées au fichier principal. */
  onlyMatched?: boolean;
}

/** Empile des fichiers de même structure (doublons exacts ignorés) et repère la colonne qui les distingue. */
function stackGroup(group: RawDataset[]) {
  const base = group[0];
  const kept = uniqueDatasets(group);
  const found = distinguishingColumn(base.columns, kept);
  // Sans colonne qui les distingue, chaque ligne est repérée par le nom de son fichier (dès qu'il y a plusieurs fichiers).
  const addFileColumn = !found && kept.length > 1;
  const column = found ?? (addFileColumn ? uniqueName(FILE_COLUMN, base.columns) : null);
  const columns = addFileColumn ? [...base.columns, column!] : base.columns;
  const seen = new Map<string, string>();
  const files: CombinedFile[] = [];
  const rows: Row[] = [];
  for (const ds of group) {
    const entry = { name: ds.fileName, rows: ds.rows.length };
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
  const added = files.filter((f) => f.status === "added");
  const notes = [...new Set(kept.flatMap((ds) => ds.notes ?? []))];
  if (added.length > 1) notes.push(`${added.length} fichiers regroupés : ${added.map((f) => f.name).join(", ")}.`);
  // Nom du groupe dans « Fichier source » : le fichier, ou le premier suivi du nombre de fichiers.
  const label = added.length <= 1 ? fileLabel(added[0]?.name ?? base.fileName) : `${fileLabel(added[0].name)} et ${added.length - 1} autre(s)`;
  return { dataset: { fileName: base.fileName, columns, rows, ...(notes.length > 0 ? { notes } : {}) } as RawDataset, files, column, addFileColumn, label };
}

export function combineDatasets(datasets: RawDataset[], options: { link?: LinkChoice | null } = {}): { dataset: RawDataset; summary: CombineSummary } {
  if (datasets.length === 0) throw new CombineError("Aucun fichier reçu.");
  if (datasets.length > MAX_FILES) throw new CombineError(`Déposez au plus ${MAX_FILES} fichiers à la fois.`);

  // Fichiers groupés par structure ; le fichier principal est celui du plus grand groupe (le premier déposé en cas d'égalité).
  const groups = new Map<string, RawDataset[]>();
  for (const ds of datasets) groups.set(structureKey(ds.columns), [...(groups.get(structureKey(ds.columns)) ?? []), ds]);
  const ordered = [...groups.values()].sort((a, b) => b.length - a.length);
  const main = stackGroup(ordered[0]);
  const base = ordered[0][0];

  const incompatible = (ds: RawDataset, reason?: string): CombinedFile => {
    const missing = base.columns.filter((c) => !ds.columns.includes(c));
    const extra = ds.columns.filter((c) => !base.columns.includes(c));
    const detail = [missing.length > 0 && `il manque ${quoteList(missing)}`, extra.length > 0 && `en plus : ${quoteList(extra)}`].filter(Boolean).join(" ; ");
    return { name: ds.fileName, rows: ds.rows.length, status: "incompatible", values: [], reason: reason ?? `Colonnes différentes des autres fichiers (${detail}).` };
  };

  // Un second type de fichier (ex. la démarque à côté des ventes) est relié par une clé commune (US-15).
  let dataset = main.dataset;
  let link: LinkSummary | null = null;
  const others = new Map<RawDataset, CombinedFile>();
  if (ordered[1]) {
    const second = stackGroup(ordered[1]);
    const candidates = linkCandidates(main.dataset, second.dataset);
    const chosen = (options.link && candidates.find((c) => c.main === options.link!.main && c.other === options.link!.other)) || candidates[0];
    if (chosen && main.dataset.rows.length > 0 && second.dataset.rows.length > 0) {
      const linked = linkDatasets(main.dataset, second.dataset, chosen, { main: main.label, other: second.label }, candidates, { onlyMatched: !!options.link?.onlyMatched });
      dataset = linked.dataset;
      link = linked.summary;
      for (const [i, ds] of ordered[1].entries()) {
        const f = second.files[i];
        others.set(ds, f.status === "added" ? { ...f, status: "linked", values: [] } : f);
      }
    } else {
      for (const ds of ordered[1]) others.set(ds, incompatible(ds, "Colonnes différentes et aucune clé commune (code article, EAN, référence…) pour relier ce fichier aux autres."));
    }
  }
  for (const group of ordered.slice(2)) for (const ds of group) others.set(ds, incompatible(ds, "Un seul autre type de fichier peut être relié à la fois : déposez-le séparément."));

  // Récapitulatif dans l'ordre de dépôt.
  const mainFiles = new Map(ordered[0].map((ds, i) => [ds, main.files[i]]));
  const files = datasets.map((ds) => mainFiles.get(ds) ?? others.get(ds)!);

  if (dataset.rows.length === 0) throw new CombineError("Aucune ligne à regrouper : les fichiers retenus sont vides.");
  const used = files.filter((f) => f.status === "added" || f.status === "linked").length;
  return {
    dataset: { ...dataset, fileName: link ? linkedFileName(used) : combinedFileName(used) },
    summary: {
      files,
      column: main.column,
      columnAdded: main.addFileColumn,
      values: main.column ? distinctValues(main.dataset.rows, main.column) : [],
      rows: dataset.rows.length,
      link,
    },
  };
}

/** Fichier relié : « rapprochement-2-fichiers.csv ». */
export function linkedFileName(count: number): string {
  return `rapprochement-${count}-fichiers.csv`;
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
