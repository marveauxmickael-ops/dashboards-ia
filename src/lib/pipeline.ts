import { designDashboard, type DesignResult } from "@/lib/ai/gateway";
import { explainVariations, type AnalysisResult } from "@/lib/analysis";
import { completeSpec } from "@/lib/engine/complete";
import { checkInsights, computeDashboard, validateSpec, type CheckedInsight, type ComputedChart, type ComputedKpi } from "@/lib/engine/compute";
import { parseFile } from "@/lib/ingest/parse";
import { profileDataset } from "@/lib/ingest/profile";
import { buildAiContext, type AiContext } from "@/lib/privacy/ai-context";
import { Pseudonymizer } from "@/lib/privacy/pseudonymize";
import type { DashboardSpec } from "@/lib/ai/spec";
import { applyFilters, filterOptions, isFiltered, type FilterOptions, type Filters } from "@/lib/filters";
import type { AiMode, DatasetProfile } from "@/lib/types";

// Cycle complet : import → profilage → pseudonymisation (aller) → conception par l'IA
// → validation → calcul sur les vraies données → ré-identification (retour) → dashboard en clair.

export interface DashboardResult {
  fileName: string;
  profile: DatasetProfile;
  /** Exactement ce qui a été envoyé à l'IA, affiché par transparence. */
  aiContext: AiContext;
  ai: Omit<DesignResult, "spec">;
  title: string;
  kpis: ComputedKpi[];
  charts: ComputedChart[];
  insights: CheckedInsight[];
  /** Analyse des variations (US-10) ; absente des dashboards créés avant le sprint 3. */
  analysis?: AnalysisResult;
  /**
   * Structure du dashboard (mesures, KPI, graphiques), sans aucune valeur : elle permet de recalculer
   * le dashboard sur un fichier mis à jour ou filtré sans nouvel appel à l'IA. Absente avant le sprint 4.
   */
  spec?: DashboardSpec;
  /** Périodes et valeurs proposées dans les filtres. */
  filterOptions?: FilterOptions;
  /** Filtres appliqués à ce résultat (absent : dashboard complet). */
  filters?: Filters;
  issues: string[];
  tokensUsed: number;
  durationMs: number;
}

const DEV_KEY = "cle-de-developpement-a-remplacer";

export async function generateDashboard(input: {
  fileName: string;
  data: ArrayBuffer;
  mode: AiMode;
  organizationId: string;
}): Promise<DashboardResult> {
  const started = Date.now();
  const raw = await parseFile(input.fileName, input.data);
  const { profile, rows } = profileDataset(raw);

  // Aller : pseudonymisation. La table de correspondance reste dans cette instance, côté serveur.
  const pseudo = Pseudonymizer.forOrganization(pseudonymizationKey(), input.organizationId);
  const aiContext = buildAiContext(profile, rows, input.mode, pseudo);

  // Conception par l'IA, sur données pseudonymisées uniquement.
  const design = await designDashboard(aiContext);

  // Retour : validation, calcul sur les vraies données, vérification des chiffres cités, ré-identification.
  // L'IA choisit les indicateurs clés ; le moteur ajoute ensuite tout ce que les colonnes permettent de calculer.
  const validated = validateSpec(design.spec, profile);
  const { issues } = validated;
  const spec = completeSpec(validated.spec, profile);
  const { kpis, charts } = computeDashboard(spec, rows, profile);
  const clear = (text: string) => {
    const result = pseudo.reidentify(text);
    if (result.unknownTokens.length > 0) issues.push(`Jeton(s) inconnu(s) dans la réponse de l'IA : ${result.unknownTokens.join(", ")}.`);
    return result.text;
  };
  const insights = checkInsights(spec.insights, kpis, charts, (category) => pseudo.reidentify(category).text).map((insight) => ({
    text: clear(insight.text),
    status: insight.status,
    details: insight.details,
  }));

  // Analyse des variations : décomposition par le moteur, explication par l'IA sur données pseudonymisées.
  const analysis = await explainVariations({ spec, rows, profile, mode: input.mode, pseudo });

  return {
    fileName: raw.fileName,
    profile,
    aiContext,
    ai: { provider: design.provider, model: design.model, inputTokens: design.inputTokens, outputTokens: design.outputTokens },
    title: clear(spec.title),
    kpis: kpis.map((k) => ({ ...k, label: clear(k.label), description: clear(k.description) })),
    charts: charts.map((c) => ({ ...c, title: clear(c.title) })),
    insights,
    analysis,
    spec,
    filterOptions: filterOptions(profile, rows),
    issues,
    tokensUsed: pseudo.size,
    durationMs: Date.now() - started,
  };
}

