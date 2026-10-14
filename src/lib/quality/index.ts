import { z } from "zod";
import { profileDataset } from "@/lib/ingest/profile";
import { parseDate, parseNumber } from "@/lib/ingest/values";
import { columnScopes, inScope } from "@/lib/ingest/scopes";
import type { CellValue, ColumnProfile, RawDataset, Row } from "@/lib/types";

// Contrôle qualité du fichier (US-11) : le moteur repère doublons, cellules vides et valeurs incohérentes,
// puis propose des corrections. Rien n'est appliqué sans validation de l'utilisateur ; le fichier source
// n'est ni modifié ni conservé. Tout est calculé ici, sans IA : aucune donnée supplémentaire n'est envoyée.

/** Valeur de remplacement des catégories vides. */
export const UNKNOWN_LABEL = "Non renseigné";

// Au-delà, les listes détaillées sont tronquées (les décomptes restent exacts).
const MAX_GROUPS = 30;
const MAX_ITEMS = 50;
const MAX_ROWS_LISTED = 12;

// Colonnes d'identifiant métier : deux lignes avec le même numéro et des montants différents sont suspectes.
const IDENTIFIER_HEADER = /n[°o]\.?\s*(de\s+)?(commande|facture|bon|contrat|dossier|ticket|transaction)|num[ée]ro|r[ée]f[ée]rence|\bref\b|commande|facture|invoice|order|transaction|ticket/i;
// Mesure principale, pour chiffrer l'effet d'une correction (chiffre d'affaires de préférence).
const MAIN_MEASURE_HEADER = /montant|chiffre|\bca\b|total|prix|vente|revenu|recette/i;

export type ValueKind = "number" | "date" | "category";
export type EmptyPolicy = "ignore" | "exclude_rows" | "fill_unknown" | "fill_zero";
export type InvalidPolicy = "ignore" | "exclude_rows";
export type NearDuplicatePolicy = "keep" | "keep_first" | "keep_last";

const column = z.string().min(1).max(200);

export const CleaningPlanSchema = z.object({
  /** Supprime les lignes strictement identiques à une ligne précédente (la première est conservée). */
  removeDuplicates: z.boolean().default(false),
  /** Par colonne d'identifiant : une seule ligne par numéro (la première ou la dernière). */
  nearDuplicates: z.record(column, z.enum(["keep", "keep_first", "keep_last"])).default({}),
  /** Par colonne : traitement des cellules vides. */
  empty: z.record(column, z.enum(["ignore", "exclude_rows", "fill_unknown", "fill_zero"])).default({}),
  /** Par colonne : traitement des valeurs non conformes (texte dans un montant, date illisible). */
  invalid: z.record(column, z.enum(["ignore", "exclude_rows"])).default({}),
  /** Fusion des variantes d'une même catégorie (« nord », « NORD » → « Nord »). */
  merges: z
    .array(z.object({ column, from: z.array(z.string().max(500)).min(1).max(50), to: z.string().min(1).max(500) }))
    .max(500)
    .default([]),
});

export type CleaningPlan = z.infer<typeof CleaningPlanSchema>;

export const EMPTY_PLAN: CleaningPlan = { removeDuplicates: false, nearDuplicates: {}, empty: {}, invalid: {}, merges: [] };

/** Corrections appliquées, rappelées sur le dashboard, dans le PDF et dans les exports. */
export interface CleaningLog {
  rowsBefore: number;
  rowsAfter: number;
  lines: string[];
}

