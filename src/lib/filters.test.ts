import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateDashboard, IncompatibleFileError, recomputeDashboard } from "@/lib/pipeline";
import { NO_FILTERS } from "./filters";

const demo = readFileSync(path.resolve(import.meta.dirname, "../../public/demo/ventes-demo.csv"), "utf-8");
const bytes = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;

async function demoResult() {
  return generateDashboard({ fileName: "ventes-demo.csv", data: bytes(demo), mode: "standard", organizationId: "org-1" });
}

describe("filtres et recalcul", () => {
  it("propose les périodes et les dimensions du fichier", async () => {
    const result = await demoResult();
    expect(result.spec).toBeDefined();
    expect(result.filterOptions?.periods.length).toBeGreaterThan(1);
    expect(result.filterOptions?.dimensions.length).toBeGreaterThan(0);
  });

  it("recalcule chaque chiffre sur les lignes filtrées, sans appel à l'IA", async () => {
    const full = await demoResult();
    const dim = full.filterOptions!.dimensions[0];
    const kept = dim.values[0];
    const filtered = await recomputeDashboard({
      previous: full,
      source: { fileName: "ventes-demo.csv", data: bytes(demo) },
      filters: { from: null, to: null, dimensions: { [dim.column]: [kept] } },
      mode: "standard",
      organizationId: "org-1",
      allowAi: false,
    });
    const rows = full.kpis.find((k) => k.formula === "Nombre de lignes")!;
    const filteredRows = filtered.kpis.find((k) => k.id === rows.id)!;
    expect(filteredRows.value).toBeLessThan(rows.value!);
    expect(filtered.profile.rowCount).toBe(filteredRows.value);
    // Le graphique par cette dimension ne contient plus que la valeur retenue.
    const byDim = filtered.charts.find((c) => c.dimension === dim.column && !c.chronological);
    if (byDim) expect(byDim.data.map((d) => d.category)).toEqual([kept]);
    expect(filtered.filters?.dimensions[dim.column]).toEqual([kept]);
    expect(filtered.insights).toEqual([]);
    expect(filtered.analysis?.writtenBy).toBe("rules");
    // Libellés repris du dashboard d'origine.
    expect(filtered.kpis.map((k) => k.label)).toEqual(full.kpis.map((k) => k.label));
  });

  it("filtre une période", async () => {
    const full = await demoResult();
    const periods = full.filterOptions!.periods;
    const filtered = await recomputeDashboard({ previous: full, source: { fileName: "f.csv", data: bytes(demo) }, filters: { from: periods[1], to: periods[2], dimensions: {} }, mode: "standard", organizationId: "org-1", allowAi: false });
    const trend = filtered.charts.find((c) => c.chronological)!;
    expect(trend.data.map((d) => d.category)).toEqual([periods[1], periods[2]]);
  });

  it("refuse un fichier de structure différente", async () => {
    const full = await demoResult();
    const other = "Date;Autre\n2026-01-01;1\n2026-02-01;2\n";
    await expect(
      recomputeDashboard({ previous: full, source: { fileName: "autre.csv", data: bytes(other) }, filters: NO_FILTERS, mode: "standard", organizationId: "org-1", allowAi: true }),
    ).rejects.toBeInstanceOf(IncompatibleFileError);
  });
});
