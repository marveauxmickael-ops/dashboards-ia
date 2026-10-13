import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/ingest/parse";
import { analyzeQuality, applyCleaning, cleanedCsv, CleaningPlanSchema, EMPTY_PLAN, isEmptyPlan, recommendedPlan, UNKNOWN_LABEL } from "@/lib/quality";
import { generateDashboard, recomputeDashboard } from "@/lib/pipeline";
import { NO_FILTERS } from "@/lib/filters";
import { buildCsv, buildXlsx } from "@/lib/export/dashboard-export";
import ExcelJS from "exceljs";

const csv = [
  "Date;N° commande;Région;Produit;Montant HT",
  "05/01/2026;C-001;Nord;Formation;1 000,00",
  "05/01/2026;C-001;Nord;Formation;1 000,00",
  "06/01/2026;C-002;nord;Matériel;500,00",
  "07/01/2026;C-003;NORD;Matériel;200,00",
  "08/01/2026;C-004;Sud;Formation;300,00",
  "09/01/2026;C-004;Sud;Formation;350,00",
  "10/01/2026;C-005;Ouest;Matériel;N/A",
  "11/01/2026;C-006;Sud;Formation;",
  "12/01/2026;C-007;;Matériel;400,00",
  "13/02/2026;C-008;Ouest;Formation;450,00",
  "14/02/2026;C-009;Est;Formation;600,00",
].join("\n");

const raw = () => parseCsv("ventes.csv", csv);

describe("contrôle qualité du fichier (US-11)", () => {
  const report = analyzeQuality(raw());

  it("repère les doublons exacts et chiffre leur effet sur le chiffre d'affaires", () => {
    expect(report.duplicates.extraRows).toBe(1);
    expect(report.duplicates.groups[0].rows).toEqual([2, 3]);
    expect(report.mainMeasure).toBe("Montant HT");
    expect(report.duplicates.impact).toEqual({ before: 4800, after: 3800 });
  });

  it("repère les quasi-doublons : même numéro de commande, montants différents", () => {
    expect(report.nearDuplicates).toHaveLength(1);
    const near = report.nearDuplicates[0];
    expect(near.column).toBe("N° commande");
    // C-001 (doublon exact) n'est pas un quasi-doublon.
    expect(near.groups.map((g) => g.value)).toEqual(["C-004"]);
    // Après suppression du doublon exact C-001, seule la ligne C-004 à 300 € est retirée.
    expect(near.impactAfterDuplicates).toEqual({ before: 3800, keepFirst: 3450, keepLast: 3500 });
    expect(near.groups[0].differences).toEqual([
      { column: "Date", values: ["08/01/2026", "09/01/2026"] },
      { column: "Montant HT", values: ["300,00", "350,00"] },
    ]);
  });

  it("compte les cellules vides par colonne, avec leur type", () => {
    expect(report.empties).toEqual([
      { column: "Région", kind: "category", count: 1, rows: [10] },
      { column: "Montant HT", kind: "number", count: 1, rows: [9] },
    ]);
  });

  it("regroupe les variantes d'une même catégorie", () => {
    expect(report.variants).toEqual([
      {
        column: "Région",
        groups: [{ to: "Nord", from: [{ value: "Nord", count: 2 }, { value: "nord", count: 1 }, { value: "NORD", count: 1 }] }],
      },
    ]);
  });

  it("liste ligne par ligne le texte dans une colonne de montants", () => {
    expect(report.invalid).toEqual([{ column: "Montant HT", kind: "number", count: 1, items: [{ row: 8, value: "N/A" }] }]);
  });

  it("ne propose par défaut que les corrections sans risque", () => {
    const plan = recommendedPlan(report);
    expect(plan.removeDuplicates).toBe(true);
    expect(plan.merges).toEqual([{ column: "Région", from: ["nord", "NORD"], to: "Nord" }]);
    expect(plan.empty).toEqual({});
    expect(isEmptyPlan(EMPTY_PLAN)).toBe(true);
    expect(isEmptyPlan(plan)).toBe(false);
  });

  it("applique les corrections validées sur une copie et les journalise", () => {
    const source = raw();
    const plan = CleaningPlanSchema.parse({
      removeDuplicates: true,
      nearDuplicates: { "N° commande": "keep_last" },
      merges: [{ column: "Région", from: ["NORD", "nord"], to: "Nord" }],
      empty: { Région: "fill_unknown", "Montant HT": "fill_zero" },
      invalid: { "Montant HT": "exclude_rows" },
    });
    const { dataset, log } = applyCleaning(source, plan);
    expect(source.rows).toHaveLength(11);
    expect(source.rows[2]["Région"]).toBe("nord");
    expect(log.rowsBefore).toBe(11);
    expect(log.rowsAfter).toBe(8);
    expect(dataset.rows.filter((r) => r["Région"] === "Nord")).toHaveLength(3);
    expect(dataset.rows.find((r) => r["N° commande"] === "C-004")?.["Montant HT"]).toBe("350,00");
    expect(dataset.rows.find((r) => r["N° commande"] === "C-006")?.["Montant HT"]).toBe(0);
    expect(dataset.rows.find((r) => r["N° commande"] === "C-005")).toBeUndefined();
    expect(log.lines).toEqual([
      "1 doublon exact supprimé (la première ligne de chaque groupe est conservée).",
      "Colonne « N° commande » : 1 ligne au même numéro retirée (dernière ligne conservée).",
      "Colonne « Région » : « NORD », « nord » fusionnés en « Nord » (2 cellules).",
      "Colonne « Région » : 1 cellule vide remplacée par « Non renseigné ».",
      "Colonne « Montant HT » : 1 cellule vide remplacée par 0.",
      "Colonne « Montant HT » : 1 ligne à valeur non numérique exclue.",
    ]);
    expect(dataset.rows.filter((r) => r["Région"] === UNKNOWN_LABEL)).toHaveLength(1);
  });

  it("signale une colonne absente au lieu d'échouer", () => {
    const { log } = applyCleaning(raw(), { ...EMPTY_PLAN, empty: { Inconnue: "exclude_rows" } });
    expect(log.lines).toEqual(["Colonne « Inconnue » absente du fichier : correction non appliquée."]);
  });

  it("produit un fichier corrigé sans formule exécutable", () => {
    const text = cleanedCsv({ fileName: "x.csv", columns: ["A", "B"], rows: [{ A: "=1+1", B: 12.5 }, { A: "-5", B: null }] });
    expect(text).toBe("﻿A;B\r\n'=1+1;12,5\r\n-5;\r\n");
  });
});

