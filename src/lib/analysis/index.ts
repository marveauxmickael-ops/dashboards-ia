import { activeProvider, AiError, callClaude, type AiUsage } from "@/lib/ai/gateway";
import type { DashboardSpec } from "@/lib/ai/spec";
import type { InsightStatus } from "@/lib/engine/compute";
import { analyzeVariations, DEFAULT_THRESHOLD, type Variation } from "@/lib/engine/variations";
import type { Pseudonymizer } from "@/lib/privacy/pseudonymize";
import type { AiMode, DatasetProfile, TypedRow } from "@/lib/types";
import { buildAnalysisContext, type AnalysisContext } from "./context";
import { buildDemoAnalysis } from "./demo";
import { analysisUserMessage, ANALYSIS_SYSTEM_PROMPT } from "./prompt";
import { AnalysisSchema, type AnalysisCitation, type VariationExplanation } from "./schema";

// Assistant d'analyse des variations (US-10) : détection et décomposition par le moteur,
// rédaction par l'IA sur données pseudonymisées, vérification de chaque chiffre, ré-identification.

export interface CheckedFact {
  text: string;
  status: InsightStatus;
  details: string[];
}

export interface VariationInsight {
  variationId: string;
  facts: CheckedFact[];
  hypotheses: string[];
  suggestions: { text: string; factIndex: number | null }[];
}

export interface AnalysisResult extends AiUsage {
  threshold: number;
  /** « ai » : rédigé par l'IA ; « rules » : rédigé automatiquement, sans modèle (démo, mode strict, IA indisponible). */
  writtenBy: "ai" | "rules";
  notes: string[];
  variations: Variation[];
  insights: VariationInsight[];
  /** Données de l'analyse transmises à l'IA (pseudonymisées), ou null si aucune ne l'a été. */
  sentToAi: AnalysisContext | null;
}

export async function explainVariations(input: {
  spec: DashboardSpec;
  rows: TypedRow[];
  profile: DatasetProfile;
  mode: AiMode;
  pseudo: Pseudonymizer;
  threshold?: number;
}): Promise<AnalysisResult> {
  const threshold = input.threshold ?? DEFAULT_THRESHOLD;
  const report = analyzeVariations(input.spec, input.rows, input.profile, threshold);
  const notes = [...report.notes];
  const none: AiUsage = { provider: "demo", model: null, inputTokens: null, outputTokens: null };
  if (report.variations.length === 0) return { ...none, threshold, writtenBy: "rules", notes, variations: [], insights: [], sentToAi: null };

  const ctx = buildAnalysisContext(report.variations, threshold, input.profile, input.pseudo);
  const provider = activeProvider();
  let explanations: VariationExplanation[];
  let usage = none;
  let writtenBy: AnalysisResult["writtenBy"] = "rules";

  // En mode strict, l'IA ne reçoit aucune valeur : les explications sont rédigées sans modèle.
  if (input.mode === "strict" || provider === "demo") {
    explanations = buildDemoAnalysis(ctx).explanations;
  } else {
    try {
      const { output, ...callUsage } = await callClaude(provider, AnalysisSchema, ANALYSIS_SYSTEM_PROMPT, analysisUserMessage(JSON.stringify(ctx)));
      explanations = output.explanations;
      usage = callUsage;
      writtenBy = "ai";
    } catch (error) {
      if (!(error instanceof AiError)) throw error;
      notes.push(`L'IA n'a pas pu rédiger l'analyse (${error.message}) : les explications ci-dessous sont produites automatiquement.`);
      explanations = buildDemoAnalysis(ctx).explanations;
    }
  }

  const resolve = (category: string) => input.pseudo.reidentify(category).text;
  const clear = (text: string) => {
    const r = input.pseudo.reidentify(text);
    if (r.unknownTokens.length > 0) notes.push(`Jeton(s) inconnu(s) dans l'analyse : ${r.unknownTokens.join(", ")}.`);
    return r.text;
  };

  const byId = new Map(report.variations.map((v) => [v.id, v]));
  const insights: VariationInsight[] = [];
  for (const e of explanations) {
    const variation = byId.get(e.variation_id);
    if (!variation) continue;
    const facts = e.facts.map((f) => checkFact(f.text, f.citations, variation, resolve));
    insights.push({
      variationId: variation.id,
      facts: facts.map((f) => ({ ...f, text: clear(f.text) })),
      hypotheses: e.hypotheses.map(clear),
      suggestions: e.suggestions.map((s) => ({
        text: clear(s.text),
        factIndex: Number.isInteger(s.fact_index) && s.fact_index >= 0 && s.fact_index < facts.length ? s.fact_index : null,
      })),
    });
  }

  return { ...usage, threshold, writtenBy, notes, variations: report.variations, insights, sentToAi: writtenBy === "ai" ? ctx : null };
}

/** Recalcule chaque chiffre cité à partir de la variation calculée par le moteur. */
export function checkFact(text: string, citations: AnalysisCitation[], v: Variation, resolve: (c: string) => string): CheckedFact {
  const details: string[] = [];
  let mismatch = false;
  for (const c of citations) {
    const actual = citedValue(c, v, resolve);
    if (actual === null) {
      mismatch = true;
      details.push(`Valeur ${c.value} : élément cité introuvable dans le calcul.`);
    } else if (!close(c.value, actual, c.field === "change_pct" || c.field === "share")) {
      mismatch = true;
      details.push(`Valeur citée ${c.value}, valeur calculée ${Math.round(actual * 1000) / 1000}.`);
    }
  }
  const hasDigits = /\d/.test(text.replace(/\b[A-Z][A-Z0-9_]*_[0-9a-f]{8,12}\b/g, ""));
  const status: InsightStatus = mismatch ? "mismatch" : citations.length > 0 ? "verified" : hasDigits ? "unverified" : "qualitative";
  return { text, status, details };
}

function citedValue(c: AnalysisCitation, v: Variation, resolve: (c: string) => string): number | null {
  if (c.dimension === null || c.category === null) {
    return { change_pct: v.changePct, delta: v.delta, current: v.current, previous: v.previous, share: 1 }[c.field];
  }
  const driver = v.drivers.find((d) => d.dimension === c.dimension);
  const category = resolve(c.category);
  const item = driver && [...driver.items, ...driver.opposite].find((i) => i.category === category);
  if (!item) return null;
  if (c.field === "change_pct") return item.previous !== 0 ? item.delta / Math.abs(item.previous) : null;
  // Une part citée au-delà de 100 % est plafonnée à l'affichage : on compare à la part plafonnée aussi.
  if (c.field === "share") return Math.abs(c.value) <= 1 && item.share > 1 ? 1 : item.share;
  return item[c.field];
}

function close(cited: number, actual: number, isFraction: boolean): boolean {
  const tolerance = Math.max(Math.abs(actual) * 0.01, isFraction ? 0.0005 : 0.5);
  if (Math.abs(cited - actual) <= tolerance) return true;
  // Une fraction peut être citée en points (18,2 au lieu de 0,182), avec ou sans signe.
  return isFraction && (Math.abs(cited / 100 - actual) <= tolerance || Math.abs(Math.abs(cited) / 100 - Math.abs(actual)) <= tolerance);
}