export interface QualityReport {
  fileName: string;
  rowCount: number;
  /** Remarques de lecture du fichier (ex. tableau extrait d'un PDF : lignes de total ignorées). */
  notes: string[];
  /** Mesure utilisée pour chiffrer l'effet des corrections (ex. « Montant HT »). */
  mainMeasure: string | null;
  duplicates: {
    extraRows: number;
    groups: { rows: number[]; preview: [string, string][] }[];
    /** Total de la mesure principale avant et après suppression des doublons. */
    impact: { before: number; after: number } | null;
  };
  nearDuplicates: {
    column: string;
    groupCount: number;
    extraRows: number;
    groups: { value: string; rows: number[]; differences: { column: string; values: string[] }[] }[];
    /** Effet sur la mesure principale, sur le fichier tel quel puis après suppression des doublons exacts. */
    impact: { before: number; keepFirst: number; keepLast: number } | null;
    impactAfterDuplicates: { before: number; keepFirst: number; keepLast: number } | null;
  }[];
  empties: { column: string; kind: ValueKind; count: number; rows: number[] }[];
  variants: { column: string; groups: { to: string; from: { value: string; count: number }[] }[] }[];
  invalid: { column: string; kind: "number" | "date"; count: number; items: { row: number; value: string }[] }[];
  issueCount: number;
}

/** Numéro de ligne affiché à l'utilisateur : la ligne 1 du fichier contient les en-têtes. */
const lineNumber = (index: number) => index + 2;

const display = (v: CellValue) => (v === null ? "" : String(v));

function kindOf(c: ColumnProfile): ValueKind {
  return c.type === "number" ? "number" : c.type === "date" ? "date" : "category";
}

/** Colonnes prises en compte : celles que le dashboard peut utiliser (identifiants directs, textes libres et données sensibles exclus). */
function usableColumns(raw: RawDataset): ColumnProfile[] {
  return profileDataset(raw).profile.columns.filter((c) => c.role !== "ignored");
}

/** Clé de comparaison des variantes : sans accents, casse, ponctuation ni espaces superflus. */
export function variantKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[-_'’.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rowKey(raw: RawDataset, row: Row): string {
  return JSON.stringify(raw.columns.map((c) => row[c]));
}

function sum(rows: Row[], measure: string | null): number {
  if (!measure) return 0;
  return rows.reduce((s, r) => s + (parseNumber(r[measure]) ?? 0), 0);
}

function isInvalid(v: CellValue, kind: ValueKind): boolean {
  if (v === null) return false;
  if (kind === "number") return parseNumber(v) === null;
  if (kind === "date") return parseDate(v) === null;
  return false;
}

