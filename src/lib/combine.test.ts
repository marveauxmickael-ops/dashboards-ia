import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { combineDatasets, distinguishingColumn, FILE_COLUMN } from "@/lib/combine";
import { gapToAverage, comparisonTitle } from "@/lib/engine/comparison";
import { parseCsv } from "@/lib/ingest/parse";
import { generateDashboard, recomputeDashboard } from "@/lib/pipeline";
import { cleanedCsv } from "@/lib/quality";
import { NO_FILTERS } from "@/lib/filters";

// Exports fictifs de 5 magasins et de 3 rayons d'un magasin (public/demo/multi).
const dir = path.resolve(import.meta.dirname, "../../public/demo/multi");
const read = (name: string) => parseCsv(name, readFileSync(path.join(dir, name), "utf-8"));
const stores = readdirSync(dir).filter((f) => f.startsWith("ventes-")).sort().map(read);
const rayons = readdirSync(dir).filter((f) => f.startsWith("rayon-")).sort().map(read);

describe("regroupement de plusieurs fichiers (US-16)", () => {
  it("empile 5 magasins et repère la colonne qui les distingue (le libellé, pas le code)", () => {
    const { dataset, summary } = combineDatasets(stores);
    expect(summary.column).toBe("Libellé site");
    expect(summary.columnAdded).toBe(false);
    expect(summary.values).toHaveLength(5);
    expect(summary.rows).toBe(stores.reduce((n, ds) => n + ds.rows.length, 0));
    expect(summary.files.every((f) => f.status === "added" && f.values.length === 1)).toBe(true);
    expect(dataset.fileName).toBe("regroupement-5-fichiers.csv");
    expect(dataset.columns).toEqual(stores[0].columns);
  });

  it("repère un rayon quand chaque fichier correspond à un rayon du même magasin", () => {
    const { summary } = combineDatasets(rayons);
    expect(summary.column).toBe("Libellé rayon");
    expect(summary.values).toEqual(["B.O.F", "FRUITS&LÉG", "POINT CHAUD"]);
  });

  it("signale un fichier déposé deux fois et un fichier de structure différente, sans les additionner", () => {
    const other = parseCsv("demarque.csv", "Article;Libellé code regul;Quantité\n1;Casse;-2\n");
    const { summary } = combineDatasets([stores[0], stores[1], { ...stores[0], fileName: "copie.csv" }, other]);
    expect(summary.files.map((f) => f.status)).toEqual(["added", "added", "duplicate", "incompatible"]);
    expect(summary.files[2].reason).toContain(stores[0].fileName);
    expect(summary.files[3].reason).toContain("Colonnes différentes");
    expect(summary.rows).toBe(stores[0].rows.length + stores[1].rows.length);
  });

  it("ajoute une colonne « Fichier » quand rien ne distingue les fichiers", () => {
    const a = parseCsv("ventes_janvier.csv", "Produit;Montant\nA;10\nB;5\n");
    const b = parseCsv("ventes_fevrier.csv", "Produit;Montant\nA;12\nB;7\n");
    const { dataset, summary } = combineDatasets([a, b]);
    expect(summary.column).toBe(FILE_COLUMN);
    expect(summary.columnAdded).toBe(true);
    expect(dataset.rows.map((r) => r[FILE_COLUMN])).toEqual(["ventes janvier", "ventes janvier", "ventes fevrier", "ventes fevrier"]);
  });

  it("n'utilise ni une date ni un nombre pour distinguer les fichiers", () => {
    const a = parseCsv("a.csv", "Date;Code;Montant\n2026-09-01;101;10\n");
    const b = parseCsv("b.csv", "Date;Code;Montant\n2026-10-01;102;12\n");
    expect(distinguishingColumn(a.columns, [a, b])).toBeNull();
  });

  it("le fichier regroupé se relit à l'identique", () => {
    const { dataset } = combineDatasets(stores.slice(0, 2));
    const reread = parseCsv(dataset.fileName, cleanedCsv(dataset));
    expect(reread.rows.length).toBe(dataset.rows.length);
    expect(reread.rows[0]["Libellé site"]).toBe(dataset.rows[0]["Libellé site"]);
  });
});

describe("comparaison (US-17)", () => {
  const combined = combineDatasets(stores);
  const generate = () =>
    generateDashboard({ fileName: combined.dataset.fileName, data: new TextEncoder().encode(cleanedCsv(combined.dataset)).buffer as ArrayBuffer, mode: "standard", organizationId: "test", compareBy: combined.summary.column });

  it("compare les 5 magasins sur les indicateurs clés, avec un total cohérent", async () => {
    const result = await generate();
    const comparison = result.comparison!;
    expect(comparison.column).toBe("Libellé site");
    expect(comparison.rows).toHaveLength(5);
    expect(comparison.rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
    // Classement décroissant sur le premier indicateur.
    const lead = comparison.rows.map((r) => r.values[0] ?? 0);
    expect([...lead].sort((a, b) => b - a)).toEqual(lead);
    // Pour un indicateur additif, la somme des magasins redonne le total du dashboard.
    const sumKpi = result.kpis.findIndex((k) => k.formula.startsWith("Somme("));
    if (sumKpi >= 0) {
      const index = comparison.kpis.findIndex((k) => k.id === result.kpis[sumKpi].id);
      const total = comparison.rows.reduce((n, r) => n + (r.values[index] ?? 0), 0);
      expect(total).toBeCloseTo(result.kpis[sumKpi].value!, 2);
    }
    expect(comparison.rows[0].value).toBe("Express Lisio Bastille");
    expect(comparison.rows.at(-1)!.value).toBe("Express Lisio Nation");
  });

  it("garde la même colonne au recalcul et disparaît quand un filtre ne garde qu'un magasin", async () => {
    const result = await generate();
    const source = { fileName: combined.dataset.fileName, data: new TextEncoder().encode(cleanedCsv(combined.dataset)).buffer as ArrayBuffer };
    const all = await recomputeDashboard({ previous: result, source, filters: NO_FILTERS, mode: "standard", organizationId: "test", allowAi: false });
    expect(all.comparison?.column).toBe("Libellé site");
    const one = await recomputeDashboard({ previous: result, source, filters: { ...NO_FILTERS, dimensions: { "Libellé site": ["Express Lisio Nation"] } }, mode: "standard", organizationId: "test", allowAi: false });
    expect(one.comparison).toBeNull();
  });

  it("exprime l'écart en points pour un taux, en % de la moyenne sinon", () => {
    expect(gapToAverage(0.34, 0.36, "percent")).toEqual({ gap: expect.closeTo(-0.02, 6), unit: "points" });
    expect(gapToAverage(120, 100, "currency")).toEqual({ gap: 0.2, unit: "percent" });
    expect(gapToAverage(5, 0, "number")).toBeNull();
    expect(comparisonTitle("Libellé site")).toBe("Comparaison par site");
    expect(comparisonTitle("Libellé rayon")).toBe("Comparaison par rayon");
    expect(comparisonTitle("EAN")).toBe("Comparaison par EAN");
  });
});
