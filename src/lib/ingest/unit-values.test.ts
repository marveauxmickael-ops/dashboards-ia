import { describe, expect, it } from "vitest";
import { parseCsv } from "./parse";
import { profileDataset } from "./profile";

// Journal de régularisations de stock (données fictives) : quantité signée et prix unitaires.
const csv = [
  "Article;Article;Libellé article;Sous famille;Libellé ssfamille;Libellé code regul;Quantité;Prix de vente;Prix achat;PCB",
  "5987506;743554;Tarte citron;1;SF PATISSERIE;Produit périmé;-2;9,5;5,3;6",
  "5825024;308225;Brioche;1;SF VIENNOISERIE;Casse;-1;1,05;0,57;25",
  "4727816;867021;Fougassette;2;SF PAIN;Inventaire;3;2,5;1,62;36",
].join("\n");

describe("quantités et prix unitaires", () => {
  const { profile, rows } = profileDataset(parseCsv("regul.csv", csv));
  const role = (name: string) => profile.columns.find((c) => c.name === name)?.role;

  it("calcule la valeur ligne par ligne au lieu d'additionner les prix", () => {
    expect(rows.map((r) => r["Valeur prix de vente"])).toEqual([-19, -1.05, 7.5]);
    expect(rows.map((r) => r["Valeur prix achat"])).toEqual([-10.6, -0.57, 4.86]);
    expect(role("Valeur prix de vente")).toBe("measure");
    expect(role("Prix de vente")).toBe("ignored");
    expect(role("PCB")).toBe("ignored");
    expect(profile.warnings.join(" ")).toContain("« Valeur prix de vente » = Quantité × Prix de vente");
  });

  it("ne somme jamais les codes, même en double ou abrégés", () => {
    expect(role("Article")).toBe("ignored");
    expect(role("Article (2)")).toBe("ignored");
    expect(role("Sous famille")).toBe("ignored");
  });

  it("ne change rien à un fichier de ventes avec des montants totaux", () => {
    const sales = profileDataset(parseCsv("ventes.csv", "Article;Libellé article;Qté;Montant vente HT\n1;Tarte;2;19\n"));
    expect(sales.profile.columns.map((c) => c.name)).toEqual(["Article", "Libellé article", "Qté", "Montant vente HT"]);
  });
});
