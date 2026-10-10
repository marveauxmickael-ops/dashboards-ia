import { describe, expect, it } from "vitest";
import { buildDemoSpec } from "@/lib/ai/demo-designer";
import { validateSpec } from "@/lib/engine/compute";
import { analyzeVariations, type Variation } from "@/lib/engine/variations";
import { parseCsv } from "@/lib/ingest/parse";
import { profileDataset } from "@/lib/ingest/profile";
import { buildAiContext } from "@/lib/privacy/ai-context";
import { Pseudonymizer } from "@/lib/privacy/pseudonymize";
import { buildAnalysisContext } from "./context";
import { checkFact, explainVariations } from "./index";

// Jeu fictif : le CA de « Région Est » s'effondre en juin, porté par le commercial « Paul Martin ».
function dataset() {
  const lines = ["Date;Commercial;Client;Région;CA HT;Coût"];
  const regions = ["Nord", "Sud", "Est"];
  const commerciaux = { Nord: "Alice Durand", Sud: "Bruno Leroy", Est: "Paul Martin" } as Record<string, string>;
  for (const month of [1, 2, 3, 4, 5, 6]) {
    for (const region of regions) {
      for (let i = 0; i < 8; i++) {
        const ca = region === "Est" && month === 6 ? 200 : 1000 + i * 10;
        lines.push(`${String(3 + i * 3).padStart(2, "0")}/0${month}/2026;${commerciaux[region]};Client ${region} ${i % 3};${region};${ca},00;${ca * 0.6}`);
      }
    }
  }
  // Une ligne au 30 juin pour que le mois soit considéré comme complet.
  lines.push("30/06/2026;Alice Durand;Client Nord 0;Nord;1000,00;600");
  return profileDataset(parseCsv("ventes.csv", lines.join("\n")));
}

function setup() {
  const { profile, rows } = dataset();
  const pseudo = Pseudonymizer.forOrganization("cle", "org");
  const { spec } = validateSpec(buildDemoSpec(buildAiContext(profile, rows, "standard", pseudo)), profile);
  return { profile, rows, pseudo, spec };
}

describe("détection et décomposition des variations", () => {
  it("détecte la baisse de juin et l'attribue à la région Est et à son commercial", () => {
    const { profile, rows, spec } = setup();
    const report = analyzeVariations(spec, rows, profile);
    const ca = report.variations.find((v) => v.measureLabel === "CA HT" && v.comparison === "previous_period")!;
    expect(ca.direction).toBe("down");
    expect(ca.period).toBe("2026-06");
    const region = ca.drivers.find((d) => d.dimension === "Région")!;
    expect(region.items[0].category).toBe("Est");
    // Plus de 100 % : la ligne ajoutée au Nord le 30 juin compense une petite partie de la baisse.
    expect(region.items[0].share).toBeGreaterThan(1);
    const commercial = ca.drivers.find((d) => d.dimension === "Commercial")!;
    expect(commercial.items[0].category).toBe("Paul Martin");
    // Contributions dans le sens de la baisse + segments à contre-sens = variation totale.
    const all = [...region.items, ...region.opposite].reduce((s, i) => s + i.delta, 0);
    expect(all).toBeCloseTo(ca.delta, 2);
  });

  it("écarte un dernier mois incomplet au lieu d'y voir une fausse baisse", () => {
    const { profile, rows, spec } = setup();
    const partial = [...rows, { ...rows[0], Date: "2026-07-03" }];
    const report = analyzeVariations(spec, partial, profile);
    expect(report.notes.some((n) => n.includes("2026-07") && n.includes("incomplet"))).toBe(true);
    expect(report.variations.every((v) => !v.period.includes("2026-07"))).toBe(true);
  });
});

describe("données envoyées à l'IA pour l'analyse", () => {
  it("ne contiennent ni nom de commercial ni nom de client en clair", () => {
    const { profile, rows, spec, pseudo } = setup();
    const report = analyzeVariations(spec, rows, profile);
    const json = JSON.stringify(buildAnalysisContext(report.variations, 0.1, profile, pseudo));
    for (const name of ["Paul Martin", "Alice Durand", "Bruno Leroy", "Client Est"]) expect(json).not.toContain(name);
    expect(json).toMatch(/COMMERCIAL_[0-9a-f]{8}/);
  });
});

describe("explications", () => {
  it("restituent des faits vérifiés, en clair, et des suggestions en cas de baisse", async () => {
    const { profile, rows, spec, pseudo } = setup();
    const analysis = await explainVariations({ spec, rows, profile, mode: "standard", pseudo });
    expect(analysis.writtenBy).toBe("rules");
    const ca = analysis.variations.find((v) => v.measureLabel === "CA HT" && v.comparison === "previous_period")!;
    const insight = analysis.insights.find((i) => i.variationId === ca.id)!;
    expect(insight.facts.every((f) => f.status === "verified")).toBe(true);
    expect(insight.facts.map((f) => f.text).join(" ")).not.toMatch(/_[0-9a-f]{8}/);
    expect(insight.suggestions.length).toBeGreaterThan(0);
    expect(insight.hypotheses.length).toBeGreaterThan(0);
  });

  it("signalent un chiffre inventé par l'IA", () => {
    const v = { changePct: -0.2, delta: -100, current: 400, previous: 500, drivers: [] } as unknown as Variation;
    const ok = checkFact("Recul de 20 %", [{ dimension: null, category: null, field: "change_pct", value: -0.2 }], v, (c) => c);
    const points = checkFact("Recul de 20 %", [{ dimension: null, category: null, field: "change_pct", value: -20 }], v, (c) => c);
    const wrong = checkFact("Recul de 35 %", [{ dimension: null, category: null, field: "change_pct", value: -0.35 }], v, (c) => c);
    const unsourced = checkFact("Recul de 35 %", [], v, (c) => c);
    expect([ok.status, points.status, wrong.status, unsourced.status]).toEqual(["verified", "verified", "mismatch", "unverified"]);
  });
});