/** Analyse le fichier et propose des corrections ; ne modifie rien. */
export function analyzeQuality(raw: RawDataset): QualityReport {
  const columns = usableColumns(raw);
  const measures = columns.filter((c) => c.type === "number");
  const mainMeasure = (measures.find((c) => MAIN_MEASURE_HEADER.test(c.name)) ?? measures[0])?.name ?? null;
  const preview = columns.slice(0, 5).map((c) => c.name);

  // Doublons exacts : toutes les colonnes identiques.
  const byKey = new Map<string, number[]>();
  raw.rows.forEach((r, i) => {
    const key = rowKey(raw, r);
    const list = byKey.get(key);
    if (list) list.push(i);
    else byKey.set(key, [i]);
  });
  const duplicateGroups = [...byKey.values()].filter((g) => g.length > 1);
  const extraRows = duplicateGroups.reduce((s, g) => s + g.length - 1, 0);
  const deduplicated = removeExactDuplicates(raw, raw.rows);

  // Quasi-doublons : même numéro de commande ou de facture, mais lignes différentes.
  const nearDuplicates: QualityReport["nearDuplicates"] = [];
  for (const c of raw.columns) {
    if (!IDENTIFIER_HEADER.test(c)) continue;
    const present = raw.rows.filter((r) => r[c] !== null);
    if (present.length === 0 || new Set(present.map((r) => display(r[c]))).size / present.length < 0.5) continue;
    const byId = new Map<string, number[]>();
    raw.rows.forEach((r, i) => {
      if (r[c] === null) return;
      const id = display(r[c]);
      byId.set(id, [...(byId.get(id) ?? []), i]);
    });
    const groups = [...byId.entries()].filter(([, rows]) => rows.length > 1 && new Set(rows.map((i) => rowKey(raw, raw.rows[i]))).size > 1);
    if (groups.length === 0) continue;
    nearDuplicates.push({
      column: c,
      groupCount: groups.length,
      extraRows: groups.reduce((s, [, rows]) => s + rows.length - 1, 0),
      groups: groups.slice(0, MAX_GROUPS).map(([value, rows]) => ({
        value,
        rows: rows.slice(0, MAX_ROWS_LISTED).map(lineNumber),
        differences: raw.columns
          .filter((other) => other !== c && new Set(rows.map((i) => display(raw.rows[i][other]))).size > 1)
          .map((other) => ({ column: other, values: rows.slice(0, MAX_ROWS_LISTED).map((i) => display(raw.rows[i][other])) })),
      })),
      impact: mainMeasure ? nearImpact(raw.rows, c, mainMeasure) : null,
      impactAfterDuplicates: mainMeasure ? nearImpact(deduplicated, c, mainMeasure) : null,
    });
  }

  // Cellules vides, valeurs non conformes et variantes de catégories, colonne par colonne.
  const empties: QualityReport["empties"] = [];
  const invalid: QualityReport["invalid"] = [];
  const variants: QualityReport["variants"] = [];
  // Fichiers reliés (US-15) : une colonne propre à un fichier est vide, par construction, sur les lignes de l'autre.
  const scopes = columnScopes(raw.columns, raw.rows);
  for (const c of columns) {
    const kind = kindOf(c);
    const emptyRows = raw.rows.flatMap((r, i) => (r[c.name] === null && inScope(scopes, r, c.name) ? [i] : []));
    if (emptyRows.length > 0) empties.push({ column: c.name, kind, count: emptyRows.length, rows: emptyRows.slice(0, MAX_ROWS_LISTED).map(lineNumber) });

    if (kind !== "category") {
      const bad = raw.rows.flatMap((r, i) => (isInvalid(r[c.name], kind) ? [{ row: lineNumber(i), value: display(r[c.name]) }] : []));
      if (bad.length > 0) invalid.push({ column: c.name, kind, count: bad.length, items: bad.slice(0, MAX_ITEMS) });
      continue;
    }

    const counts = new Map<string, number>();
    for (const r of raw.rows) if (r[c.name] !== null) counts.set(display(r[c.name]), (counts.get(display(r[c.name])) ?? 0) + 1);
    const byVariant = new Map<string, { value: string; count: number }[]>();
    for (const [value, count] of counts) {
      const key = variantKey(value);
      if (key === "") continue;
      byVariant.set(key, [...(byVariant.get(key) ?? []), { value, count }]);
    }
    const groups = [...byVariant.values()]
      .filter((g) => g.length > 1)
      .map((g) => {
        const sorted = [...g].sort((a, b) => b.count - a.count || preferredSpelling(b.value) - preferredSpelling(a.value) || a.value.localeCompare(b.value, "fr"));
        return { to: sorted[0].value, from: sorted };
      });
    if (groups.length > 0) variants.push({ column: c.name, groups: groups.slice(0, MAX_GROUPS) });
  }

  const report: QualityReport = {
    fileName: raw.fileName,
    rowCount: raw.rows.length,
    notes: raw.notes ?? [],
    mainMeasure,
    duplicates: {
      extraRows,
      groups: duplicateGroups.slice(0, MAX_GROUPS).map((g) => ({
        rows: g.slice(0, MAX_ROWS_LISTED).map(lineNumber),
        preview: preview.map((name) => [name, display(raw.rows[g[0]][name])] as [string, string]),
      })),
      impact: mainMeasure && extraRows > 0 ? { before: sum(raw.rows, mainMeasure), after: sum(deduplicated, mainMeasure) } : null,
    },
    nearDuplicates,
    empties,
    variants,
    invalid,
    issueCount: 0,
  };
  report.issueCount =
    (extraRows > 0 ? 1 : 0) + nearDuplicates.length + empties.length + invalid.length + variants.reduce((s, v) => s + v.groups.length, 0);
  return report;
}

