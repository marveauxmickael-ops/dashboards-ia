import type { AiUsage } from "@/lib/ai/gateway";

// Types et rattachement des recommandations (US-19), sans dépendance serveur : utilisables dans l'interface.

export type SignalKind = "loss_item" | "loss_aisle" | "loss_type" | "sell_but_lose" | "top_seller" | "high_margin" | "rising";
export type RecommendationGroup = "losses" | "growth";

export interface Signal {
  id: string;
  kind: SignalKind;
  group: RecommendationGroup;
  /** Article, rayon ou motif concerné (en clair, côté serveur uniquement). */
  subject: string;
  /** Colonne du sujet, pour la pseudonymisation. */
  subjectColumn: string | null;
  /** Montants concernés (pertes, ventes, marge) : relient la suggestion aux indicateurs qui les affichent. */
  columns: string[];
  /** Chiffres calculés par le moteur, transmis à l'IA (sans le sujet en clair) et affichés tels quels. */
  metrics: Record<string, number | string | null>;
}

export interface Recommendation {
  id: string;
  kind: SignalKind;
  group: RecommendationGroup;
  title: string;
  action: string;
  /** Pourquoi : les chiffres du moteur, rédigés par des règles (jamais par l'IA). */
  why: string;
  /** Article, rayon ou motif concerné, et montants concernés : placent la suggestion près des graphiques et indicateurs. */
  subject: string;
  columns: string[];
}

export interface RecommendationsResult extends AiUsage {
  writtenBy: "ai" | "rules";
  items: Recommendation[];
  notes: string[];
}

/**
 * Suggestions à montrer au survol d'un graphique ou d'un indicateur (2 au plus) :
 * - graphique : celles dont l'article, le rayon ou le motif figure parmi ses catégories ;
 * - indicateur : celles qui portent sur le montant qu'il calcule (pertes, ventes, marge).
 */
export function suggestionsFor(items: Recommendation[], target: { categories?: string[]; formula: string }, max = 2): Recommendation[] {
  const mentions = (r: Recommendation) => r.columns.some((c) => target.formula.includes(`(${c})`));
  // Un graphique ne montre que les suggestions sur ses propres catégories : un conseil sur un article n'a pas sa place
  // sur un graphique par département.
  if (target.categories) {
    const categories = new Set(target.categories);
    return items.filter((r) => categories.has(r.subject)).slice(0, max);
  }
  return items.filter(mentions).slice(0, max);
}
