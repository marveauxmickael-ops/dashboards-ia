import ExcelJS from "exceljs";
import { chartPalette, readableOnWhite, textOn, type Branding } from "@/lib/branding";
import type { ValueFormat } from "@/lib/engine/compute";
import type { DashboardResult } from "@/lib/pipeline";

// Export d'un dashboard enregistré (US-09) : les valeurs exportées sont celles calculées
// par le moteur et enregistrées, accompagnées de leur calcul et de la date d'export.

export interface ExportMeta {
  organization: string;
  createdAt: Date;
  exportedAt: Date;
  aiMode: string;
  /** Charte graphique : logo en tête de la synthèse et couleur des en-têtes. */
  branding?: Branding;
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

/** Dimensions d'un PNG encodé en data URL (en-tête IHDR), sans le décoder entièrement. */
function pngSize(dataUrl: string): { width: number; height: number } | null {
  const bytes = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1, dataUrl.indexOf(",") + 1 + 40), "base64");
  if (bytes.length < 24 || bytes.toString("ascii", 12, 16) !== "IHDR") return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

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
  wb.creator = "Lisio";
  wb.created = meta.exportedAt;
  const used = new Set<string>();
  const brand = chartPalette(meta.branding)[0];
  const argb = (hex: string) => `FF${hex.slice(1).toUpperCase()}`;
  const header = (row: ExcelJS.Row) => {
    row.font = { bold: true, color: { argb: argb(textOn(brand)) } };
    row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(brand) } };
  };

  // Synthèse : contexte, indicateurs et constats.
  const summary = wb.addWorksheet(sheetName("Synthèse", used));
  summary.columns = [{ width: 34 }, { width: 22 }, { width: 50 }, { width: 50 }, { width: 40 }];
  summary.addRow([result.title]).font = { bold: true, size: 14, color: { argb: argb(readableOnWhite(brand)) } };
  const logo = meta.branding?.logo;
  const size = logo ? pngSize(logo) : null;
  if (logo && size) {
    // Logo à droite du titre, hauteur limitée à 48 px.
    const scale = Math.min(1, 48 / size.height, 200 / size.width);
    const image = wb.addImage({ base64: logo, extension: "png" });
    summary.addImage(image, { tl: { col: 2, row: 0 }, ext: { width: size.width * scale, height: size.height * scale } });
    summary.getRow(1).height = 40;
  }
  for (const [label, value] of [
    ["Organisation", meta.organization],
    ["Fichier source", result.fileName],
    ["Lignes analysées", result.profile.rowCount.toLocaleString("fr-FR")],
    ["Période couverte", result.period ? `${result.period.from} → ${result.period.to}` : "Pas de colonne de date"],
    ["Dashboard créé le", dateFr(meta.createdAt)],
    ["Exporté le", dateFr(meta.exportedAt)],
    ["Mode IA", meta.aiMode === "strict" ? "Strict (noms et types de colonnes uniquement)" : "Standard (données pseudonymisées)"],
  ]) {
    const row = summary.addRow([label, value]);
    row.getCell(1).font = { bold: true };
  }

  // Corrections du contrôle qualité (US-11) validées par l'utilisateur, appliquées avant le calcul.
  const cleaning = result.cleaning?.log;
  if (cleaning && cleaning.lines.length > 0) {
    summary.addRow([]);
    header(summary.addRow([`Corrections appliquées au fichier (${cleaning.rowsBefore} → ${cleaning.rowsAfter} lignes)`, "", "", "", ""]));
    for (const line of cleaning.lines) summary.addRow([line]).alignment = { wrapText: false, vertical: "top" };
  }

  summary.addRow([]);
  header(summary.addRow(["Indicateur", "Valeur", "Calcul", "Définition", "Données manquantes"]));
  for (const k of result.kpis) {
    const quality = (k.quality ?? []).map((q) => `${q.missing} ligne(s) sans valeur pour « ${q.column} », ignorée(s)`).join(" ; ");
    const row = summary.addRow([k.label, k.value ?? "Donnée indisponible", k.formula, k.description, quality]);
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
    if (chart.maskedCount) ws.addRow([`${chart.maskedCount} catégorie(s) masquée(s) par l'utilisateur.`]);
    ws.addRow([]);
    header(ws.addRow([chart.chronological ? "Période" : "Catégorie", chart.measureLabel]));
    for (const d of chart.data) {
      const row = ws.addRow([d.category, d.value]);
      row.getCell(2).numFmt = NUM_FMT[chart.format];
    }
  }

  // Analyse des variations (US-10) : chiffres du moteur, explications vérifiées, pistes d'amélioration.
  const analysis = result.analysis;
  if (analysis && analysis.variations.length > 0) {
    const ws = wb.addWorksheet(sheetName("Analyse des variations", used));
    ws.columns = [{ width: 30 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 70 }];
    ws.addRow(["Analyse des variations"]).font = { bold: true, size: 13 };
    ws.addRow([analysis.writtenBy === "ai" ? "Rédigée par l'IA sur données pseudonymisées ; chiffres vérifiés par le moteur." : "Rédigée automatiquement, sans IA ; chiffres vérifiés par le moteur."]);
    for (const n of analysis.notes) ws.addRow([n]);
    const insightById = new Map(analysis.insights.map((i) => [i.variationId, i]));
    for (const v of analysis.variations) {
      ws.addRow([]);
      header(ws.addRow([`${v.direction === "down" ? "Baisse" : "Hausse"} · ${v.measureLabel}`, "Avant", "Après", "Variation", `${v.period} comparé à ${v.previousPeriod}`]));
      const row = ws.addRow(["Total", v.previous, v.current, v.changePct, ""]);
      row.getCell(2).numFmt = row.getCell(3).numFmt = NUM_FMT[v.format];
      row.getCell(4).numFmt = "+0.0%;-0.0%";
      for (const item of [...(v.drivers[0]?.items ?? []), ...(v.drivers[0]?.opposite ?? [])]) {
        const r = ws.addRow([`${v.drivers[0].dimension} : ${item.category}`, item.previous, item.current, item.previous !== 0 ? item.delta / Math.abs(item.previous) : null, ""]);
        r.getCell(2).numFmt = r.getCell(3).numFmt = NUM_FMT[v.format];
        r.getCell(4).numFmt = "+0.0%;-0.0%";
      }
      const insight = insightById.get(v.id);
      for (const f of insight?.facts ?? []) ws.addRow(["Constat", STATUS_LABEL[f.status] ?? f.status, "", "", f.text]).alignment = { wrapText: true, vertical: "top" };
      for (const h of insight?.hypotheses ?? []) ws.addRow(["Hypothèse", "", "", "", h]).alignment = { wrapText: true, vertical: "top" };
      for (const sug of insight?.suggestions ?? []) ws.addRow(["Piste d'amélioration", "", "", "", sug.text]).alignment = { wrapText: true, vertical: "top" };
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
    ...(result.cleaning?.log.lines ?? []).map((line) => ["Correction appliquée", line, "", ""]),
    [],
    ["Section", "Libellé", "Catégorie", "Valeur"],
    ...result.kpis.map((k) => ["Indicateur", k.label, "", k.value]),
    ...result.charts.flatMap((c) => c.data.map((d) => [c.title, c.measureLabel, d.category, d.value])),
    ...(result.analysis?.variations ?? []).flatMap((v) => {
      const insight = result.analysis?.insights.find((i) => i.variationId === v.id);
      const label = `${v.direction === "down" ? "Baisse" : "Hausse"} ${v.measureLabel} (${v.period} / ${v.previousPeriod})`;
      return [
        ["Analyse des variations", label, "Variation", v.changePct],
        ...(insight?.facts ?? []).map((f) => ["Analyse des variations", label, "Constat", f.text]),
        ...(insight?.hypotheses ?? []).map((h) => ["Analyse des variations", label, "Hypothèse", h]),
        ...(insight?.suggestions ?? []).map((sg) => ["Analyse des variations", label, "Piste d'amélioration", sg.text]),
      ];
    }),
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
