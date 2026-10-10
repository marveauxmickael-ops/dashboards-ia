import { z } from "zod";

// Réponse attendue de l'IA pour expliquer les variations (US-10).

export const CITED_FIELDS = ["change_pct", "delta", "current", "previous", "share"] as const;

export const AnalysisCitationSchema = z.object({
  dimension: z.string().nullable().describe("Dimension du segment cité (ex. Région), ou null pour la variation globale"),
  category: z.string().nullable().describe("Segment cité, jeton recopié à l'identique (ex. COMMERCIAL_1a2b3c4d), ou null"),
  field: z.enum(CITED_FIELDS).describe("change_pct et share en fraction (-0.18 pour -18 %), delta/current/previous en valeur"),
  value: z.number(),
});

export const VariationExplanationSchema = z.object({
  variation_id: z.string(),
  facts: z
    .array(z.object({ text: z.string().describe("Fait vérifiable, en français"), citations: z.array(AnalysisCitationSchema) }))
    .describe("2 à 4 faits, du plus important au moins important"),
  hypotheses: z.array(z.string()).describe("1 à 3 causes possibles, au conditionnel, jamais présentées comme certaines"),
  suggestions: z
    .array(z.object({ text: z.string().describe("Action concrète et réaliste"), fact_index: z.number().int().describe("Indice du fait qui la justifie") }))
    .describe("2 à 4 pistes d'amélioration pour une baisse ou un segment en recul ; liste vide pour une hausse sans segment en recul"),
});

export const AnalysisSchema = z.object({ explanations: z.array(VariationExplanationSchema) });

export type AnalysisCitation = z.infer<typeof AnalysisCitationSchema>;
export type VariationExplanation = z.infer<typeof VariationExplanationSchema>;
export type Analysis = z.infer<typeof AnalysisSchema>;
