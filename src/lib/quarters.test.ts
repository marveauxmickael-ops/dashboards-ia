import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { combineDatasets } from "@/lib/combine";
import { quartersOf } from "@/lib/format";
import { parseCsv } from "@/lib/ingest/parse";
import { generateDashboard } from "@/lib/pipeline";
import { cleanedCsv } from "@/lib/quality";
import { applyView, EMPTY_VIEW, isDefaultView } from "@/lib/view";

// Trois exports trimestriels fictifs (public/demo/multi) déposés ensemble.
const dir = path.resolve(import.meta.dirname, "../../public/demo/multi");
const files = [1, 2, 3].map((q) => parseCsv(`trimestre-T${q}-2026-bastille.csv`, readFileSync(path.join(dir, `trimestre-T${q}-2026-bastille.csv`), "utf-8")));

describe("fichiers trimestriels", () => {
  const combined = combineDatasets(files);
  const generate = () =>
    generateDashboard({ fileName: combined.dataset.fileName, data: new TextEncoder().encode(cleanedCsv(combined.dataset)).buffer as ArrayBuffer, mode: "standard", organizationId: "test", compareBy: combined.summary.column });

  it("trois trimestres regroupés, comparés fichier par fichier", async () => {
    expect(combined.summary.files.every((f) => f.status === "added")).toBe(true);
    const result = await generate();
    expect(result.period).toEqual({ from: "2026-01", to: "2026-09" });
    expect(result.comparison?.rows).toHaveLength(3);
  });

  it("calcule chaque évolution par trimestre sur les lignes, jamais en additionnant les mois d'un taux", async () => {
    const result = await generate();
    const sum = result.charts.find((c) => c.chronological && c.byQuarter && c.formula.startsWith("Somme("))!;
    expect(sum.byQuarter!.map((q) => q.category)).toEqual(["2026-T1", "2026-T2", "2026-T3"]);
    const total = (list: { value: number | null }[]) => list.reduce((n, d) => n + (d.value ?? 0), 0);
    expect(total(sum.byQuarter!)).toBeCloseTo(total(sum.data), 2);
    // Un taux par trimestre est recalculé, pas la somme des taux mensuels.
    const rate = result.charts.find((c) => c.chronological && c.byQuarter && c.format === "percent");
    if (rate) {
      const q1Months = rate.data.filter((d) => d.category <= "2026-03").reduce((n, d) => n + (d.value ?? 0), 0);
      expect(rate.byQuarter![0].value!).toBeLessThan(q1Months);
    }
  });

  it("la vue par trimestre s'applique aux exports et se retient", async () => {
    const result = await generate();
    const view = { ...EMPTY_VIEW, timeGranularity: "quarter" as const };
    const exported = applyView(result, view);
    const evolution = exported.charts.find((c) => c.chronological && /trimestrielle/.test(c.title));
    expect(evolution?.data.map((d) => d.category)).toEqual(["2026-T1", "2026-T2", "2026-T3"]);
    expect(isDefaultView(view)).toBe(false);
  });

  it("propose un filtre par trimestre aux bornes des mois présents", () => {
    expect(quartersOf(["2026-01", "2026-02", "2026-03", "2026-05", "2026-06", "2026-07"])).toEqual([
      { key: "2026-T1", label: "T1 2026", from: "2026-01", to: "2026-03" },
      { key: "2026-T2", label: "T2 2026", from: "2026-05", to: "2026-06" },
      { key: "2026-T3", label: "T3 2026", from: "2026-07", to: "2026-07" },
    ]);
  });
});
