import { PER_UNIT_HEADER, withUnitValues } from "@/lib/ingest/profile";
import { SOURCE_COLUMN } from "@/lib/ingest/scopes";
import { parseDate, parseNumber } from "@/lib/ingest/values";
import { canonicalCell } from "@/lib/merge";
import type { CellValue, RawDataset, Row } from "@/lib/types";

// Rapprochement de fichiers différents (US-15), par le moteur et sans IA : par exemple les ventes et la démarque,
// reliées par le code article. Les lignes des deux fichiers sont conservées telles quelles (aucune n'est dupliquée,
// donc aucun montant n'est compté deux fois) ; la colonne « Fichier source » dit d'où vient chaque ligne.
// Les classifications d'un fichier (rayon, famille…) sont reportées sur les lignes de l'autre grâce à la clé,
// pour pouvoir tout ventiler sur les mêmes axes, et un taux qui rapporte l'un à l'autre devient calculable.

/** En-têtes de clé possibles : code article, EAN, référence, identifiant… */
const KEY_HEADER = /article|ean|gtin|sku|code|r[ée]f|produit|\bid\b|identifiant|n[°o]\b|num[ée]ro|matricule/i;
/** Codes numériques reportables d'un fichier à l'autre (ce ne sont pas des quantités). */
const CODE_NAME = /code|ean|gtin|sku|r[ée]f|article|rayon|famille|d[ée]partement|marque|site|magasin|n[°o]\b|num[ée]ro/i;
/** Moins de valeurs distinctes : trop peu pour reconnaître une clé (ex. deux départements). */
const MIN_KEY_VALUES = 5;
/** Part minimale de clés retrouvées (sur le plus petit des deux fichiers). */
const MIN_MATCH_RATE = 0.3;
/** Au-delà de cette part de clés aux valeurs contradictoires, une colonne n'est pas reportée. */
const MAX_CONFLICTS = 0.05;

export interface LinkKey {
  /** Colonne du fichier principal. */
  main: string;
  /** Colonne de l'autre fichier. */
  other: string;
  /** Valeurs de clé présentes dans les deux fichiers. */
  matched: number;
  mainValues: number;
  otherValues: number;
  /** matched / plus petit nombre de valeurs : 1 = toutes les clés du plus petit fichier sont retrouvées. */
  rate: number;
}

export interface LinkSummary {
  key: LinkKey;
  /** Autres clés possibles, pour laisser l'utilisateur choisir. */
  candidates: LinkKey[];
  mainLabel: string;
  otherLabel: string;
  mainRows: number;
  otherRows: number;
  /** Lignes de l'autre fichier dont la clé existe dans le fichier principal. */
  matchedRows: number;
  /** Lignes sans correspondance écartées à la demande de l'utilisateur (sinon gardées dans les totaux). */
  onlyMatched: boolean;
  /** Colonnes reportées sur les lignes de l'autre fichier (et inversement). */
  filled: string[];
  filledBack: string[];
  /** Colonnes non reportées : une même clé y porte des valeurs différentes. */
  ambiguous: string[];
  /** Colonne de date de l'autre fichier, alignée sur celle du fichier principal. */
  dateAligned: { from: string; to: string } | null;
  /** Colonnes renommées pour éviter une confusion (même nom, sens différent). */
  renamed: { from: string; to: string }[];
  notes: string[];
}

const ratio = (values: CellValue[], test: (v: CellValue) => boolean) => {
  const present = values.filter((v) => v !== null);
  return present.length === 0 ? 0 : present.filter(test).length / present.length;
};
const isDateColumn = (ds: RawDataset, c: string) => ratio(ds.rows.map((r) => r[c] ?? null), (v) => parseDate(v) !== null) >= 0.9;
const isNumberColumn = (ds: RawDataset, c: string) => ratio(ds.rows.map((r) => r[c] ?? null), (v) => parseNumber(v) !== null) >= 0.9;
/** Montants à décimales : jamais une clé. */
const isDecimalColumn = (ds: RawDataset, c: string) => ratio(ds.rows.map((r) => r[c] ?? null), (v) => {
  const n = parseNumber(v);
  return n !== null && !Number.isInteger(n);
}) >= 0.2;

function keyValues(ds: RawDataset, c: string): Set<string> {
  const set = new Set<string>();
  for (const r of ds.rows) {
    const v = r[c] ?? null;
    if (v !== null) set.add(canonicalCell(v));
  }
  return set;
}

