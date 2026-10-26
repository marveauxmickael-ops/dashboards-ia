import { describe, expect, it } from "vitest";
import type { Comparison } from "@/lib/engine/comparison";
import { isNetwork } from "./network-view";

const comparison = (column: string, stores: number): Comparison => ({
  column,
  kpis: [{ id: "k1", label: "CA", format: "currency", average: 100 }],
  rows: Array.from({ length: stores }, (_, i) => ({ value: `Magasin ${i + 1}`, rank: i + 1, lines: 10, values: [100 + i] })),
});

describe("vue Réseau", () => {
  it("s'affiche quand la comparaison porte sur plusieurs magasins", () => {
    expect(isNetwork(comparison("Libellé site", 5))).toBe(true);
    expect(isNetwork(comparison("Magasin", 2))).toBe(true);
  });

  it("laisse la comparaison classique pour les rayons, produits ou fichiers", () => {
    expect(isNetwork(comparison("Libellé rayon", 5))).toBe(false);
    expect(isNetwork(comparison("Fichier", 3))).toBe(false);
    expect(isNetwork(comparison("Libellé site", 1))).toBe(false);
    expect(isNetwork(null)).toBe(false);
  });
});
