import { describe, expect, it } from "vitest";
import { NO_FILTERS, type FilterOptions } from "@/lib/filters";
import { lossesOnly, lossPreset, withLossesOnly } from "@/lib/losses";

const options = (dimensions: FilterOptions["dimensions"]): FilterOptions => ({ dateColumn: null, periods: [], dimensions });

describe("filtre « pertes uniquement »", () => {
  const journal = options([
    { column: "Libellé rayon", values: ["B.O.F", "FRUITS&LÉG"] },
    { column: "Libellé code regul", values: ["Casse", "Comptage", "Dons divers", "Inventaire", "Produit périmé"] },
  ]);

  it("repère les pertes d'un journal de démarque, pas les corrections d'inventaire", () => {
    expect(lossPreset(journal)).toEqual({ column: "Libellé code regul", losses: ["Casse", "Dons divers", "Produit périmé"], others: ["Comptage", "Inventaire"] });
  });

  it("n'apparaît pas sur un fichier sans journal de démarque", () => {
    expect(lossPreset(options([{ column: "Libellé famille", values: ["PAIN TRAD", "VIENNOISERIE", "FRUITS ET LEGUMES"] }]))).toBeNull();
    // Que des pertes : rien à écarter, pas de bascule.
    expect(lossPreset(options([{ column: "Motif", values: ["Casse", "Vol"] }]))).toBeNull();
  });

  it("s'active et se retire sans toucher aux autres filtres", () => {
    const preset = lossPreset(journal)!;
    const base = { ...NO_FILTERS, from: "2026-09", dimensions: { "Libellé rayon": ["B.O.F"] } };
    const on = withLossesOnly(base, preset, true);
    expect(lossesOnly(on, preset)).toBe(true);
    expect(on.dimensions["Libellé rayon"]).toEqual(["B.O.F"]);
    const off = withLossesOnly(on, preset, false);
    expect(off).toEqual(base);
    expect(lossesOnly(off, preset)).toBe(false);
  });
});
