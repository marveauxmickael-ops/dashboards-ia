import { readFileSync } from "node:fs";
import path from "node:path";
import { buildDemoSpec } from "@/lib/ai/demo-designer";
import { completeSpec } from "@/lib/engine/complete";
import { computeDashboard, validateSpec, type ComputedChart, type ComputedKpi } from "@/lib/engine/compute";
import { parseCsv } from "@/lib/ingest/parse";
import { profileDataset } from "@/lib/ingest/profile";
import { buildAiContext } from "@/lib/privacy/ai-context";
import { Pseudonymizer } from "@/lib/privacy/pseudonymize";

// Aperçu produit de la landing page : un vrai dashboard calculé par le moteur, sur le fichier de démonstration
// (données fictives, public/demo/ventes-demo.csv). Aucun appel à l'IA : conception par les règles de démonstration.

export interface LandingPreview {
  fileName: string;
  rowCount: number;
  kpis: ComputedKpi[];
  trend: ComputedChart | null;
  breakdown: ComputedChart | null;
}

let cached: LandingPreview | null | undefined;

export function landingPreview(): LandingPreview | null {
  if (cached !== undefined) return cached;
  try {
    const fileName = "ventes-demo.csv";
    const raw = parseCsv(fileName, readFileSync(path.join(process.cwd(), "public/demo", fileName), "utf-8"));
    const { profile, rows } = profileDataset(raw);
    // Clé locale à l'aperçu : la pseudonymisation n'a d'effet que sur le contexte, jamais envoyé ici.
    const ctx = buildAiContext(profile, rows, "strict", Pseudonymizer.forOrganization("apercu-landing", "landing"));
    const spec = completeSpec(validateSpec(buildDemoSpec(ctx), profile).spec, profile);
    const { kpis, charts } = computeDashboard(spec, rows, profile);
    const currency = kpis.filter((k) => k.format === "currency");
    cached = {
      fileName,
      rowCount: profile.rowCount,
      kpis: [...currency, ...kpis.filter((k) => k.format !== "currency")].slice(0, 3),
      trend: charts.find((c) => c.chronological && c.format === "currency") ?? charts.find((c) => c.chronological) ?? null,
      breakdown: charts.find((c) => !c.chronological && c.data.length >= 3 && c.data.length <= 8 && c.format === "currency") ?? null,
    };
  } catch (error) {
    console.error("Aperçu de la landing page indisponible", error instanceof Error ? error.message : error);
    cached = null;
  }
  return cached;
}
