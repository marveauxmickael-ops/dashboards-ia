import { readFileSync } from "node:fs";
import path from "node:path";
import { buildDemoSpec } from "@/lib/ai/demo-designer";
import { completeSpec } from "@/lib/engine/complete";
import { computeDashboard, validateSpec, type ComputedChart, type ComputedKpi } from "@/lib/engine/compute";
import { parseCsv } from "@/lib/ingest/parse";
import { profileDataset } from "@/lib/ingest/profile";
import { buildAiContext } from "@/lib/privacy/ai-context";
import { Pseudonymizer } from "@/lib/privacy/pseudonymize";
import type { TypedRow } from "@/lib/types";

// Aperçu produit de la landing page : un vrai dashboard calculé par le moteur, sur le fichier de démonstration
// (données fictives, public/demo/ventes-demo.csv). Aucun appel à l'IA : conception par les règles de démonstration.

/** Chiffres d'un mois (ou de toute la période) pour l'animation du hero. */
export interface MonthFigures {
  label: string;
  short: string;
  revenue: number;
  /** Taux de marge en points (null si le fichier n'a pas de coût). */
  margin: number | null;
  /** Nombre de clients distincts (null si pas de colonne client). */
  clients: number | null;
}

export interface LandingPreview {
  fileName: string;
  rowCount: number;
  kpis: ComputedKpi[];
  trend: ComputedChart | null;
  breakdown: ComputedChart | null;
  months: MonthFigures[];
  total: MonthFigures | null;
}

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** Chiffre d'affaires, taux de marge et clients actifs par mois, calculés sur les lignes du fichier. */
function monthly(rows: TypedRow[], date: string, revenue: string, cost: string | undefined, client: string | undefined) {
  const acc = new Map<string, { revenue: number; cost: number; clients: Set<string> }>();
  const all = { revenue: 0, cost: 0, clients: new Set<string>() };
  for (const r of rows) {
    const d = r[date], v = r[revenue];
    if (typeof d !== "string" || typeof v !== "number") continue;
    const key = d.slice(0, 7);
    const m = acc.get(key) ?? { revenue: 0, cost: 0, clients: new Set<string>() };
    const c = cost && typeof r[cost] === "number" ? (r[cost] as number) : 0;
    const who = client && r[client] != null ? String(r[client]) : null;
    for (const t of [m, all]) {
      t.revenue += v;
      t.cost += c;
      if (who) t.clients.add(who);
    }
    acc.set(key, m);
  }
  const figures = (label: string, short: string, t: typeof all): MonthFigures => ({
    label,
    short,
    revenue: Math.round(t.revenue),
    margin: cost && t.revenue > 0 ? Math.round(((t.revenue - t.cost) / t.revenue) * 1000) / 10 : null,
    clients: client ? t.clients.size : null,
  });
  const keys = [...acc.keys()].sort().slice(-12);
  const months = keys.map((k) => {
    const [y, m] = k.split("-").map(Number);
    const name = MONTHS[m - 1];
    return figures(`${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`, name.replace(".", ""), acc.get(k)!);
  });
  const total = keys.length ? figures(`${months[0].label.toLowerCase()} → ${months.at(-1)!.label.toLowerCase()}`, "", all) : null;
  return { months, total };
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
    const column = (re: RegExp, role?: string) => profile.columns.find((c) => re.test(c.name) && (!role || c.role === role))?.name;
    const date = profile.columns.find((c) => c.role === "date")?.name;
    const revenue = column(/montant ht|chiffre|\bca\b/i, "measure");
    const series = date && revenue ? monthly(rows, date, revenue, column(/co[uû]t|achat/i, "measure"), column(/client/i)) : { months: [], total: null };
    cached = {
      fileName,
      rowCount: profile.rowCount,
      kpis: [...currency, ...kpis.filter((k) => k.format !== "currency")].slice(0, 3),
      trend: charts.find((c) => c.chronological && c.format === "currency") ?? charts.find((c) => c.chronological) ?? null,
      breakdown: charts.find((c) => !c.chronological && c.data.length >= 3 && c.data.length <= 8 && c.format === "currency") ?? null,
      ...series,
    };
  } catch (error) {
    console.error("Aperçu de la landing page indisponible", error instanceof Error ? error.message : error);
    cached = null;
  }
  return cached;
}
