import { describe, expect, it } from "vitest";
import { isPublicPath, safeNextPath } from "./redirect";

describe("safeNextPath", () => {
  it("accepte un chemin interne", () => {
    expect(safeNextPath("/dashboards/abc?x=1")).toBe("/dashboards/abc?x=1");
  });

  it.each(["https://exemple.com", "//exemple.com", "/\\exemple.com", "javascript:alert(1)", "", null, undefined])(
    "refuse une redirection externe ou invalide (%s)",
    (next) => {
      expect(safeNextPath(next)).toBe("/");
    },
  );
});

describe("isPublicPath", () => {
  it("laisse publiques les pages d'authentification et le fichier de démonstration", () => {
    for (const p of ["/connexion", "/inscription", "/mot-de-passe-oublie", "/auth/confirm", "/demo/ventes-demo.csv"]) expect(isPublicPath(p)).toBe(true);
  });

  it("protège les pages de l'application", () => {
    for (const p of ["/", "/dashboards", "/dashboards/123", "/reinitialiser", "/connexion-piege"]) expect(isPublicPath(p)).toBe(false);
  });
});

describe("pages de partage", () => {
  it("sont publiques (le jeton fait office d'autorisation)", () => {
    expect(isPublicPath("/partage/abc")).toBe(true);
    expect(isPublicPath("/partagex")).toBe(false);
  });
});