/** Clés possibles entre deux fichiers, la meilleure d'abord (le plus de valeurs communes, puis la meilleure part). */
export function linkCandidates(main: RawDataset, other: RawDataset): LinkKey[] {
  const usable = (ds: RawDataset) => ds.columns.filter((c) => c !== SOURCE_COLUMN && !isDateColumn(ds, c) && !isDecimalColumn(ds, c));
  const mainColumns = usable(main);
  const otherColumns = usable(other);
  const mainSets = new Map(mainColumns.map((c) => [c, keyValues(main, c)]));
  const otherSets = new Map(otherColumns.map((c) => [c, keyValues(other, c)]));
  const found: LinkKey[] = [];
  for (const m of mainColumns) {
    for (const o of otherColumns) {
      if (!(KEY_HEADER.test(m) || KEY_HEADER.test(o) || m === o)) continue;
      const a = mainSets.get(m)!;
      const b = otherSets.get(o)!;
      if (Math.min(a.size, b.size) < MIN_KEY_VALUES) continue;
      let matched = 0;
      for (const v of b) if (a.has(v)) matched++;
      const rate = matched / Math.min(a.size, b.size);
      if (matched >= 2 && rate >= MIN_MATCH_RATE) found.push({ main: m, other: o, matched, mainValues: a.size, otherValues: b.size, rate });
    }
  }
  // À égalité, un code (article, EAN) plutôt qu'un libellé, dont l'orthographe peut varier d'un fichier à l'autre.
  const isLabel = (k: LinkKey) => Number(/libell|d[ée]signation|nom\b|intitul/i.test(k.main));
  return found.sort((x, y) => y.matched - x.matched || y.rate - x.rate || isLabel(x) - isLabel(y) || Number(y.main === y.other) - Number(x.main === x.other));
}

/** Calcule les valeurs ligne par ligne (quantité × prix unitaire) puis retire les prix unitaires, qui ne s'additionnent pas. */
function withValues(ds: RawDataset): RawDataset {
  const { ds: valued, derived } = withUnitValues(ds);
  const drop = new Set([...derived.values(), ...valued.columns.filter((c) => PER_UNIT_HEADER.test(c))]);
  if (drop.size === 0) return valued;
  return { ...valued, columns: valued.columns.filter((c) => !drop.has(c)), rows: valued.rows.map((r) => Object.fromEntries(Object.entries(r).filter(([c]) => !drop.has(c)))) };
}

/**
 * Valeur de chaque colonne par clé, dans un fichier : reportable si une même clé ne porte (presque) jamais
 * deux valeurs différentes. Les montants ne sont jamais reportés : ils seraient comptés deux fois.
 */
function lookup(ds: RawDataset, key: string, columns: string[], codesOnly = false): { values: Map<string, Map<string, CellValue>>; ambiguous: string[] } {
  const values = new Map<string, Map<string, CellValue>>();
  const ambiguous: string[] = [];
  for (const c of columns) {
    if (isDateColumn(ds, c) || (isNumberColumn(ds, c) && !CODE_NAME.test(c)) || (codesOnly && (!CODE_NAME.test(c) || /libell|d[ée]signation|intitul/i.test(c)))) continue;
    const map = new Map<string, CellValue>();
    const conflicts = new Set<string>();
    for (const r of ds.rows) {
      const k = r[key] ?? null;
      const v = r[c] ?? null;
      if (k === null || v === null) continue;
      const ck = canonicalCell(k);
      const seen = map.get(ck);
      if (seen === undefined) map.set(ck, v);
      else if (canonicalCell(seen) !== canonicalCell(v)) conflicts.add(ck);
    }
    if (map.size === 0) continue;
    if (conflicts.size / map.size > MAX_CONFLICTS) {
      ambiguous.push(c);
      continue;
    }
    for (const k of conflicts) map.delete(k);
    values.set(c, map);
  }
  return { values, ambiguous };
}

const firstDate = (ds: RawDataset) => ds.columns.find((c) => c !== SOURCE_COLUMN && ds.rows.some((r) => r[c] !== null) && isDateColumn(ds, c)) ?? null;

