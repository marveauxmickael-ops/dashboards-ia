import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/ingest/parse";
import { profileDataset } from "@/lib/ingest/profile";
import { generateDashboard } from "@/lib/pipeline";

// Export de grande distribution (valeurs fictives) : codes doublés d'un libellé, EAN, marge en points.
const header = "Code site;Libellé site;Département;Libellé département;Rayon;Libellé rayon;Article;EAN;Libellé article;Qté;Montant achat;Montant vente HT;Montant marge;Marge (%);Taux Marge";
const lines = [
  "10307;MAGASIN A;3;FRAIS LS;12;B.O.F;102345;3560070000011;OEUFS X6;120;300,00;480,00;180,00;37,5;37,5",
  "10307;MAGASIN A;3;FRAIS LS;14;VOLAILLE LS;102346;3560070000028;FILET POULET;80;400,00;560,00;160,00;28,6;28,6",
  "10307;MAGASIN A;4;FRAIS TRAD;21;POINT CHAUD;102347;3560070000035;BAGUETTE;500;150,00;400,00;250,00;62,5;62,5",
  "10307;MAGASIN A;4;FRAIS TRAD;22;FRUITS&LEG;102348;3560070000042;BANANES;300;600,00;750,00;150,00;20,0;20,0",
];
const csv = [header, ...lines].join("\n");

describe("codes et pourcentages", () => {
  it("n'additionne jamais un code ni un identifiant", () => {
    const { profile } = profileDataset(parseCsv("ventes.csv", csv));
    const role = Object.fromEntries(profile.columns.map((c) => [c.name, c.role]));
    expect(role).toMatchObject({ "Code site": "ignored", Département: "ignored", Rayon: "ignored", Article: "ignored", EAN: "dimension", Qté: "measure", "Montant achat": "measure" });
    expect(profile.columns.find((c) => c.name === "Rayon")?.reason).toContain("Libellé rayon");
    expect(profile.columns.find((c) => c.name === "EAN")?.type).toBe("category");
  });

  it("reconnaît les pourcentages exprimés en points", () => {
    const { profile } = profileDataset(parseCsv("ventes.csv", csv));
    expect(profile.columns.find((c) => c.name === "Marge (%)")?.percentScale).toBe("points");
  });

  it("produit un dashboard sans somme de codes, avec le CA sur les ventes et des pourcentages lisibles", async () => {
    const r = await generateDashboard({ fileName: "ventes.csv", data: new TextEncoder().encode(csv).buffer as ArrayBuffer, mode: "standard", organizationId: "org-1" });
    const labels = r.kpis.map((k) => k.label);
    for (const code of ["Code site", "Département", "Rayon", "Article", "EAN", "Famille"]) expect(labels.some((l) => l.startsWith(`${code} total`))).toBe(false);
    expect(labels.some((l) => /Montant vente HT/.test(l))).toBe(true);
    const pct = r.kpis.find((k) => k.label.startsWith("Marge (%)"));
    expect(pct?.format).toBe("number");
    const taux = r.kpis.find((k) => k.label.startsWith("Taux Marge"));
    expect(taux?.label).toContain("(%)");
    expect(taux?.format).toBe("number");
    const tauxDeMarge = r.kpis.find((k) => k.label === "Taux de marge");
    if (tauxDeMarge) expect(tauxDeMarge.value).toBeCloseTo(740 / 2190, 3);
    expect(r.charts.every((c) => !["Code site", "Département", "Rayon", "Article"].includes(c.measureLabel))).toBe(true);
  });
});