describe("corrections dans le pipeline", () => {
  const data = new TextEncoder().encode(csv).buffer as ArrayBuffer;
  const plan = CleaningPlanSchema.parse({ removeDuplicates: true, merges: [{ column: "Région", from: ["NORD", "nord"], to: "Nord" }] });

  it("calcule le dashboard sur les données corrigées et rappelle les corrections", async () => {
    const result = await generateDashboard({ fileName: "ventes.csv", data, mode: "standard", organizationId: "org-1", cleaning: plan });
    expect(result.profile.rowCount).toBe(10);
    expect(result.profile.duplicateRows).toBe(0);
    expect(result.cleaning?.log.lines).toHaveLength(2);
    const byRegion = result.charts.find((c) => c.dimension === "Région");
    expect(byRegion?.data.map((d) => d.category)).not.toContain("nord");
  });

  it("rejoue les corrections à l'actualisation avec le même fichier", async () => {
    const previous = await generateDashboard({ fileName: "ventes.csv", data, mode: "standard", organizationId: "org-1", cleaning: plan });
    const refreshed = await recomputeDashboard({ previous, source: { fileName: "ventes.csv", data }, filters: NO_FILTERS, mode: "standard", organizationId: "org-1", allowAi: false });
    expect(refreshed.profile.rowCount).toBe(10);
    expect(refreshed.cleaning?.plan).toEqual(plan);
    expect(refreshed.kpis.map((k) => k.value)).toEqual(previous.kpis.map((k) => k.value));
  });

  it("rappelle les corrections dans les exports Excel et CSV", async () => {
    const result = await generateDashboard({ fileName: "ventes.csv", data, mode: "standard", organizationId: "org-1", cleaning: plan });
    const meta = { organization: "Org", createdAt: new Date(), exportedAt: new Date(), aiMode: "standard" };
    expect(buildCsv(result, meta)).toContain("Correction appliquée;1 doublon exact supprimé");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildXlsx(result, meta)) as unknown as ArrayBuffer);
    const cells = wb.worksheets[0].getColumn(1).values.map(String);
    expect(cells).toContain("Corrections appliquées au fichier (11 → 10 lignes)");
  });
});
