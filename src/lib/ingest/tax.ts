import type { RawDataset } from "@/lib/types";
import { parseNumber } from "./values";

// Montants TTC non nommés : beaucoup de logiciels de caisse (METI…) exportent « Montant vente » à côté de
// « Montant vente HT » sans préciser que le premier contient la TVA. Le moteur le reconnaît à l'écart entre les deux
// (de 1,5 % à 25 %, la plage des taux de TVA) et le renomme « … TTC » pour que chaque montant dise ce qu'il contient.

const TAX_WORD = /(^|[\s(_-])(ht|ttc|tva|h\.t\.?|t\.t\.c\.?)(?=$|[\s)_.-])/i;
const HT_WORD = /(^|[\s(_-])(ht|h\.t\.?|hors taxes?)(?=$|[\s)_.-])/gi;
const MIN_RATIO = 1.015;
const MAX_RATIO = 1.25;
// Part minimale de lignes où le montant est au moins égal au HT (arrondis et retours compris).
const MIN_CONSISTENT = 0.95;
export const TAX_NOTE_PREFIX = "Montant TTC reconnu :";

const key = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Colonne HT jumelle : même nom une fois « HT » retiré (« Montant vente HT » pour « Montant vente »). */
function htTwin(column: string, columns: string[]): string | null {
  return columns.find((c) => c !== column && TAX_WORD.test(c) && key(c.replace(HT_WORD, " ")) === key(column)) ?? null;
}

/** Écart moyen entre le montant et son HT, si les lignes ressemblent à un TTC ; sinon null. */
function taxRatio(ds: RawDataset, column: string, ht: string): number | null {
  let total = 0;
  let totalHt = 0;
  let pairs = 0;
  let consistent = 0;
  for (const r of ds.rows) {
    const v = parseNumber(r[column]);
    const h = parseNumber(r[ht]);
    if (v === null || h === null) continue;
    pairs++;
    total += v;
    totalHt += h;
    if (Math.abs(v) >= Math.abs(h) - 0.01) consistent++;
  }
  if (pairs === 0 || totalHt === 0 || consistent / pairs < MIN_CONSISTENT) return null;
  const ratio = total / totalHt;
  return ratio >= MIN_RATIO && ratio <= MAX_RATIO ? ratio : null;
}

const percent = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

/** Renomme « … TTC » les montants qui contiennent la TVA sans le dire. Calcul du moteur, sans IA. */
export function withTaxLabels(ds: RawDataset): RawDataset {
  const renamed = new Map<string, string>();
  const notes: string[] = [];
  for (const column of ds.columns) {
    if (TAX_WORD.test(column)) continue;
    const ht = htTwin(column, ds.columns);
    if (!ht) continue;
    const ratio = taxRatio(ds, column, ht);
    const name = `${column} TTC`;
    if (ratio === null || ds.columns.includes(name)) continue;
    renamed.set(column, name);
    notes.push(`${TAX_NOTE_PREFIX} « ${column} » vaut en moyenne ${percent.format((ratio - 1) * 100)} % de plus que « ${ht} » (la TVA) : il est affiché « ${name} ».`);
  }
  if (renamed.size === 0) return ds;
  return renameColumns(ds, renamed, [...(ds.notes ?? []), ...notes]);
}

/**
 * Dashboard créé avant la reconnaissance du TTC : ses calculs citent « Montant vente ». Ses mises à jour gardent
 * ce nom, pour rester compatibles (mêmes colonnes, même empreinte du fichier).
 */
export function restoreTaxLabels(ds: RawDataset, previousColumns: string[]): RawDataset {
  const before = new Set(previousColumns);
  const renamed = new Map<string, string>();
  for (const column of ds.columns) {
    if (!column.endsWith(" TTC") || before.has(column)) continue;
    const original = column.slice(0, -" TTC".length);
    if (before.has(original) && !ds.columns.includes(original)) renamed.set(column, original);
  }
  if (renamed.size === 0) return ds;
  const notes = (ds.notes ?? []).filter((n) => !(n.startsWith(TAX_NOTE_PREFIX) && [...renamed.values()].some((o) => n.includes(`« ${o} »`))));
  return renameColumns(ds, renamed, notes);
}

function renameColumns(ds: RawDataset, renamed: Map<string, string>, notes: string[]): RawDataset {
  const columns = ds.columns.map((c) => renamed.get(c) ?? c);
  const rows = ds.rows.map((r) => {
    const out: typeof r = {};
    for (const c of ds.columns) out[renamed.get(c) ?? c] = r[c];
    return out;
  });
  const result: RawDataset = { ...ds, columns, rows };
  if (notes.length > 0) result.notes = notes;
  else delete result.notes;
  return result;
}
