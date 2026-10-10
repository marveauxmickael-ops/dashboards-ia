import { z } from "zod";

// Spécification du dashboard produite par l'IA. Elle ne contient que des références
// (colonnes, jetons) : aucune valeur affichée n'est reprise telle quelle, le moteur recalcule tout.

export const AGGREGATIONS = ["sum", "avg", "min", "max", "count", "count_distinct"] as const;
export const GRANULARITIES = ["day", "week", "month", "quarter", "year"] as const;

export const MeasureSchema = z.object({
  id: z.string().describe("Identifiant court, ex. ca, cout, marge"),
  label: z.string().describe("Libellé en français"),
  column: z.string().nullable().describe("Colonne source ; null pour une mesure dérivée"),
  operation: z.enum(["difference", "ratio"]).nullable().describe("Pour une mesure dérivée : left - right ou left / right"),
  left: z.string().nullable().describe("Id de la mesure de gauche (mesure dérivée)"),
  right: z.string().nullable().describe("Id de la mesure de droite (mesure dérivée)"),
  format: z.enum(["currency", "number", "percent"]),
});

export const KpiSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().describe("Une phrase expliquant ce que mesure le KPI"),
  measure: z.string().describe("Id d'une mesure, ou \"rows\" pour compter les lignes"),
  aggregation: z.enum(AGGREGATIONS),
});

export const ChartSchema = z.object({
  id: z.string(),
  type: z.enum(["bar", "line", "pie", "table"]),
  title: z.string(),
  dimension: z.string().describe("Colonne de regroupement (dimension ou date)"),
  granularity: z.enum(GRANULARITIES).nullable().describe("Obligatoire si la dimension est une date, sinon null"),
  measure: z.string().describe("Id d'une mesure, ou \"rows\""),
  aggregation: z.enum(AGGREGATIONS),
  limit: z.number().int().nullable().describe("Nombre maximal de catégories affichées, null pour toutes"),
});

export const CitationSchema = z.object({
  kpi: z.string().nullable().describe("Id du KPI cité, ou null"),
  chart: z.string().nullable().describe("Id du graphique cité, ou null"),
  category: z.string().nullable().describe("Valeur de la dimension dans le graphique (jeton ou libellé, ex. CLIENT_1a2b3c4d ou 2026-03)"),
  compare_to: z
    .string()
    .nullable()
    .describe("Pour une évolution : catégorie de référence du même graphique ; value est alors la variation relative (ex. -0.18 pour -18 %)"),
  value: z.number().describe("Valeur numérique citée dans le texte"),
});

export const InsightSchema = z.object({
  text: z.string().describe("Constat en français ; reprendre les jetons tels quels"),
  citations: z.array(CitationSchema),
});

export const DashboardSpecSchema = z.object({
  title: z.string(),
  measures: z.array(MeasureSchema),
  kpis: z.array(KpiSchema),
  charts: z.array(ChartSchema),
  insights: z.array(InsightSchema),
});

export type Measure = z.infer<typeof MeasureSchema>;
export type Kpi = z.infer<typeof KpiSchema>;
export type Chart = z.infer<typeof ChartSchema>;
export type Insight = z.infer<typeof InsightSchema>;
export type DashboardSpec = z.infer<typeof DashboardSpecSchema>;
export type Aggregation = (typeof AGGREGATIONS)[number];
export type Granularity = (typeof GRANULARITIES)[number];
