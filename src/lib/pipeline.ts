import { designDashboard, type DesignResult } from "@/lib/ai/gateway";
import { explainVariations, type AnalysisResult } from "@/lib/analysis";
import { completeSpec } from "@/lib/engine/complete";
import { checkInsights, computeDashboard, validateSpec, type CheckedInsight, type ComputedChart, type ComputedKpi } from "@/lib/engine/compute";
import { parseFile } from "@/lib/ingest/parse";
import { profileDataset } from "@/lib/ingest/profile";
import { buildAiContext, type AiContext } from "@/lib/privacy/ai-context";
import { Pseudonymizer } from "@/lib/privacy/pseudonymize";
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
    issues,
    tokensUsed: pseudo.size,
    durationMs: Date.now() - started,
  };
}

function pseudonymizationKey(): string {
  const key = process.env.PSEUDONYMIZATION_KEY;
  if (key) return key;
  if (process.env.NODE_ENV === "production") throw new Error("PSEUDONYMIZATION_KEY doit être définie en production.");
  return DEV_KEY;
}
