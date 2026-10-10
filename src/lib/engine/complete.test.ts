import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateDashboard } from "@/lib/pipeline";
import { isAdditiveColumn, MAX_CHARTS, MAX_KPIS } from "./complete";

const demo = readFileSync(path.resolve(import.meta.dirname, "../../../public/demo/ventes-demo.csv"), "utf-8");

async function demoResult() {
  const data = new TextEncoder().encode(demo).buffer as ArrayBuffer;
  return generateDashboard({ fileName: "ventes-demo.csv", data, mode: "standard", organizationId: "org-1" });
}

describe("complétion du dashboard", () => {
  it("ajoute un indicateur par colonne numérique et une ventilation par dimension", async () => {
    const result = await demoResult();
    const numeric = result.profile.columns.filter((c) => c.role === "measure").map((c) => c.name);
    for (const column of numeric) expect(result.kpis.some((k) => k.formula.includes(`(${column})`))).toBe(true);
    const dims = result.profile.columns.filter((c) => c.role === "dimension" && c.distinct >= 2 && c.distinct < result.profile.rowCount);
    for (const d of dims) expect(result.charts.some((c) => c.dimension === d.name)).toBe(true);
    expect(result.charts.some((c) => c.chronological)).toBe(true);
    expect(result.kpis.length).toBeLessThanOrEqual(MAX_KPIS);
    expect(result.charts.length).toBeLessThanOrEqual(MAX_CHARTS);
  });

  it("ne duplique pas les graphiques et garde ceux choisis par l'IA en tête", async () => {
    const result = await demoResult();
    const keys = result.charts.map((c) => `${c.formula}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(result.charts[0].id).toBe("c_evolution");
  });

  it("agrège taux et prix unitaires par moyenne, montants par somme", () => {
    expect(isAdditiveColumn("Prix unitaire HT")).toBe(false);
    expect(isAdditiveColumn("Taux de remise")).toBe(false);
    expect(isAdditiveColumn("CA HT")).toBe(true);
    expect(isAdditiveColumn("Quantité")).toBe(true);
  });
});
