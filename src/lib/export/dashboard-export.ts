import ExcelJS from "exceljs";
import type { ValueFormat } from "@/lib/engine/compute";
import type { DashboardResult } from "@/lib/pipeline";

// Export d'un dashboard enregistré (US-09) : les valeurs exportées sont celles calculées
// par le moteur et enregistrées, accompagnées de leur calcul et de la date d'export.

export interface ExportMeta {
  organization: string;
  createdAt: Date;
  exportedAt: Date;
  aiMode: string;
}

const STATUS_LABEL: Record<string, string> = {
  verified: "Chiffres vérifiés",
  mismatch: "À vérifier",
  unverified: "Chiffres non sourcés",
  qualitative: "Sans chiffre",
};

const TREATMENT_LABEL: Record<string, string> = {
  send: "Transmise",
  tokenize: "Jetons",
  drop: "Supprimée",
  block: "Bloquée (RGPD)",
  exclude: "Exclue",
};

const NUM_FMT: Record<ValueFormat, string> = {
  currency: '#,##0.00 "€"',
  number: "#,##0.##",
  percent: "0.0%",
};

const dateFr = (d: Date) =>
  new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" }).format(d);

/** Nom de fichier lisible et sûr : « tableau-de-bord-de-l-activite-2026-10-10 ». */
export function exportFileName(title: string, exportedAt: Date, extension: "xlsx" | "csv"): string {
  const slug = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "dashboard"}-${exportedAt.toISOString().slice(0, 10)}.${extension}`;
}

/** Nom d'onglet Excel valide : 31 caractères, sans : \ / ? * [ ], unique dans le classeur. */
function sheetName(base: string, used: Set<string>): string {
  const clean = base.replace(/[:\\/?*[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 28) || "Graphique";
  let name = clean;
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${clean.slice(0, 26)} ${i}`;
  used.add(name.toLowerCase());
  return name;
}

export async function buildXlsx(result: DashboardResult, meta: ExportMeta): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Dashboards IA";
  wb.created = meta.exportedAt;
  const used = new Set<string>();
  const header = (row: ExcelJS.Row) => {
    row.font = { bold: true, color: { argb: "FFFFFFFF" } };
    row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0D5C70" } };
  };

  // Synthèse : contexte, indicateurs et constats.
  const summary = wb.addWorksheet(sheetName("Synthèse", used));
  summary.columns = [{ width: 34 }, { width: 22 }, { width: 70 }];
  summary.addRow([result.title]).font = { bold: true, size: 14 };
  for (const [label, value] of [
    ["Organisation", meta.organization],
    ["Fichier source", result.fileName],
    ["Lignes analysées", result.profile.rowCount.toLocaleString("fr-FR")],
    ["Dashboard créé le", dateFr(meta.createdAt)],
    ["Exporté le", dateFr(meta.exportedAt)],
    ["Mode IA", meta.aiMode === "strict" ? "Strict (noms et types de colonnes uniquement)" : "Standard (données pseudonymisées)"],
  ]) {
    const row = summary.addRow([label, value]);
    row.getCell(1).font = { bold: true };
  }

  summary.addRow([]);
  header(summary.addRow(["Indicateur", "Valeur", "Calcul"]));
  for (const k of result.kpis) {
    const row = summary.addRow([k.label, k.value, k.formula]);
    row.getCell(2).numFmt = NUM_FMT[k.format];
  }

  if (result.insights.length > 0) {
    summary.addRow([]);
    header(summary.addRow(["Constat", "Statut", "Détail"]));
    for (const i of result.insights) {
      const row = summary.addRow([i.text, STATUS_LABEL[i.status] ?? i.status, i.details.join(" ")]);
      row.alignment = { wrapText: true, vertical: "top" };
    }
  }

  // Un onglet par graphique, avec les valeurs exactes du dashboard.
  for (const chart of result.charts) {
    const ws = wb.addWorksheet(sheetName(chart.title, used));
    ws.columns = [{ width: 36 }, { width: 20 }];
    ws.addRow([chart.title]).font = { bold: true, size: 13 };
    ws.addRow([`Calcul : ${chart.formula}`]).font = { italic: true, color: { argb: "FF566273" } };
    if (chart.othersCount > 0) ws.addRow([`${chart.othersCount} autre(s) catégorie(s) non affichée(s) dans le dashboard.`]);
    ws.addRow([]);
    header(ws.addRow([chart.chronological ? "Période" : "Catégorie", chart.measureLabel]));
    for (const d of chart.data) {
      const row = ws.addRow([d.category, d.value]);
      row.getCell(2).numFmt = NUM_FMT[chart.format];
    }
  }

  // Qualité des données et traitement appliqué avant l'IA, pour la traçabilité.
  const quality = wb.addWorksheet(sheetName("Données et confidentialité", used));
  quality.columns = [{ width: 28 }, { width: 16 }, { width: 18 }, { width: 12 }, { width: 70 }];
  header(quality.addRow(["Colonne", "Type", "Envoi à l'IA", "Manquants", "Raison"]));
  for (const c of result.profile.columns) quality.addRow([c.name, c.type, TREATMENT_LABEL[c.treatment] ?? c.treatment, c.missing, c.reason]);
  if (result.profile.warnings.length > 0) {
    quality.addRow([]);
    quality.addRow(["Points d'attention"]).font = { bold: true };
    for (const w of result.profile.warnings) quality.addRow([w]);
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** CSV (séparateur point-virgule, format français) : indicateurs puis données de chaque graphique. */
export function buildCsv(result: DashboardResult, meta: ExportMeta): string {
  const rows: (string | number | null)[][] = [
    ["Dashboard", result.title, "", ""],
    ["Exporté le", dateFr(meta.exportedAt), "", ""],
    [],
    ["Section", "Libellé", "Catégorie", "Valeur"],
    ...result.kpis.map((k) => ["Indicateur", k.label, "", k.value]),
    ...result.charts.flatMap((c) => c.data.map((d) => [c.title, c.measureLabel, d.category, d.value])),
  ];
  return "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
}

function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(Math.round(v * 100) / 100).replace(".", ",");
  // Neutralise les formules (« =… ») qu'un tableur exécuterait à l'ouverture.
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[;"\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
