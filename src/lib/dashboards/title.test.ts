import { describe, expect, it } from "vitest";
import { DASHBOARD_TITLE_MAX, normalizeTitle, withTitle } from "./title";

describe("nom d'un dashboard", () => {
  it("nettoie les espaces et les caractères de contrôle", () => {
    expect(normalizeTitle("  Ventes   T3\n2026 ")).toBe("Ventes T3 2026");
  });

  it("refuse un nom vide, trop long ou d'un autre type", () => {
    expect(normalizeTitle("   ")).toBeNull();
    expect(normalizeTitle("a".repeat(DASHBOARD_TITLE_MAX + 1))).toBeNull();
    expect(normalizeTitle(null)).toBeNull();
    expect(normalizeTitle("a".repeat(DASHBOARD_TITLE_MAX))).toHaveLength(DASHBOARD_TITLE_MAX);
  });

  it("fait primer le nom enregistré sur le titre calculé", () => {
    expect(withTitle({ title: "Tableau de bord des ventes", kpis: [] }, "Ventes Nord").title).toBe("Ventes Nord");
    expect(withTitle({ title: "Tableau de bord des ventes" }, null).title).toBe("Tableau de bord des ventes");
  });
});
