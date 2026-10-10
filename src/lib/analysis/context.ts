import type { Variation } from "@/lib/engine/variations";
import { MIN_GROUP_SIZE } from "@/lib/privacy/ai-context";
import type { Pseudonymizer } from "@/lib/privacy/pseudonymize";
import type { DatasetProfile } from "@/lib/types";

// Contexte envoyé à l'IA pour expliquer les variations : uniquement des chiffres agrégés déjà calculés,
// segments identifiants remplacés par des jetons, segments de moins de 5 lignes retirés.

export interface AnalysisContextItem {
  category: string;
  current: number;
  previous: number;
  delta: number;
  share: number;
  change_pct: number | null;
}

export interface AnalysisContext {
  threshold: number;
  variations: {
    id: string;
    measure: string;
    format: string;
    comparison: string;
    period: string;
    previous_period: string;
    current: number;
    previous: number;
    delta: number;
    change_pct: number;
    direction: "up" | "down";
    drivers: { dimension: string; values: "jetons" | "en clair"; items: AnalysisContextItem[]; opposite: AnalysisContextItem[] }[];
    limitations: string[];
  }[];
}

const r = (n: number) => Math.round(n * 1e4) / 1e4;

export function buildAnalysisContext(variations: Variation[], threshold: number, profile: DatasetProfile, pseudo: Pseudonymizer): AnalysisContext {
  const tokenized = new Set(profile.columns.filter((c) => c.treatment === "tokenize").map((c) => c.name));
  const item = (dimension: string) => (i: Variation["drivers"][number]["items"][number]): AnalysisContextItem => ({
    category: tokenized.has(dimension) ? pseudo.tokenize(dimension, i.category) : i.category,
    current: r(i.current),
    previous: r(i.previous),
    delta: r(i.delta),
    share: r(i.share),
    change_pct: i.previous !== 0 ? r(i.delta / Math.abs(i.previous)) : null,
  });
  const bigEnough = (i: { rowsCurrent: number; rowsPrevious: number }) => Math.max(i.rowsCurrent, i.rowsPrevious) >= MIN_GROUP_SIZE;

  return {
    threshold,
    variations: variations.map((v) => ({
      id: v.id,
      measure: v.measureLabel,
      format: v.format,
      comparison: v.comparison,
      period: v.period,
      previous_period: v.previousPeriod,
      current: r(v.current),
      previous: r(v.previous),
      delta: r(v.delta),
      change_pct: r(v.changePct),
      direction: v.direction,
      drivers: v.drivers.map((d) => ({
        dimension: d.dimension,
        values: tokenized.has(d.dimension) ? ("jetons" as const) : ("en clair" as const),
        items: d.items.filter(bigEnough).map(item(d.dimension)),
        opposite: d.opposite.filter(bigEnough).map(item(d.dimension)),
      })),
      limitations: v.limitations,
    })),
  };
}