export function linkDatasets(
  mainInput: RawDataset,
  otherInput: RawDataset,
  key: LinkKey,
  labels: { main: string; other: string },
  candidates: LinkKey[] = [key],
  options: { onlyMatched?: boolean } = {},
): { dataset: RawDataset; summary: LinkSummary } {
  const main = withValues(mainInput);
  let other = withValues(otherInput);
  const otherLabel = labels.other === labels.main ? `${labels.other} (2)` : labels.other;
  const renamed: { from: string; to: string }[] = [];
  const rename = (from: string, to: string) => {
    other = { ...other, columns: other.columns.map((c) => (c === from ? to : c)), rows: other.rows.map((r) => {
      const { [from]: value, ...rest } = r;
      return { ...rest, [to]: value ?? null };
    }) };
  };

  // 1. Clé : une colonne de même nom mais de sens différent est renommée, puis la clé prend le nom du fichier principal.
  if (key.other !== key.main) {
    if (other.columns.includes(key.main)) {
      const to = uniqueName(`${key.main} (${otherLabel})`, [...main.columns, ...other.columns]);
      rename(key.main, to);
      renamed.push({ from: key.main, to });
    }
    rename(key.other, key.main);
  }
  // 2. Dates : celle de l'autre fichier est alignée sur celle du fichier principal (mêmes évolutions mensuelles).
  const mainDate = firstDate(main);
  const otherDate = firstDate(other);
  let dateAligned: LinkSummary["dateAligned"] = null;
  if (mainDate && otherDate && mainDate !== otherDate) {
    if (other.columns.includes(mainDate)) {
      const to = uniqueName(`${mainDate} (${otherLabel})`, [...main.columns, ...other.columns]);
      rename(mainDate, to);
      renamed.push({ from: mainDate, to });
    }
    rename(otherDate, mainDate);
    dateAligned = { from: otherDate, to: mainDate };
  }

  const shared = new Set(main.columns.filter((c) => other.columns.includes(c)));
  const mainOnly = main.columns.filter((c) => !shared.has(c));
  const otherOnly = other.columns.filter((c) => !shared.has(c));
  const forward = lookup(main, key.main, mainOnly);
  // Vers le fichier principal, seulement des codes (EAN, référence) : une autre colonne de l'autre fichier (le type
  // de régularisation…) décrit un événement, pas l'article, même si elle semble constante sur quelques lignes.
  const backward = lookup(other, key.main, otherOnly, true);
  const columns = [...main.columns, ...otherOnly, SOURCE_COLUMN];
  const mainKeys = keyValues(main, key.main);

  const fill = (row: Row, from: Map<string, Map<string, CellValue>>, label: string): Row => {
    const out: Row = {};
    const k = row[key.main] ?? null;
    const ck = k === null ? null : canonicalCell(k);
    for (const c of columns) out[c] = row[c] ?? (ck !== null ? from.get(c)?.get(ck) ?? null : null);
    out[SOURCE_COLUMN] = label;
    return out;
  };
  const matches = (r: Row) => r[key.main] !== null && r[key.main] !== undefined && mainKeys.has(canonicalCell(r[key.main]!));
  const matchedRows = other.rows.filter(matches).length;
  // Option : seulement les lignes de l'autre fichier rattachées au fichier principal (ex. un extrait de ventes partiel).
  const kept = options.onlyMatched ? other.rows.filter(matches) : other.rows;
  const rows = [...main.rows.map((r) => fill(r, backward.values, labels.main)), ...kept.map((r) => fill(r, forward.values, otherLabel))];

  const summary: LinkSummary = {
    key,
    candidates,
    mainLabel: labels.main,
    otherLabel,
    mainRows: main.rows.length,
    otherRows: other.rows.length,
    matchedRows,
    onlyMatched: !!options.onlyMatched,
    filled: [...forward.values.keys()],
    filledBack: [...backward.values.keys()],
    // Seules les classifications du fichier principal comptent ici : celles de l'autre fichier (ex. le type de
    // régularisation) varient normalement d'une ligne à l'autre pour un même article.
    ambiguous: forward.ambiguous,
    dateAligned,
    renamed,
    notes: [],
  };
  const pct = (n: number, d: number) => `${Math.round((n / Math.max(d, 1)) * 100)} %`;
  summary.notes.push(
    `Fichiers reliés par « ${key.main} »${key.other !== key.main ? ` (« ${key.other} » dans ${otherLabel})` : ""} : ${key.matched} valeur(s) commune(s), ` +
      `${matchedRows.toLocaleString("fr-FR")} ligne(s) sur ${other.rows.length.toLocaleString("fr-FR")} de ${otherLabel} rattachée(s) (${pct(matchedRows, other.rows.length)}).`,
  );
  if (options.onlyMatched && matchedRows < other.rows.length) {
    summary.notes.push(`${(other.rows.length - matchedRows).toLocaleString("fr-FR")} ligne(s) de ${otherLabel} sans correspondance écartée(s) à votre demande.`);
  }
  if (summary.filled.length > 0) summary.notes.push(`Reporté sur les lignes de ${otherLabel} d'après la clé : ${summary.filled.map((c) => `« ${c} »`).join(", ")}.`);
  if (summary.ambiguous.length > 0) summary.notes.push(`Non reporté (une même clé y a plusieurs valeurs) : ${summary.ambiguous.map((c) => `« ${c} »`).join(", ")}.`);
  const notes = [...new Set([...(main.notes ?? []), ...(other.notes ?? []), ...summary.notes])];
  return { dataset: { fileName: mainInput.fileName, columns, rows, notes }, summary };
}

function uniqueName(name: string, taken: string[]): string {
  let candidate = name;
  for (let i = 2; taken.includes(candidate); i++) candidate = `${name} ${i}`;
  return candidate;
}