export class IncompatibleFileError extends Error {}

/**
 * Recalcule un dashboard existant (même structure) sur un fichier, éventuellement filtré.
 * - Filtres : aucun appel à l'IA ; l'analyse des variations est rédigée par les règles.
 * - Réimport (US-08) : nouveau fichier de même structure ; l'analyse peut être rédigée par l'IA.
 * Le fichier n'est pas conservé ; les libellés déjà ré-identifiés sont repris du dashboard d'origine.
 */
export async function recomputeDashboard(input: {
  previous: DashboardResult;
  fileName: string;
  data: ArrayBuffer;
  filters: Filters;
  mode: AiMode;
  organizationId: string;
  /** true : l'analyse des variations peut être rédigée par l'IA (réimport) ; false : règles uniquement. */
  allowAi: boolean;
}): Promise<DashboardResult> {
  const started = Date.now();
  const { previous } = input;
  if (!previous.spec) throw new IncompatibleFileError("Ce dashboard a été créé avant les filtres : générez-le à nouveau pour pouvoir le filtrer ou le mettre à jour.");
  const spec = previous.spec;

  const raw = await parseFile(input.fileName, input.data);
  const { profile, rows: allRows } = profileDataset(raw);
  const missing = requiredColumns(spec).filter((name) => !profile.columns.some((c) => c.name === name && c.role !== "ignored"));
  if (missing.length > 0) {
    throw new IncompatibleFileError(`Ce fichier n'a pas la même structure que le dashboard : colonne(s) manquante(s) ${missing.map((m) => `« ${m} »`).join(", ")}.`);
  }

  const options = filterOptions(profile, allRows);
  const rows = applyFilters(allRows, input.filters, options);
  if (rows.length === 0) throw new IncompatibleFileError("Aucune ligne ne correspond à ces filtres.");

  const { kpis, charts } = computeDashboard(spec, rows, profile);
  const kpiById = new Map(previous.kpis.map((k) => [k.id, k]));
  const chartById = new Map(previous.charts.map((c) => [c.id, c]));
  const pseudo = Pseudonymizer.forOrganization(pseudonymizationKey(), input.organizationId);
  const analysis = await explainVariations({ spec, rows, profile, mode: input.allowAi ? input.mode : "strict", pseudo });
  if (!input.allowAi && analysis.writtenBy === "rules" && input.mode === "standard") {
    analysis.notes.push("Vue filtrée : les explications sont rédigées automatiquement, sans appel à l'IA.");
  }

  return {
    ...previous,
    fileName: raw.fileName,
    profile: { ...profile, rowCount: rows.length },
    kpis: kpis.map((k) => ({ ...k, label: kpiById.get(k.id)?.label ?? k.label, description: kpiById.get(k.id)?.description ?? k.description })),
    charts: charts.map((c) => ({ ...c, title: chartById.get(c.id)?.title ?? c.title })),
    // Les constats rédigés à la création citent les chiffres d'origine : ils ne valent plus après recalcul.
    insights: [],
    analysis,
    filterOptions: options,
    filters: isFiltered(input.filters) ? input.filters : undefined,
    issues: [],
    durationMs: Date.now() - started,
  };
}

function requiredColumns(spec: DashboardSpec): string[] {
  const columns = new Set<string>();
  for (const m of spec.measures) if (m.column) columns.add(m.column);
  for (const c of spec.charts) columns.add(c.dimension);
  return [...columns];
}

function pseudonymizationKey(): string {
  const key = process.env.PSEUDONYMIZATION_KEY;
  if (key) return key;
  if (process.env.NODE_ENV === "production") throw new Error("PSEUDONYMIZATION_KEY doit être définie en production.");
  return DEV_KEY;
}