/** Orthographe préférée à fréquence égale : sans espaces superflus, ni tout en minuscules ni tout en majuscules. */
function preferredSpelling(value: string): number {
  let score = 0;
  if (value === value.trim() && !/\s{2,}/.test(value)) score += 2;
  if (value !== value.toLowerCase() && value !== value.toUpperCase()) score += 1;
  return score;
}

function removeExactDuplicates(raw: RawDataset, rows: Row[]): Row[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const key = rowKey(raw, r);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function nearImpact(rows: Row[], column: string, measure: string) {
  return { before: sum(rows, measure), keepFirst: sum(keepOnePerId(rows, column, "keep_first"), measure), keepLast: sum(keepOnePerId(rows, column, "keep_last"), measure) };
}

function keepOnePerId(rows: Row[], column: string, policy: "keep_first" | "keep_last"): Row[] {
  const chosen = new Map<string, Row>();
  for (const r of rows) {
    if (r[column] === null) continue;
    const id = display(r[column]);
    if (policy === "keep_last" || !chosen.has(id)) chosen.set(id, r);
  }
  const kept = new Set(chosen.values());
  return rows.filter((r) => r[column] === null || kept.has(r));
}

/** Plan proposé par défaut : les corrections sans risque (doublons exacts, fusion des variantes). */
export function recommendedPlan(report: QualityReport): CleaningPlan {
  return {
    ...EMPTY_PLAN,
    removeDuplicates: report.duplicates.extraRows > 0,
    merges: report.variants.flatMap((v) => v.groups.map((g) => ({ column: v.column, from: g.from.map((f) => f.value).filter((value) => value !== g.to), to: g.to }))),
  };
}

export function isEmptyPlan(plan: CleaningPlan): boolean {
  return (
    !plan.removeDuplicates &&
    plan.merges.length === 0 &&
    Object.values(plan.nearDuplicates).every((p) => p === "keep") &&
    Object.values(plan.empty).every((p) => p === "ignore") &&
    Object.values(plan.invalid).every((p) => p === "ignore")
  );
}

const plural = (n: number, word: string) => `${n.toLocaleString("fr-FR")} ${word}${n > 1 ? "s" : ""}`;

/**
 * Applique les corrections validées à une copie des lignes ; le fichier source n'est pas modifié.
 * Ordre : doublons exacts, quasi-doublons, fusion des variantes, cellules vides, valeurs non conformes.
 * Rejouée à chaque actualisation du dashboard avec un fichier de même structure.
 */
export function applyCleaning(raw: RawDataset, plan: CleaningPlan): { dataset: RawDataset; log: CleaningLog } {
  const lines: string[] = [];
  const known = new Set(raw.columns);
  const kinds = new Map(usableColumns(raw).map((c) => [c.name, kindOf(c)]));
  const missing = (c: string) => {
    if (known.has(c)) return false;
    lines.push(`Colonne « ${c} » absente du fichier : correction non appliquée.`);
    return true;
  };
  let rows = raw.rows.map((r) => ({ ...r }));

  if (plan.removeDuplicates) {
    const before = rows.length;
    rows = removeExactDuplicates(raw, rows);
    if (before > rows.length) lines.push(`${plural(before - rows.length, "doublon")} exact${before - rows.length > 1 ? "s" : ""} supprimé${before - rows.length > 1 ? "s" : ""} (la première ligne de chaque groupe est conservée).`);
  }

  for (const [c, policy] of Object.entries(plan.nearDuplicates)) {
    if (policy === "keep" || missing(c)) continue;
    const before = rows.length;
    rows = keepOnePerId(rows, c, policy);
    if (before > rows.length) {
      lines.push(`Colonne « ${c} » : ${plural(before - rows.length, "ligne")} au même numéro retirée${before - rows.length > 1 ? "s" : ""} (${policy === "keep_first" ? "première" : "dernière"} ligne conservée).`);
    }
  }

  for (const merge of plan.merges) {
    if (missing(merge.column)) continue;
    const from = new Set(merge.from.filter((v) => v !== merge.to));
    let changed = 0;
    for (const r of rows) {
      if (r[merge.column] !== null && from.has(display(r[merge.column]))) {
        r[merge.column] = merge.to;
        changed++;
      }
    }
    if (changed > 0) lines.push(`Colonne « ${merge.column} » : ${[...from].map((v) => `« ${v} »`).join(", ")} fusionné${from.size > 1 ? "s" : ""} en « ${merge.to} » (${plural(changed, "cellule")}).`);
  }

  // Fichiers reliés : seules les cellules vides attendues sont traitées, jamais celles d'une colonne propre à l'autre fichier.
  const scopes = columnScopes(raw.columns, raw.rows);
  for (const [c, policy] of Object.entries(plan.empty)) {
    if (policy === "ignore" || missing(c)) continue;
    const kind = kinds.get(c) ?? "category";
    if (policy === "exclude_rows") {
      const before = rows.length;
      rows = rows.filter((r) => r[c] !== null || !inScope(scopes, r, c));
      if (before > rows.length) lines.push(`Colonne « ${c} » : ${plural(before - rows.length, "ligne")} sans valeur exclue${before - rows.length > 1 ? "s" : ""}.`);
      continue;
    }
    // Remplacement : « Non renseigné » pour une catégorie, 0 pour un nombre (confirmé par l'utilisateur).
    const value = policy === "fill_zero" ? (kind === "number" ? 0 : null) : kind === "category" ? UNKNOWN_LABEL : null;
    if (value === null) {
      lines.push(`Colonne « ${c} » : remplacement non applicable à ce type de colonne, cellules vides laissées telles quelles.`);
      continue;
    }
    let filled = 0;
    for (const r of rows) {
      if (r[c] === null && inScope(scopes, r, c)) {
        r[c] = value;
        filled++;
      }
    }
    if (filled > 0) lines.push(`Colonne « ${c} » : ${plural(filled, "cellule")} vide${filled > 1 ? "s" : ""} remplacée${filled > 1 ? "s" : ""} par ${value === 0 ? "0" : `« ${value} »`}.`);
  }

  for (const [c, policy] of Object.entries(plan.invalid)) {
    if (policy === "ignore" || missing(c)) continue;
    const kind = kinds.get(c);
    if (!kind || kind === "category") continue;
    const before = rows.length;
    rows = rows.filter((r) => !isInvalid(r[c], kind));
    if (before > rows.length) {
      lines.push(`Colonne « ${c} » : ${plural(before - rows.length, "ligne")} à valeur non ${kind === "number" ? "numérique" : "reconnue comme date"} exclue${before - rows.length > 1 ? "s" : ""}.`);
    }
  }

  if (rows.length === 0) lines.push("Attention : toutes les lignes ont été exclues par les corrections.");
  return { dataset: { ...raw, rows }, log: { rowsBefore: raw.rows.length, rowsAfter: rows.length, lines } };
}

/** Fichier corrigé (CSV point-virgule, UTF-8) à télécharger ; jamais conservé par le serveur. */
export function cleanedCsv(dataset: RawDataset): string {
  const cell = (v: CellValue) => {
    if (v === null) return "";
    if (typeof v === "number") return String(v).replace(".", ",");
    // Neutralise les formules (« =… ») qu'un tableur exécuterait à l'ouverture.
    const safe = /^[=+\-@\t\r]/.test(v) && parseNumber(v) === null ? `'${v}` : v;
    return /[;"\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [dataset.columns.map(cell).join(";"), ...dataset.rows.map((r) => dataset.columns.map((c) => cell(r[c])).join(";"))];
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/** Nom du fichier corrigé : « ventes-corrige.csv ». */
export function cleanedFileName(fileName: string): string {
  return `${fileName.replace(/\.(csv|xlsx|xls|pdf)$/i, "") || "fichier"}-corrige.csv`;
}
