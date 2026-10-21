import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { combineDatasets } from "@/lib/combine";
import { parseCsv } from "@/lib/ingest/parse";
import { profileDataset } from "@/lib/ingest/profile";
import { generateDashboard } from "@/lib/pipeline";
import { cleanedCsv } from "@/lib/quality";
import { computeShrinkage } from "@/lib/shrinkage";

// Journal de démarque fictif (public/demo/multi) : pertes (périmé, casse, dons) et corrections (inventaire, comptage).
const dir = path.resolve(import.meta.dirname, "../../public/demo/multi");
const text = (name: string) => readFileSync(path.join(dir, name), "utf-8");
const journal = parseCsv("demarque.csv", text("demarque-septembre-2026-bastille.csv"));
const LOSSES = ["Produit périmé", "Casse", "Dons divers"];
const n = (v: unknown) => Number(String(v).replace(",", "."));
// Valeur attendue, calculée à la main : quantité × prix, pertes seulement, en positif.
const expected = (price: string) =>
  -journal.rows.filter((r) => LOSSES.includes(String(r["Libellé code regul"]))).reduce((s, r) => s + n(r["Quantité"]) * n(r[price]), 0);

describe("démarque en perte de chiffre (US-18)", () => {
  const { profile, rows } = profileDataset(journal);
  const report = computeShrinkage(profile, rows)!;

  it("compte seulement les pertes, en positif, au prix de vente et au prix d'achat", () => {
    expect(report.typeColumn).toBe("Libellé code regul");
    expect([...report.lossTypes].sort()).toEqual([...LOSSES].sort());
    expect(report.lostSales).toBeCloseTo(expected("Prix de vente"), 1);
    expect(report.lostCost).toBeCloseTo(expected("Prix achat"), 1);
    expect(report.lostSales!).toBeGreaterThan(0);
    expect(report.sales).toBeNull();
  });

  it("détaille par motif et par rayon, et liste les articles à surveiller", () => {
    expect(report.byType.reduce((s, t) => s + t.lost, 0)).toBeCloseTo(report.lostSales!, 1);
    expect(report.byType.map((t) => t.lost)).toEqual([...report.byType.map((t) => t.lost)].sort((a, b) => b - a));
    expect(report.items.length).toBeGreaterThan(3);
    expect(report.items.length).toBeLessThanOrEqual(10);
    expect(report.items[0].lost).toBeGreaterThanOrEqual(report.items.at(-1)!.lost);
    expect(LOSSES).toContain(report.items[0].mainType);
  });

  it("exprime la perte en part du CA quand les ventes sont reliées", async () => {
    const { dataset } = combineDatasets([parseCsv("ventes.csv", text("ventes-septembre-2026-bastille.csv")), journal]);
    const result = await generateDashboard({ fileName: dataset.fileName, data: new TextEncoder().encode(cleanedCsv(dataset)).buffer as ArrayBuffer, mode: "standard", organizationId: "test" });
    const linked = result.shrinkage!;
    expect(linked.sales?.column).toBe("Montant vente HT");
    expect(linked.sales!.share).toBeCloseTo(linked.lostSales! / linked.sales!.value, 6);
    // Le rayon est reporté depuis les ventes : la démarque se lit par rayon.
    expect(linked.byAisle.length).toBeGreaterThan(2);
  });

  it("n'apparaît pas sur un fichier de ventes", () => {
    const sales = profileDataset(parseCsv("ventes.csv", text("ventes-septembre-2026-bastille.csv")));
    expect(computeShrinkage(sales.profile, sales.rows)).toBeNull();
  });
});
