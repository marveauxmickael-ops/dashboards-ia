import { describe, expect, it } from "vitest";
import { parseCsv, parseFile } from "./parse";
import { restoreTaxLabels, withTaxLabels } from "./tax";

const csv = (lines: string[]) => parseCsv("ventes.csv", lines.join("\n"));
const bytes = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;

describe("withTaxLabels", () => {
  it("renomme « Montant vente » en « Montant vente TTC » quand l'écart avec le HT est de la TVA", () => {
    const ds = withTaxLabels(csv(["Article;Montant vente;Montant vente HT", "A;105,50;100,00", "B;24,00;20,00", "C;0;0"]));
    expect(ds.columns).toEqual(["Article", "Montant vente TTC", "Montant vente HT"]);
    expect(ds.rows[0]["Montant vente TTC"]).toBe("105,50");
    expect(ds.notes?.[0]).toContain("« Montant vente TTC »");
  });

  it("ne renomme rien sans colonne HT jumelle ni quand l'écart n'est pas de la TVA", () => {
    expect(withTaxLabels(csv(["Montant vente;Montant achat", "10;8"])).columns).toEqual(["Montant vente", "Montant achat"]);
    // Montant inférieur au HT, ou écart trop grand : ce n'est pas un TTC.
    expect(withTaxLabels(csv(["Montant vente;Montant vente HT", "90;100"])).columns).toContain("Montant vente");
    expect(withTaxLabels(csv(["Montant vente;Montant vente HT", "200;100"])).columns).toContain("Montant vente");
    // Déjà nommé : rien à faire.
    expect(withTaxLabels(csv(["CA TTC;CA HT", "120;100"])).columns).toEqual(["CA TTC", "CA HT"]);
  });

  it("s'applique à tout fichier lu", async () => {
    const ds = await parseFile("ventes.csv", bytes("Montant vente;Montant vente HT\n120;100\n"));
    expect(ds.columns).toEqual(["Montant vente TTC", "Montant vente HT"]);
  });
});

describe("restoreTaxLabels", () => {
  it("garde le nom d'origine pour un dashboard créé avant la reconnaissance du TTC", () => {
    const original = csv(["Montant vente;Montant vente HT", "120;100"]);
    const restored = restoreTaxLabels(withTaxLabels(original), ["Montant vente", "Montant vente HT"]);
    expect(restored).toEqual(original);
  });

  it("ne change rien pour un dashboard qui connaît déjà le TTC", () => {
    const ds = withTaxLabels(csv(["Montant vente;Montant vente HT", "120;100"]));
    expect(restoreTaxLabels(ds, ["Montant vente TTC", "Montant vente HT"])).toBe(ds);
  });
});
