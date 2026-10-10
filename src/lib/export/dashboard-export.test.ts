import { readFileSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { generateDashboard } from "@/lib/pipeline";
import { buildCsv, buildXlsx, exportFileName } from "./dashboard-export";

const demo = readFileSync(path.resolve(import.meta.dirname, "../../../public/demo/ventes-demo.csv"), "utf-8");
const meta = { organization: "Org test", createdAt: new Date("2026-10-01T08:00:00Z"), exportedAt: new Date("2026-10-10T09:30:00Z"), aiMode: "standard" };

async function demoResult() {
  const data = new TextEncoder().encode(demo).buffer as ArrayBuffer;
  return generateDashboard({ fileName: "ventes-demo.csv", data, mode: "standard", organizationId: "org-1" });
}

describe("export Excel", () => {
  it("contient la synthèse datée, les KPI calculés et un onglet par graphique", async () => {
    const result = await demoResult();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildXlsx(result, meta)) as unknown as ArrayBuffer);

    const analysisSheet = result.analysis && result.analysis.variations.length > 0 ? ["Analyse des variations"] : [];
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Synthèse", ...result.charts.map(() => expect.any(String)), ...analysisSheet, "Données et confidentialité"]);
    const summary = wb.getWorksheet("Synthèse")!;
    const cells = summary.getSheetValues().flat().filter((v) => v !== undefined && v !== null);
    expect(cells).toContain("Exporté le");
    expect(cells).toContain("Org test");
    const total = result.kpis.find((k) => k.id === "k_total")!;
    expect(cells).toContain(total.value);
    // Les graphiques exportent les valeurs en clair, identiques au dashboard.
    const bar = result.charts.find((c) => c.type === "bar")!;
    const sheet = wb.worksheets[1 + result.charts.indexOf(bar)];
    expect(sheet.getSheetValues().flat()).toContain(bar.data[0].category);
  });
});

describe("export CSV", () => {
  it("neutralise les formules et utilise la virgule décimale", async () => {
    const result = await demoResult();
    const hostile = { ...result, title: "=HYPERLINK(\"http://x\")", kpis: [{ ...result.kpis[0], label: "+cmd", value: 1234.5 }] };
    const csv = buildCsv(hostile, meta);
    expect(csv).toContain("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(csv).toContain("Indicateur;'+cmd;;1234,5");
    expect(csv.startsWith("﻿")).toBe(true);
  });
});

describe("nom de fichier", () => {
  it("est lisible, sans accents ni caractères spéciaux, et daté", () => {
    expect(exportFileName("Tableau de bord de l'activité / 2026", meta.exportedAt, "xlsx")).toBe("tableau-de-bord-de-l-activite-2026-2026-10-10.xlsx");
    expect(exportFileName("***", meta.exportedAt, "csv")).toBe("dashboard-2026-10-10.csv");
  });
});
