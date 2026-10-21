import { designDashboard, type DesignResult } from "@/lib/ai/gateway";
import { explainVariations, type AnalysisResult } from "@/lib/analysis";
import { completeSpec } from "@/lib/engine/complete";
import { comparisonColumn, computeComparison, type Comparison } from "@/lib/engine/comparison";
import { computeShrinkage, type ShrinkageReport } from "@/lib/shrinkage";
import { checkInsights, computeDashboard, validateSpec, type CheckedInsight, type ComputedChart, type ComputedKpi } from "@/lib/engine/compute";
import { ImportError, parseFile } from "@/lib/ingest/parse";
import { profileDataset } from "@/lib/ingest/profile";
import { buildAiContext, type AiContext } from "@/lib/privacy/ai-context";
import { Pseudonymizer } from "@/lib/privacy/pseudonymize";
import type { DashboardSpec } from "@/lib/ai/spec";
import { answerQuestion, type QuestionAnswer } from "@/lib/questions";
import { applyFilters, filterOptions, isFiltered, type FilterOptions, type Filters } from "@/lib/filters";
import { applyCleaning, isEmptyPlan, type CleaningLog, type CleaningPlan } from "@/lib/quality";
import type { AiMode, DatasetProfile, RawDataset, TypedRow } from "@/lib/types";

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
  /**
   * Comparaison des indicateurs par magasin, rayon, produit… (US-17), calculée par le moteur.
   * Absente : aucune colonne de comparaison (ou dashboard antérieur).
   */
  comparison?: Comparison | null;
  /** Démarque en perte de chiffre (US-18) : journal de démarque reconnu, pertes seulement. */
  shrinkage?: ShrinkageReport | null;
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
  /** Période couverte par les lignes calculées (mois AAAA-MM), si le fichier a une date. */
  period?: { from: string; to: string } | null;
  /**
   * Corrections du contrôle qualité validées par l'utilisateur (US-11) : rappelées sur le dashboard,
   * le PDF et les exports, et rejouées à chaque actualisation. Absent : fichier pris tel quel.
   */
  cleaning?: { plan: CleaningPlan; log: CleaningLog };
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
  /** Corrections validées au contrôle qualité, appliquées avant tout calcul. */
  cleaning?: CleaningPlan;
  /** Reçoit le fichier lu, avant corrections (empreinte de la version, US-12). */
  onSource?: (raw: RawDataset) => void;
  /** Colonne qui distingue les fichiers regroupés (US-16), à comparer en priorité (US-17). */
  compareBy?: string | null;
}): Promise<DashboardResult> {
  const started = Date.now();
  const { raw, cleaning } = await loadDataset({ fileName: input.fileName, data: input.data }, input.cleaning, input.onSource);
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

  const clearKpis = kpis.map((k) => ({ ...k, label: clear(k.label), description: clear(k.description) }));
  return {
    fileName: raw.fileName,
    profile,
    aiContext,
    ai: { provider: design.provider, model: design.model, inputTokens: design.inputTokens, outputTokens: design.outputTokens },
    title: clear(spec.title),
    kpis: clearKpis,
    charts: charts.map((c) => ({ ...c, title: clear(c.title) })),
    insights,
    comparison: computeComparison(spec, rows, comparisonColumn(profile, input.compareBy), clearKpis),
    shrinkage: computeShrinkage(profile, rows),
    analysis,
    spec,
    filterOptions: filterOptions(profile, rows),
    period: periodOf(profile, rows),
    cleaning,
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
  /** Fichier à lire, ou données déjà lues (fusion de deux fichiers, US-12). */
  source: { fileName: string; data: ArrayBuffer } | RawDataset;
  onSource?: (raw: RawDataset) => void;
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

  const { raw, cleaning } = await loadDataset(input.source, previous.cleaning?.plan, input.onSource);
  const { profile, rows: allRows } = profileDataset(raw);
  const problems = compatibilityProblems(spec, previous.profile, profile);
  if (problems.length > 0) throw new IncompatibleFileError(`Ce fichier n'est pas compatible avec le dashboard : ${problems.join(" ; ")}.`);

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

  const clearKpis = kpis.map((k) => ({ ...k, label: kpiById.get(k.id)?.label ?? k.label, description: kpiById.get(k.id)?.description ?? k.description }));
  return {
    ...previous,
    fileName: raw.fileName,
    profile: { ...profile, rowCount: rows.length },
    kpis: clearKpis,
    // Même colonne qu'à la création ; un filtre qui ne garde qu'une valeur supprime la comparaison.
    comparison: computeComparison(spec, rows, comparisonColumn(profile, previous.comparison?.column), clearKpis),
    shrinkage: computeShrinkage({ ...profile, rowCount: rows.length }, rows),
    charts: charts.map((c) => ({ ...c, title: chartById.get(c.id)?.title ?? c.title })),
    // Les constats rédigés à la création citent les chiffres d'origine : ils ne valent plus après recalcul.
    insights: [],
    analysis,
    filterOptions: options,
    filters: isFiltered(input.filters) ? input.filters : undefined,
    period: periodOf(profile, rows),
    cleaning,
    issues: [],
    durationMs: Date.now() - started,
  };
}

/** Question en langage naturel sur le fichier source d'un dashboard (US-07) ; le fichier n'est pas conservé. */
export async function askDashboardQuestion(input: {
  previous: DashboardResult;
  fileName: string;
  data: ArrayBuffer;
  question: string;
  mode: AiMode;
  organizationId: string;
}): Promise<QuestionAnswer> {
  if (!input.previous.spec) throw new IncompatibleFileError("Ce dashboard a été créé avant les questions : générez-le à nouveau.");
  const { raw } = await loadDataset({ fileName: input.fileName, data: input.data }, input.previous.cleaning?.plan);
  const { profile, rows } = profileDataset(raw);
  const problems = compatibilityProblems(input.previous.spec, input.previous.profile, profile);
  if (problems.length > 0) throw new IncompatibleFileError(`Ce fichier n'est pas compatible avec le dashboard : ${problems.join(" ; ")}.`);
  const pseudo = Pseudonymizer.forOrganization(pseudonymizationKey(), input.organizationId);
  return answerQuestion({ question: input.question, spec: input.previous.spec, profile, rows, mode: input.mode, pseudo });
}

/** Lit le fichier puis applique les corrections validées (copie en mémoire : le fichier n'est ni modifié ni conservé). */
async function loadDataset(
  source: { fileName: string; data: ArrayBuffer } | RawDataset,
  plan: CleaningPlan | undefined,
  onSource?: (raw: RawDataset) => void,
): Promise<{ raw: RawDataset; cleaning?: DashboardResult["cleaning"] }> {
  const raw = "data" in source ? await parseFile(source.fileName, source.data) : source;
  onSource?.(raw);
  if (!plan || isEmptyPlan(plan)) return { raw };
  const { dataset, log } = applyCleaning(raw, plan);
  if (dataset.rows.length === 0) throw new ImportError("Les corrections choisies excluent toutes les lignes du fichier : assouplissez-les.");
  return { raw: dataset, cleaning: { plan, log } };
}

const ROLE_LABEL: Record<string, string> = { measure: "numérique", date: "date", dimension: "catégorie", ignored: "exclue" };

/** Colonnes manquantes ou de type différent par rapport au fichier d'origine (US-02). */
export function compatibilityProblems(spec: DashboardSpec, before: DatasetProfile, after: DatasetProfile): string[] {
  const needed = new Set<string>();
  for (const m of spec.measures) if (m.column) needed.add(m.column);
  for (const c of spec.charts) needed.add(c.dimension);
  const problems: string[] = [];
  for (const name of needed) {
    const expected = before.columns.find((c) => c.name === name);
    const actual = after.columns.find((c) => c.name === name);
    if (!actual || actual.role === "ignored") {
      problems.push(`colonne « ${name} » manquante`);
    } else if (expected && expected.role !== actual.role) {
      problems.push(`colonne « ${name} » de type ${ROLE_LABEL[actual.role]} au lieu de ${ROLE_LABEL[expected.role]}`);
    }
  }
  return problems;
}

/** Premier et dernier mois couverts par les lignes, d'après la colonne de date. */
export function periodOf(profile: DatasetProfile, rows: TypedRow[]): { from: string; to: string } | null {
  const date = profile.columns.find((c) => c.role === "date")?.name;
  if (!date) return null;
  const months = rows.map((r) => r[date]).filter((v): v is string => typeof v === "string").map((v) => v.slice(0, 7)).sort();
  return months.length > 0 ? { from: months[0], to: months.at(-1)! } : null;
}

export function pseudonymizationKey(): string {
  const key = process.env.PSEUDONYMIZATION_KEY;
  if (key) return key;
  if (process.env.NODE_ENV === "production") throw new Error("PSEUDONYMIZATION_KEY doit être définie en production.");
  return DEV_KEY;
}
