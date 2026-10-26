import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { combineDatasets } from "@/lib/combine";
import { NO_FILTERS } from "@/lib/filters";
import { parseCsv } from "@/lib/ingest/parse";
import { SOURCE_COLUMN } from "@/lib/ingest/scopes";
import { generateDashboard, recomputeDashboard } from "@/lib/pipeline";
import { analyzeQuality, cleanedCsv } from "@/lib/quality";
import type { RawDataset } from "@/lib/types";

// Ventes et journal de démarque fictifs d'un magasin (public/demo/multi), reliés par le code article (US-15).
const dir = path.resolve(import.meta.dirname, "../../public/demo/multi");
const read = (name: string) => parseCsv(name, readFileSync(path.join(dir, name), "utf-8"));
const sales = read("ventes-septembre-2026-bastille.csv");
const shrink = read("demarque-septembre-2026-bastille.csv");
const sum = (ds: RawDataset, column: string, source?: string) =>
  ds.rows.filter((r) => !source || r[SOURCE_COLUMN] === source).reduce((n, r) => n + (Number(String(r[column] ?? 0).replace(",", ".")) || 0), 0);
const asFile = (ds: RawDataset) => ({ fileName: ds.fileName, data: new TextEncoder().encode(cleanedCsv(ds)).buffer as ArrayBuffer });

describe("rapprochement de fichiers différents (US-15)", () => {
  const { dataset, summary } = combineDatasets([sales, shrink]);
  const link = summary.link!;

  it("relie par le code article, pas par le libellé ni par un code interne homonyme", () => {
    expect(summary.files.map((f) => f.status)).toEqual(["added", "linked"]);
    expect(link.key).toMatchObject({ main: "Article", other: "Article (2)", matched: 22 });
    expect(link.candidates.map((c) => `${c.main}|${c.other}`)).toContain("EAN|Code EAN");
    // Le premier « Article » de la démarque est un code interne : renommé, jamais confondu avec la clé.
    expect(link.renamed).toEqual([{ from: "Article", to: "Article (demarque-septembre-2026-bastille)" }]);
    expect(link.matchedRows).toBe(link.otherRows - 4);
    expect(dataset.fileName).toBe("rapprochement-2-fichiers.csv");
  });

  it("garde chaque ligne une seule fois : aucun montant compté deux fois", () => {
    expect(dataset.rows).toHaveLength(sales.rows.length + shrink.rows.length);
    expect(sum(dataset, "Montant vente HT")).toBeCloseTo(sum(sales, "Montant vente HT"), 2);
    expect(dataset.rows.filter((r) => r[SOURCE_COLUMN] === link.otherLabel).every((r) => r["Montant vente HT"] === null)).toBe(true);
    // Prix unitaires remplacés par la valeur de chaque ligne (quantité × prix).
    expect(dataset.columns).toContain("Valeur prix de vente");
    expect(dataset.columns).not.toContain("Prix de vente");
  });

  it("reporte le rayon et la famille sur la démarque, jamais le type de régularisation sur les ventes", () => {
    expect(link.filled).toEqual(expect.arrayContaining(["Libellé rayon", "Libellé famille", "Libellé site"]));
    expect(link.dateAligned).toEqual({ from: "Date", to: "Date de vente" });
    const shrinkRow = dataset.rows.find((r) => r[SOURCE_COLUMN] === link.otherLabel && r["Libellé article"] === "BANANES BIO X5")!;
    expect(shrinkRow["Libellé rayon"]).toBe("FRUITS&LÉG");
    expect(dataset.rows.filter((r) => r[SOURCE_COLUMN] === link.mainLabel).every((r) => r["Libellé code regul"] === null)).toBe(true);
  });

  it("écarte à la demande les lignes sans correspondance", () => {
    const only = combineDatasets([sales, shrink], { link: { main: "Article", other: "Article (2)", onlyMatched: true } });
    expect(only.dataset.rows).toHaveLength(sales.rows.length + link.matchedRows);
    expect(only.summary.link!.onlyMatched).toBe(true);
  });

  it("ne signale pas comme vides les cellules propres à l'autre fichier", () => {
    const report = analyzeQuality(dataset);
    expect(report.empties.map((e) => e.column)).not.toContain("Montant vente HT");
    expect(report.empties.map((e) => e.column)).not.toContain("Libellé code regul");
  });

  it("calcule le taux de démarque, par rayon, et le garde juste quand on filtre sur le type de régularisation", async () => {
    const result = await generateDashboard({ ...asFile(dataset), mode: "standard", organizationId: "test" });
    const ratio = result.kpis[1];
    expect(ratio.label).toBe("Démarque / Montant vente HT");
    expect(ratio.format).toBe("percent");
    // Une perte enregistrée en négatif se lit en valeur absolue : le taux est positif.
    expect(ratio.value).toBeCloseTo(Math.abs(sum(dataset, "Valeur prix de vente")) / Math.abs(sum(sales, "Montant vente HT")), 6);
    expect(ratio.value!).toBeGreaterThan(0);
    expect(result.kpis.find((k) => k.label.startsWith("Montant vente HT"))?.quality).toBeUndefined();
    const byRayon = result.charts.find((c) => c.id.startsWith("link_c") && c.dimension === "Libellé rayon")!;
    expect(byRayon.data.length).toBeGreaterThan(3);
    // Aucun graphique ne croise une mesure avec une colonne de l'autre fichier (CA par type de régularisation).
    expect(result.charts.some((c) => c.dimension === "Libellé code regul" && c.measureLabel.startsWith("Montant vente"))).toBe(false);

    const filtered = await recomputeDashboard({
      previous: result,
      source: asFile(dataset),
      filters: { ...NO_FILTERS, dimensions: { "Libellé code regul": ["Produit périmé", "Casse", "Dons divers"] } },
      mode: "standard",
      organizationId: "test",
      allowAi: false,
    });
    // Les ventes ne sont pas filtrées par une colonne qu'elles n'ont pas.
    expect(filtered.kpis[0].value).toBeCloseTo(result.kpis[0].value!, 2);
    expect(filtered.kpis[1].value!).toBeGreaterThan(0);
  });

  it("écarte un fichier sans clé commune", () => {
    const other = parseCsv("meteo.csv", "Ville;Température\nParis;18\nLyon;20\nNice;22\nLille;15\nBrest;14\n");
    const { summary } = combineDatasets([sales, other]);
    expect(summary.files[1].status).toBe("incompatible");
    expect(summary.files[1].reason).toContain("aucune clé commune");
    expect(summary.link).toBeNull();
  });
});

describe("code homonyme renommé au rapprochement", () => {
  it("n'est jamais additionné", async () => {
    const { dataset } = combineDatasets([sales, shrink]);
    const result = await generateDashboard({ ...asFile(dataset), mode: "standard", organizationId: "test" });
    expect(result.profile.columns.find((c) => c.name.startsWith("Article (demarque"))?.role).toBe("ignored");
    expect(result.kpis.some((k) => k.label.startsWith("Article ("))).toBe(false);
  });
});
