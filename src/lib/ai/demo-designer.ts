import type { AiContext } from "@/lib/privacy/ai-context";
import type { Chart, DashboardSpec, Insight, Kpi, Measure } from "./spec";

// Concepteur de secours, sans appel à un modèle : il permet de faire tourner la démo sans clé d'API.
// Il reçoit exactement le même contexte pseudonymisé que Claude et renvoie le même format.

// Chiffre d'affaires : par ordre de préférence, en écartant les prix unitaires et les ventes additionnelles.
const REVENUE_PRIORITY = [/\bca\b|chiffre/i, /montant|vente|revenu|recette/i];
const COST = /co[uû]t|achat|charge|d[ée]pense/i;
const MARGIN = /marge/i;
const SECONDARY = /unitaire|additionnel|compl[ée]mentaire|upsell/i;
const ADD_ON = /additionnel|compl[ée]mentaire|upsell/i;
const MONEY = /chiffre|\bca\b|montant|prix|co[uû]t|marge|achat|charge|vente|revenu|€|\bht\b|\bttc\b|eur/i;

export function buildDemoSpec(ctx: AiContext): DashboardSpec {
  const measureCols = ctx.columns.filter((c) => c.role === "measure");
  const dateCol = ctx.columns.find((c) => c.role === "date");
  const dims = ctx.columns.filter((c) => c.role === "dimension" && c.distinct > 1);

  const measures: Measure[] = measureCols.map((c, i) => ({
    id: `m${i + 1}`,
    label: c.name,
    column: c.name,
    operation: null,
    left: null,
    right: null,
    format: MONEY.test(c.name) ? "currency" : "number",
  }));
  const primary = measures.filter((m) => !SECONDARY.test(m.label));
  const revenue = REVENUE_PRIORITY.map((re) => primary.find((m) => re.test(m.label))).find(Boolean) ?? primary[0] ?? measures[0];
  const cost = primary.find((m) => m !== revenue && COST.test(m.label));
  const marginColumn = primary.find((m) => m !== revenue && MARGIN.test(m.label));
  const addOn = measures.find((m) => ADD_ON.test(m.label) && !MARGIN.test(m.label) && m.format === "currency");

  // Marge : la colonne du fichier si elle existe, sinon CA − coûts.
  let marginId: string | null = null;
  if (revenue && marginColumn) {
    marginId = marginColumn.id;
  } else if (revenue && cost) {
    measures.push({ id: "marge", label: "Marge", column: null, operation: "difference", left: revenue.id, right: cost.id, format: "currency" });
    marginId = "marge";
  }
  if (revenue && marginId) {
    measures.push({ id: "taux_marge", label: "Taux de marge", column: null, operation: "ratio", left: marginId, right: revenue.id, format: "percent" });
  }

  const kpis: Kpi[] = [];
  if (revenue) kpis.push({ id: "k_total", label: `${revenue.label} total`, description: `Somme de ${revenue.label} sur la période.`, measure: revenue.id, aggregation: "sum" });
  if (revenue && marginId) {
    kpis.push(
      { id: "k_marge", label: "Marge", description: marginColumn ? `Somme de ${marginColumn.label}.` : `${revenue.label} moins ${cost!.label}.`, measure: marginId, aggregation: "sum" },
      { id: "k_taux", label: "Taux de marge", description: `Marge rapportée à ${revenue.label}.`, measure: "taux_marge", aggregation: "sum" },
    );
  }
  if (addOn) kpis.push({ id: "k_additionnel", label: addOn.label, description: `Somme de ${addOn.label} sur la période.`, measure: addOn.id, aggregation: "sum" });
  kpis.push({ id: "k_lignes", label: "Nombre de lignes", description: "Nombre d'enregistrements dans le fichier.", measure: "rows", aggregation: "count" });
  if (revenue) kpis.push({ id: "k_moyenne", label: `${revenue.label} moyen`, description: `Valeur moyenne de ${revenue.label} par ligne.`, measure: revenue.id, aggregation: "avg" });

  const mainMeasure = revenue?.id ?? "rows";
  const mainAgg = revenue ? "sum" : "count";
  const charts: Chart[] = [];
  if (dateCol) {
    charts.push({ id: "c_evolution", type: "line", title: `Évolution mensuelle — ${revenue?.label ?? "lignes"}`, dimension: dateCol.name, granularity: "month", measure: mainMeasure, aggregation: mainAgg, limit: null });
  }
  const rankDim = dims.find((d) => d.values === "jetons") ?? [...dims].sort((a, b) => b.distinct - a.distinct)[0];
  if (rankDim) {
    charts.push({ id: "c_classement", type: "bar", title: `${revenue?.label ?? "Lignes"} par ${rankDim.name}`, dimension: rankDim.name, granularity: null, measure: mainMeasure, aggregation: mainAgg, limit: 10 });
  }
  const pieDim = dims.find((d) => d !== rankDim && d.distinct <= 8);
  if (pieDim) {
    charts.push({ id: "c_repartition", type: "pie", title: `Répartition par ${pieDim.name}`, dimension: pieDim.name, granularity: null, measure: mainMeasure, aggregation: mainAgg, limit: null });
  }

  const insights: Insight[] = [];
  if (ctx.mode === "standard" && revenue) {
    const breakdown = ctx.breakdowns?.find((b) => b.dimension === rankDim?.name && b.measure === revenue.column);
    const top = breakdown?.groups[0];
    if (top && top.sum !== null) {
      insights.push({
        text: `${top.category} est le premier contributeur en ${revenue.label} avec ${formatFr(top.sum)}${revenue.format === "currency" ? " €" : ""}.`,
        citations: [{ kpi: null, chart: "c_classement", category: top.category, compare_to: null, value: top.sum }],
      });
    }
    const series = ctx.timeSeries?.find((t) => t.measure === revenue.column)?.points.filter((p) => p.sum !== null);
    if (series && series.length >= 2) {
      const [prev, last] = series.slice(-2);
      const change = (last.sum! - prev.sum!) / Math.abs(prev.sum!);
      insights.push({
        text: `${revenue.label} ${change >= 0 ? "progresse" : "recule"} de ${formatFr(Math.abs(change) * 100)} % en ${monthLabel(last.period)} par rapport à ${monthLabel(prev.period)}.`,
        citations: [{ kpi: null, chart: "c_evolution", category: last.period, compare_to: prev.period, value: change }],
      });
    }
  }

  return { title: "Tableau de bord de l'activité", measures, kpis, charts, insights };
}

function formatFr(n: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(n);
}

function monthLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
}
