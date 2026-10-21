import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { combineDatasets } from "@/lib/combine";
import { parseCsv } from "@/lib/ingest/parse";
import { profileDataset } from "@/lib/ingest/profile";
import { Pseudonymizer } from "@/lib/privacy/pseudonymize";
import { computeShrinkage } from "@/lib/shrinkage";
import { computeSignals, recommend, suggestionsFor } from "@/lib/recommendations";

// Données fictives (public/demo/multi) : ventes d'un magasin et journal de démarque.
const dir = path.resolve(import.meta.dirname, "../../../public/demo/multi");
const read = (name: string) => parseCsv(name, readFileSync(path.join(dir, name), "utf-8"));
const sales = read("ventes-septembre-2026-bastille.csv");
const journal = read("demarque-septembre-2026-bastille.csv");
const pseudo = Pseudonymizer.forOrganization("cle-test", "org");
const run = (ds: ReturnType<typeof read>) => {
  const { profile, rows } = profileDataset(ds);
  return { profile, rows, shrinkage: computeShrinkage(profile, rows) };
};

describe("recommandations (US-19)", () => {
  it("journal de démarque seul : des actions contre les pertes, adaptées au motif", async () => {
    const { profile, rows, shrinkage } = run(journal);
    const result = await recommend({ profile, rows, shrinkage, mode: "standard", pseudo, allowAi: true });
    expect(result.writtenBy).toBe("rules");
    expect(result.items.every((r) => r.group === "losses")).toBe(true);
    const first = result.items[0];
    expect(first.title).toContain(shrinkage!.items[0].item);
    expect(first.why).toMatch(/€ perdus/);
    // Le périmé domine les pertes fictives : action de démarque anticipée.
    expect(result.items.some((r) => r.kind === "loss_type" && /démarque anticipée/.test(r.action))).toBe(true);
  });

  it("ventes seules : sécuriser les meilleures ventes, mettre en avant les fortes marges", () => {
    const { profile, rows, shrinkage } = run(sales);
    const signals = computeSignals(profile, rows, shrinkage);
    expect(signals.every((s) => s.group === "growth")).toBe(true);
    const top = signals.filter((s) => s.kind === "top_seller");
    expect(top.length).toBeGreaterThan(0);
    expect(top[0].metrics.rank).toBe(1);
    const margins = signals.filter((s) => s.kind === "high_margin");
    for (const m of margins) expect(Number(m.metrics.margin_rate)).toBeGreaterThan(Number(m.metrics.average_margin_rate));
  });

  it("ventes et démarque reliées : les deux familles de recommandations, sans contradiction", () => {
    const { dataset } = combineDatasets([sales, journal]);
    const { profile, rows, shrinkage } = run(dataset);
    const signals = computeSignals(profile, rows, shrinkage);
    expect(signals.some((s) => s.group === "losses")).toBe(true);
    expect(signals.some((s) => s.group === "growth")).toBe(true);
    // Jamais « augmenter le stock » d'un article qui figure parmi les plus grosses pertes.
    const lossItems = new Set(shrinkage!.items.map((i) => i.item));
    expect(signals.filter((s) => s.group === "growth").every((s) => !lossItems.has(s.subject))).toBe(true);
  });

  it("mode strict : rédigées par les règles, sans IA", async () => {
    const { profile, rows, shrinkage } = run(journal);
    const result = await recommend({ profile, rows, shrinkage, mode: "strict", pseudo, allowAi: true });
    expect(result.writtenBy).toBe("rules");
    expect(result.provider).toBe("demo");
  });
});

describe("suggestions au survol des graphiques et indicateurs", () => {
  it("rattache une suggestion au graphique qui montre son article, et à l'indicateur de son montant", async () => {
    const { dataset } = combineDatasets([sales, journal]);
    const { profile, rows, shrinkage } = run(dataset);
    const { items } = await recommend({ profile, rows, shrinkage, mode: "strict", pseudo, allowAi: true });
    const loss = items.find((r) => r.kind === "loss_item" || r.kind === "sell_but_lose")!;
    const onChart = suggestionsFor(items, { categories: ["AUTRE", loss.subject], formula: "Somme(Qté) par Libellé article" });
    expect(onChart.map((r) => r.id)).toContain(loss.id);
    const onLossKpi = suggestionsFor(items, { formula: "Somme(Valeur prix de vente)" });
    expect(onLossKpi.length).toBeGreaterThan(0);
    expect(onLossKpi.every((r) => r.group === "losses")).toBe(true);
    const onSalesKpi = suggestionsFor(items, { formula: "Somme(Montant vente HT)" });
    expect(onSalesKpi.every((r) => r.group === "growth")).toBe(true);
    expect(suggestionsFor(items, { formula: "Nombre de lignes" })).toEqual([]);
  });
});
