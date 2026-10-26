import { describe, expect, it } from "vitest";
import { displayName, displayNameInSentence } from "./display";

describe("displayName", () => {
  it("retire « Libellé » des noms de colonnes affichés", () => {
    expect(displayName("Libellé rayon")).toBe("Rayon");
    expect(displayName("Libellé Marque")).toBe("Marque");
    expect(displayName("Intitulé du rayon")).toBe("Rayon");
    expect(displayName("Montant vente HT")).toBe("Montant vente HT");
    expect(displayName("Libellé")).toBe("Libellé");
  });

  it("garde un sigle en majuscules au milieu d'une phrase", () => {
    expect(displayNameInSentence("Libellé rayon")).toBe("rayon");
    expect(displayNameInSentence("EAN")).toBe("EAN");
  });
});
