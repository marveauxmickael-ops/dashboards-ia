import { z } from "zod";

// Charte graphique de l'organisation : logo et couleurs, appliqués aux dashboards (écran, PDF, Excel, liens partagés).
// Le logo est réencodé en PNG par le navigateur (redimensionné, sans script ni métadonnées) avant d'être enregistré.

/** Taille maximale du logo encodé (data URL), soit environ 250 Ko d'image. */
export const MAX_LOGO_LENGTH = 350_000;
export const LOGO_MAX_WIDTH = 480;
export const LOGO_MAX_HEIGHT = 160;

const HEX = /^#[0-9a-f]{6}$/;

export const BrandingSchema = z.object({
  logo: z
    .string()
    .max(MAX_LOGO_LENGTH, "Logo trop volumineux.")
    .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/, "Format de logo invalide.")
    .nullable()
    .default(null),
  /** Couleurs de la charte, de la principale à la moins utilisée (1 à 6). */
  colors: z.array(z.string().toLowerCase().regex(HEX, "Couleur invalide.")).max(6).default([]),
});

export type Branding = z.infer<typeof BrandingSchema>;

export const NO_BRANDING: Branding = { logo: null, colors: [] };

/** Palette Lisio par défaut (ardoise, cuivre, sauge, brume, sable, prune, ardoise claire), utilisée sans charte ou pour compléter une charte courte. */
// Palette par défaut (sans charte d'organisation) : bleu électrique, violet IA, puis des teintes distinctes ;
// chacune contraste à au moins 3:1 sur fond blanc (WCAG, éléments graphiques).
export const DEFAULT_PALETTE = ["#245bdb", "#7955e8", "#0b8a6a", "#1f86c9", "#c96a12", "#c2459a", "#5a6b85"];

export function parseBranding(value: unknown): Branding {
  const parsed = BrandingSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : NO_BRANDING;
}

type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;
}

/** Luminance relative (WCAG 2.1). */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Mélange une couleur avec du noir (amount < 0) ou du blanc (amount > 0). */
export function mix(hex: string, amount: number): string {
  const target = amount < 0 ? 0 : 255;
  const t = Math.abs(amount);
  return rgbToHex(hexToRgb(hex).map((v) => v + (target - v) * t) as Rgb);
}

/**
 * Variante lisible d'une couleur pour du texte sur fond blanc (contraste ≥ 4,5:1) :
 * une couleur de charte trop claire est assombrie, jamais remplacée.
 */
export function readableOnWhite(hex: string): string {
  let color = hex;
  for (let i = 0; i < 20 && contrastRatio(color, "#ffffff") < 4.5; i++) color = mix(color, -0.1);
  return color;
}

/** Couleur de texte (blanc ou ardoise) lisible sur un fond de la couleur donnée. */
export function textOn(hex: string): string {
  return contrastRatio(hex, "#ffffff") >= 4.5 ? "#ffffff" : "#0f172a";
}

/**
 * Palette des graphiques : les couleurs de la charte (trop claires assombries pour rester visibles sur fond blanc),
 * complétées par des nuances de la couleur principale pour distinguer jusqu'à 7 séries.
 */
export function chartPalette(branding: Branding | null | undefined): string[] {
  const colors = branding?.colors ?? [];
  if (colors.length === 0) return DEFAULT_PALETTE;
  const visible = colors.map((c) => (contrastRatio(c, "#ffffff") < 1.8 ? mix(c, -0.35) : c));
  const palette = [...visible];
  const shades = [0.35, -0.3, 0.55, -0.5, 0.7];
  for (let i = 0; palette.length < 7 && i < shades.length * visible.length; i++) {
    const shade = mix(visible[i % visible.length], shades[Math.floor(i / visible.length) % shades.length]);
    if (!palette.includes(shade)) palette.push(shade);
  }
  return palette.slice(0, 7);
}

/**
 * Couleurs dominantes d'une image (pixels RGBA), pour proposer une charte à partir du logo.
 * Écarte le transparent, le quasi-blanc, le quasi-noir et les gris ; regroupe les teintes proches.
 */
export function extractColors(pixels: Uint8ClampedArray | number[], max = 3): string[] {
  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const [r, g, b, a] = [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
    if (a < 128) continue;
    const high = Math.max(r, g, b);
    const low = Math.min(r, g, b);
    if (high > 240 && low > 230) continue; // blanc
    if (high < 25) continue; // noir
    if (high - low < 20) continue; // gris
    const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bucket.count++;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  }
  const ranked = [...buckets.values()].sort((a, b) => b.count - a.count).map((x) => rgbToHex([x.r / x.count, x.g / x.count, x.b / x.count]));
  // Deux couleurs trop proches comptent pour une.
  const distinct: string[] = [];
  for (const color of ranked) {
    const [r, g, b] = hexToRgb(color);
    if (distinct.every((c) => {
      const [r2, g2, b2] = hexToRgb(c);
      return Math.abs(r - r2) + Math.abs(g - g2) + Math.abs(b - b2) > 90;
    })) distinct.push(color);
    if (distinct.length === max) break;
  }
  return distinct;
}
