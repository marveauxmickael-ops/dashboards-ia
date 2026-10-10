import { describe, expect, it } from "vitest";
import { chartPalette, contrastRatio, DEFAULT_PALETTE, extractColors, parseBranding, readableOnWhite, textOn } from "./branding";

describe("charte graphique", () => {
  it("valide le logo (PNG uniquement) et les couleurs", () => {
    expect(parseBranding({ logo: "data:image/png;base64,iVBORw0KGgo=", colors: ["#E30613"] })).toEqual({ logo: "data:image/png;base64,iVBORw0KGgo=", colors: ["#e30613"] });
    // Un SVG (qui peut contenir du script) ou une URL externe sont refusés.
    expect(parseBranding({ logo: "data:image/svg+xml;base64,PHN2Zz4=", colors: [] }).logo).toBeNull();
    expect(parseBranding({ logo: "https://exemple.com/logo.png" }).logo).toBeNull();
    expect(parseBranding({ colors: ["rouge"] }).colors).toEqual([]);
    expect(parseBranding(null)).toEqual({ logo: null, colors: [] });
  });

  it("construit une palette de 7 couleurs à partir de la charte, ou la palette par défaut", () => {
    expect(chartPalette(null)).toEqual(DEFAULT_PALETTE);
    const palette = chartPalette({ logo: null, colors: ["#e30613", "#1d3557"] });
    expect(palette).toHaveLength(7);
    expect(palette.slice(0, 2)).toEqual(["#e30613", "#1d3557"]);
    expect(new Set(palette).size).toBe(7);
  });

  it("garde le texte lisible : couleur trop claire assombrie, texte blanc ou foncé selon le fond", () => {
    const light = "#ffe066";
    expect(contrastRatio(light, "#ffffff")).toBeLessThan(4.5);
    expect(contrastRatio(readableOnWhite(light), "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(textOn("#0d5c70")).toBe("#ffffff");
    expect(textOn("#ffe066")).toBe("#0f172a");
  });

  it("extrait les couleurs dominantes d'un logo en ignorant le fond blanc et le transparent", () => {
    const px = (r: number, g: number, b: number, a = 255, n = 1) => Array.from({ length: n }, () => [r, g, b, a]).flat();
    const pixels = [...px(255, 255, 255, 255, 50), ...px(0, 0, 0, 0, 50), ...px(227, 6, 19, 255, 30), ...px(29, 53, 87, 255, 20), ...px(230, 10, 25, 255, 5)];
    const colors = extractColors(pixels);
    expect(colors).toHaveLength(2);
    expect(colors[0]).toMatch(/^#e[0-9a-f]0[0-9a-f]1[0-9a-f]$/);
    expect(colors[1]).toBe("#1d3557");
  });
});
