import Papa from "papaparse";
import ExcelJS from "exceljs";
import type { CellValue, RawDataset, Row } from "@/lib/types";
import { extractPdfTable, PdfTableError } from "./pdf";

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_ROWS = 200_000;

export class ImportError extends Error {}

/** Lit un fichier CSV ou XLSX et renvoie les lignes brutes (valeurs en clair). */
export async function parseFile(fileName: string, data: ArrayBuffer): Promise<RawDataset> {
  if (data.byteLength > MAX_FILE_BYTES) {
    throw new ImportError("Le fichier dépasse 20 Mo. Réduisez la période ou le nombre de colonnes.");
  }
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv")) return parseCsv(fileName, new TextDecoder("utf-8").decode(data));
  if (lower.endsWith(".xlsx")) return parseXlsx(fileName, data);
  if (lower.endsWith(".pdf")) return parsePdf(fileName, data);
  throw new ImportError("Format non pris en charge. Importez un fichier .csv, .xlsx ou .pdf.");
}

export function parseCsv(fileName: string, text: string): RawDataset {
  const result = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  const columns = (result.meta.fields ?? []).filter((c) => c !== "");
  if (columns.length === 0) throw new ImportError("Aucune colonne détectée : la première ligne doit contenir les en-têtes.");
  const rows: Row[] = result.data.map((r) => {
    const row: Row = {};
    for (const c of columns) row[c] = normalizeCell(r[c]);
    return row;
  });
  return checkRows({ fileName, columns: uniqueColumns(columns), rows });
}

export async function parseXlsx(fileName: string, data: ArrayBuffer): Promise<RawDataset> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(data);
  } catch {
    throw new ImportError("Le fichier Excel est illisible ou protégé par un mot de passe.");
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new ImportError("Le classeur ne contient aucune feuille.");

  const header = sheet.getRow(1);
  const columns: string[] = [];
  header.eachCell({ includeEmpty: false }, (cell, col) => {
    columns[col - 1] = String(cellToValue(cell.value) ?? "").trim();
  });
  const named = columns.map((c, i) => c || `Colonne ${i + 1}`);
  if (named.length === 0) throw new ImportError("Aucune colonne détectée : la première ligne doit contenir les en-têtes.");

  const rows: Row[] = [];
  sheet.eachRow({ includeEmpty: false }, (r, index) => {
    if (index === 1) return;
    const row: Row = {};
    let empty = true;
    named.forEach((c, i) => {
      const v = normalizeCell(cellToValue(r.getCell(i + 1).value));
      if (v !== null) empty = false;
      row[c] = v;
    });
    if (!empty) rows.push(row);
  });
  return checkRows({ fileName, columns: uniqueColumns(named), rows });
}

/** PDF : tableau reconstruit par le moteur à partir de la position du texte (sans IA). */
export async function parsePdf(fileName: string, data: ArrayBuffer): Promise<RawDataset> {
  try {
    const { columns, rows, notes } = await extractPdfTable(data);
    const normalized: Row[] = rows.map((r) => Object.fromEntries(columns.map((c) => [c, normalizeCell(r[c])])));
    return { ...checkRows({ fileName, columns: uniqueColumns(columns), rows: normalized }), notes };
  } catch (error) {
    if (error instanceof PdfTableError) throw new ImportError(error.message);
    throw error;
  }
}

function checkRows(ds: RawDataset): RawDataset {
  if (ds.rows.length === 0) throw new ImportError("Le fichier ne contient aucune ligne de données.");
  if (ds.rows.length > MAX_ROWS) {
    throw new ImportError(`Le fichier contient ${ds.rows.length} lignes ; la limite actuelle est de ${MAX_ROWS}.`);
  }
  return ds;
}

function uniqueColumns(columns: string[]): string[] {
  const seen = new Set<string>();
  for (const c of columns) {
    if (seen.has(c)) throw new ImportError(`La colonne « ${c} » apparaît deux fois. Renommez l'une des deux.`);
    seen.add(c);
  }
  return columns;
}

function normalizeCell(v: unknown): CellValue {
  if (v === undefined || v === null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

// ExcelJS renvoie des objets pour les formules, liens et textes enrichis.
function cellToValue(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("result" in v) return cellToValue(v.result as ExcelJS.CellValue);
    if ("text" in v && typeof v.text === "string") return v.text;
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("error" in v) return null;
  }
  return v;
}
