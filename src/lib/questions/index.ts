import { z } from "zod";
import { activeProvider, AiError, callClaude, type AiUsage } from "@/lib/ai/gateway";
import { AGGREGATIONS, GRANULARITIES, type DashboardSpec } from "@/lib/ai/spec";
import { groupRows } from "@/lib/engine/aggregate";
import { measureEvaluator, type ComputedChart, type ValueFormat } from "@/lib/engine/compute";
import { formatPeriod, formatValue } from "@/lib/format";
import type { Pseudonymizer } from "@/lib/privacy/pseudonymize";
import type { AiMode, DatasetProfile, TypedRow } from "@/lib/types";

// Questions en langage naturel (US-07). L'IA ne fait que traduire la question en requête structurée
// (mesure, regroupement, filtres, période), à partir de la question pseudonymisée et de la structure du fichier.
// Le moteur calcule sur les vraies données ; la réponse est rédigée par des règles à partir de ce calcul.

export const QuerySchema = z.object({
  measure: z.string().describe("Id d'une mesure de la liste, ou \"rows\" pour compter les lignes"),
  aggregation: z.enum(AGGREGATIONS),
  group_by: z.string().nullable().describe("Colonne de regroupement, ou null pour une seule valeur"),
  granularity: z.enum(GRANULARITIES).nullable().describe("Si group_by est une date : month en général"),
  filters: z.array(z.object({ column: z.string(), values: z.array(z.string()) })).describe("Valeurs retenues par colonne (jetons recopiés tels quels)"),
  period: z.object({ from: z.string().nullable(), to: z.string().nullable() }).describe("Mois AAAA-MM de début et de fin, ou null"),
  sort: z.enum(["desc", "asc"]).nullable(),
  limit: z.number().int().nullable(),
  chart: z.enum(["number", "bar", "line", "pie", "table"]),
  title: z.string().describe("Titre court en français, sans chiffre"),
  unsupported_reason: z.string().nullable().describe("Si la question ne peut pas être traitée avec ces colonnes : pourquoi, en une phrase ; sinon null"),
});

export type Query = z.infer<typeof QuerySchema>;

export const QUESTION_SYSTEM_PROMPT = `Tu traduis une question en français sur un fichier de données en requête structurée pour un moteur de calcul.

Règles :
- Utilise uniquement les mesures (par leur id) et les colonnes fournies, écrites exactement comme dans la liste.
- Les valeurs identifiantes (clients, personnes…) sont remplacées par des jetons PREFIXE_xxxxxxxx : recopie-les à l'identique dans les filtres, n'en invente pas.
- Pour une valeur unique (« quel est le CA de mars ? »), group_by = null et chart = "number".
- Pour un classement (« quels sont les 5 meilleurs clients ? »), group_by = la colonne, sort = "desc", limit, chart = "bar".
- Pour une évolution (« comment évolue la marge ? »), group_by = la colonne de date, granularity = "month", chart = "line".
- Une mesure dérivée (sans colonne) s'agrège toujours par "sum". « Combien de ventes / de lignes » : measure = "rows", aggregation = "count". « Combien de clients » : aggregation = "count_distinct" sur la mesure de la colonne si elle existe, sinon unsupported_reason.
- Les périodes sont des mois AAAA-MM, d'après les périodes disponibles.
- Si la question ne peut pas être traitée avec ces données (prévision, cause externe, colonne absente), renseigne unsupported_reason et laisse le reste minimal.
- Tu ne calcules rien et n'écris aucun chiffre : le moteur calcule.`;

export interface QuestionContext {
  question: string;
  measures: { id: string; label: string; format: string; derived: boolean }[];
  columns: { name: string; role: string; values: string[] | "jetons" }[];
  periods: { first: string | null; last: string | null };
}

export interface QuestionAnswer extends AiUsage {
  question: string;
  answer: string;
  /** Valeur unique, ou graphique pour une réponse par catégorie ou dans le temps. */
  value: { label: string; value: number | null; format: ValueFormat } | null;
  chart: ComputedChart | null;
  /** Requête exécutée, affichée par transparence (filtres en clair). */
  query: Query | null;
  interpretedBy: "ai" | "rules";
  notes: string[];
  /** Question telle qu'envoyée à l'IA (pseudonymisée), ou null si aucune IA n'a été appelée. */
  sentToAi: string | null;
}

const MAX_VALUES_SENT = 60;

/** Remplace dans la question les valeurs des colonnes pseudonymisées (noms de clients…) par leurs jetons. */
export function pseudonymizeQuestion(question: string, profile: DatasetProfile, rows: TypedRow[], pseudo: Pseudonymizer): string {
  let text = question;
  for (const column of profile.columns.filter((c) => c.treatment === "tokenize")) {
    const values = [...new Set(rows.map((r) => r[column.name]).filter((v): v is string => typeof v === "string" && v.trim().length >= 3))];
    // Les valeurs les plus longues d'abord, pour ne pas remplacer « Martin » dans « Paul Martin ».
    for (const value of values.sort((a, b) => b.length - a.length)) {
      const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "giu");
      if (pattern.test(text)) text = text.replace(pattern, pseudo.tokenize(column.name, value));
    }
  }
  return text;
}

export function questionContext(question: string, spec: DashboardSpec, profile: DatasetProfile, rows: TypedRow[]): QuestionContext {
  const dates = profile.columns.find((c) => c.role === "date")?.name;
  const months = dates ? rows.map((r) => r[dates]).filter((v): v is string => typeof v === "string").map((v) => v.slice(0, 7)).sort() : [];
  return {
    question,
    measures: spec.measures.map((m) => ({ id: m.id, label: m.label, format: m.format, derived: m.column === null })),
    columns: profile.columns
      .filter((c) => c.role !== "ignored")
      .map((c) => ({
        name: c.name,
        role: c.role,
        values:
          c.treatment === "tokenize"
            ? "jetons"
            : c.role === "dimension"
              ? [...new Set(rows.map((r) => r[c.name]).filter((v) => v !== null).map(String))].slice(0, MAX_VALUES_SENT)
              : [],
      })),
    periods: { first: months[0] ?? null, last: months.at(-1) ?? null },
  };
}

// ——— Interprétation sans IA (démonstration, mode strict, IA indisponible) ———

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Interprétation par mots-clés : mesure citée, « par <colonne> », « évolution », « top N », mois et valeurs cités. */
export function interpretWithRules(question: string, spec: DashboardSpec, profile: DatasetProfile, rows: TypedRow[]): Query {
  const q = norm(question);
  const date = profile.columns.find((c) => c.role === "date")?.name ?? null;
  const dims = profile.columns.filter((c) => c.role === "dimension");
  // Les mesures « comptage distinct » (colonne de catégorie, ex. Client) ne sont pas des indicateurs à citer par leur nom.
  const dimensionColumns = new Set(dims.map((d) => d.name));
  const candidates = spec.measures.filter((m) => !m.column || !dimensionColumns.has(m.column));
  const byLength = [...candidates].sort((a, b) => b.label.length - a.label.length);
  const KEYWORDS: [RegExp, RegExp][] = [
    [/taux de marge|marge en %/, /taux/],
    [/\bmarge\b/, /marge/],
    [/\bca\b|chiffre d.affaires|ventes? en valeur|montant/, /\bca\b|chiffre|montant|vente/],
    [/cout|achat/, /cout|achat/],
    [/quantit/, /quantit/],
  ];
  let measure = byLength.find((m) => q.includes(norm(m.label)));
  if (!measure) {
    for (const [inQuestion, inLabel] of KEYWORDS) {
      if (inQuestion.test(q)) {
        measure = candidates.find((m) => inLabel.test(norm(m.label)) && !/additionnel|unitaire/.test(norm(m.label)));
        if (measure) break;
      }
    }
  }
  const counting = /combien de (ventes|lignes|commandes|transactions)|nombre de (ventes|lignes|commandes)/.test(q);
  const group = (/\bpar\s+([\p{L} ]+)/u.exec(q)?.[1] ?? "").trim();
  const firstWord = group.split(" ")[0]?.replace(/s$/, "") ?? "";
  let groupBy = group ? (dims.find((d) => group.startsWith(norm(d.name)) || (firstWord.length >= 3 && norm(d.name).startsWith(firstWord)))?.name ?? null) : null;
  // Classement sans « par » : « les 5 meilleurs clients » regroupe par la dimension citée.
  if (!groupBy && /meilleur|premier|plus gros|principaux|classement|top/.test(q)) {
    groupBy = dims.find((d) => new RegExp(`\\b${norm(d.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?\\b`).test(q))?.name ?? null;
  }
  const evolution = /evolu|tendance|mois par mois|par mois|dans le temps/.test(q);
  if (evolution && date) groupBy = date;
  const top = /(\d+)\s+(meilleur|premier|plus gros|principaux)|top\s*(\d+)/.exec(q);
  const limit = top ? Number(top[1] ?? top[3]) : null;
  const filters: Query["filters"] = [];
  for (const d of dims) {
    const values = [...new Set(rows.map((r) => r[d.name]).filter((v): v is string => typeof v === "string"))].filter((v) => v.length >= 3 && q.includes(norm(v)));
    if (values.length > 0 && d.name !== groupBy) filters.push({ column: d.name, values });
  }
  const year = /\b(20\d{2})\b/.exec(q)?.[1];
  const monthIndex = MONTHS.findIndex((m) => q.includes(norm(m)));
  const last = date ? rows.map((r) => r[date]).filter((v): v is string => typeof v === "string").sort().at(-1)?.slice(0, 4) : undefined;
  const month = monthIndex >= 0 ? `${year ?? last}-${String(monthIndex + 1).padStart(2, "0")}` : null;
  const period = month ? { from: month, to: month } : year ? { from: `${year}-01`, to: `${year}-12` } : { from: null, to: null };

  // Classement ou évolution sans indicateur cité : l'indicateur principal du dashboard (premier KPI).
  if (!measure && !counting && groupBy) {
    const main = spec.kpis.find((k) => k.measure !== "rows" && k.aggregation === "sum")?.measure;
    measure = candidates.find((m) => m.id === main);
  }
  const derived = measure && measure.column === null;
  const average = /moyen|moyenne/.test(q) && !derived;
  return {
    measure: counting || !measure ? "rows" : measure.id,
    aggregation: counting || !measure ? "count" : average ? "avg" : "sum",
    group_by: groupBy,
    granularity: groupBy === date ? "month" : null,
    filters,
    period,
    sort: groupBy && groupBy !== date ? "desc" : null,
    limit,
    chart: !groupBy ? "number" : groupBy === date ? "line" : "bar",
    title: question.trim().replace(/\?$/, ""),
    unsupported_reason: !measure && !counting ? "Je n'ai pas reconnu d'indicateur dans la question." : null,
  };
}

// ——— Exécution par le moteur ———

export function runQuery(
  query: Query,
  spec: DashboardSpec,
  profile: DatasetProfile,
  rows: TypedRow[],
  resolve: (token: string) => string,
): Pick<QuestionAnswer, "answer" | "value" | "chart" | "notes"> & { query: Query } {
  const notes: string[] = [];
  const columns = new Map(profile.columns.filter((c) => c.role !== "ignored").map((c) => [c.name, c]));
  const measure = query.measure === "rows" ? null : spec.measures.find((m) => m.id === query.measure);
  if (query.measure !== "rows" && !measure) throw new QuestionError("Cette question porte sur un indicateur absent du fichier.");
  let aggregation = query.measure === "rows" ? "count" : query.aggregation;
  if (measure?.column === null && aggregation !== "sum") aggregation = "sum";
  if (measure?.column && ["sum", "avg", "min", "max"].includes(aggregation) && columns.get(measure.column)?.role !== "measure") aggregation = "count_distinct";

  // Filtres : jetons ré-identifiés, colonnes inconnues ignorées et signalées.
  const filters = query.filters
    .filter((f) => {
      if (columns.has(f.column)) return true;
      notes.push(`Filtre sur « ${f.column} » ignoré : colonne absente du fichier.`);
      return false;
    })
    .map((f) => ({ column: f.column, values: f.values.map(resolve) }));
  const date = profile.columns.find((c) => c.role === "date")?.name ?? null;
  const month = (v: unknown) => (typeof v === "string" ? v.slice(0, 7) : null);
  const valid = (p: string | null) => (p && /^\d{4}-\d{2}$/.test(p) ? p : null);
  const from = valid(query.period.from);
  const to = valid(query.period.to);
  const selected = rows.filter((r) => {
    for (const f of filters) if (!f.values.includes(String(r[f.column] ?? ""))) return false;
    if (date && (from || to)) {
      const m = month(r[date]);
      if (!m || (from && m < from) || (to && m > to)) return false;
    }
    return true;
  });
  const resolvedQuery: Query = { ...query, aggregation: aggregation as Query["aggregation"], filters };

  const valueOf = measureEvaluator(spec);
  const label = query.measure === "rows" ? "Nombre de lignes" : aggregation === "count_distinct" ? `Nombre de ${measure!.label} distincts` : measure!.label;
  const format: ValueFormat = query.measure === "rows" || aggregation === "count" || aggregation === "count_distinct" ? "number" : measure!.format;
  const scope = describeScope(filters, from, to);

  if (selected.length === 0) {
    return { query: resolvedQuery, answer: `Aucune ligne ne correspond${scope ? ` (${scope})` : ""} : rien à calculer.`, value: null, chart: null, notes };
  }

  const groupColumn = query.group_by && columns.has(query.group_by) && columns.get(query.group_by)!.role !== "measure" ? query.group_by : null;
  if (query.group_by && !groupColumn) notes.push(`Regroupement par « ${query.group_by} » impossible : réponse sur l'ensemble des lignes.`);

  if (!groupColumn) {
    const value = valueOf(selected, query.measure, aggregation as Query["aggregation"]);
    const answer =
      value === null
        ? `${label} : aucune valeur exploitable${scope ? ` (${scope})` : ""}.`
        : `${label}${scope ? ` (${scope})` : ""} : ${formatValue(value, format)}, calculé sur ${selected.length.toLocaleString("fr-FR")} ligne(s).`;
    return { query: resolvedQuery, answer, value: { label, value, format }, chart: null, notes };
  }

  const chronological = groupColumn === date;
  const granularity = chronological ? (query.granularity ?? "month") : null;
  let data = [...groupRows(selected, groupColumn, granularity)].map(([category, list]) => ({ category, value: valueOf(list, query.measure, aggregation as Query["aggregation"]) }));
  if (chronological) data.sort((a, b) => a.category.localeCompare(b.category));
  else data.sort((a, b) => (query.sort === "asc" ? (a.value ?? Infinity) - (b.value ?? Infinity) : (b.value ?? -Infinity) - (a.value ?? -Infinity)));
  const limit = Math.min(Math.max(query.limit ?? (chronological ? 60 : 12), 1), 60);
  const othersCount = Math.max(0, data.length - limit);
  data = data.slice(0, limit);

  const chartType = chronological ? "line" : query.chart === "pie" && data.length <= 6 && format !== "percent" ? "pie" : query.chart === "table" ? "table" : "bar";
  const chart: ComputedChart = {
    id: "question",
    type: chartType,
    title: query.title,
    measureLabel: label,
    format,
    formula: `${label} par ${groupColumn}`,
    chronological,
    dimension: groupColumn,
    data,
    othersCount,
  };
  return { query: resolvedQuery, answer: groupAnswer(data, label, format, chronological, groupColumn, scope, query.sort), value: null, chart, notes };
}

function describeScope(filters: { column: string; values: string[] }[], from: string | null, to: string | null): string {
  const parts = filters.map((f) => `${f.column} : ${f.values.slice(0, 3).join(", ")}${f.values.length > 3 ? "…" : ""}`);
  if (from && to) parts.push(from === to ? formatPeriod(from) : `${formatPeriod(from)} → ${formatPeriod(to)}`);
  else if (from) parts.push(`depuis ${formatPeriod(from)}`);
  else if (to) parts.push(`jusqu'à ${formatPeriod(to)}`);
  return parts.join(" · ");
}

function groupAnswer(
  data: { category: string; value: number | null }[],
  label: string,
  format: ValueFormat,
  chronological: boolean,
  column: string,
  scope: string,
  sort: Query["sort"],
): string {
  const suffix = scope ? ` (${scope})` : "";
  const valued = data.filter((d) => d.value !== null) as { category: string; value: number }[];
  if (valued.length === 0) return `${label} par ${column}${suffix} : aucune valeur exploitable.`;
  if (chronological) {
    const first = valued[0];
    const last = valued.at(-1)!;
    if (valued.length === 1) return `${label} en ${formatPeriod(first.category)}${suffix} : ${formatValue(first.value, format)}.`;
    const change = first.value !== 0 ? (last.value - first.value) / Math.abs(first.value) : null;
    const pct = change === null ? "" : ` (${change >= 0 ? "+" : "−"}${Math.abs(Math.round(change * 1000) / 10).toLocaleString("fr-FR")} %)`;
    return `${label}${suffix} : ${formatValue(first.value, format)} en ${formatPeriod(first.category)}, ${formatValue(last.value, format)} en ${formatPeriod(last.category)}${pct}.`;
  }
  const head = valued[0];
  const total = valued.reduce((s, d) => s + d.value, 0);
  const share = format !== "percent" && total > 0 && head.value > 0 ? ` (${(Math.round((head.value / total) * 1000) / 10).toLocaleString("fr-FR")} % des valeurs affichées)` : "";
  return `${sort === "asc" ? "Plus faible" : "En tête"} : ${head.category} avec ${formatValue(head.value, format)}${share}${suffix}. ${valued.length} ${column.toLowerCase()} affiché(s).`;
}

export class QuestionError extends Error {}

/** Question complète : interprétation (IA sur données pseudonymisées, ou règles), calcul, réponse ré-identifiée. */
export async function answerQuestion(input: {
  question: string;
  spec: DashboardSpec;
  profile: DatasetProfile;
  rows: TypedRow[];
  mode: AiMode;
  pseudo: Pseudonymizer;
}): Promise<QuestionAnswer> {
  const question = input.question.trim().slice(0, 500);
  if (question.length < 3) throw new QuestionError("Posez une question d'au moins quelques mots.");
  const provider = activeProvider();
  const none: AiUsage = { provider: "demo", model: null, inputTokens: null, outputTokens: null };
  const notes: string[] = [];
  let query: Query;
  let usage = none;
  let interpretedBy: QuestionAnswer["interpretedBy"] = "rules";
  let sentToAi: string | null = null;

  // Mode strict ou démonstration : aucune IA, interprétation par mots-clés.
  if (input.mode === "strict" || provider === "demo") {
    query = interpretWithRules(question, input.spec, input.profile, input.rows);
  } else {
    sentToAi = pseudonymizeQuestion(question, input.profile, input.rows, input.pseudo);
    const ctx = questionContext(sentToAi, input.spec, input.profile, input.rows);
    try {
      const { output, ...callUsage } = await callClaude(provider, QuerySchema, QUESTION_SYSTEM_PROMPT, `<donnees>\n${JSON.stringify(ctx)}\n</donnees>`);
      query = output;
      usage = callUsage;
      interpretedBy = "ai";
    } catch (error) {
      if (!(error instanceof AiError)) throw error;
      notes.push(`L'IA n'a pas pu interpréter la question (${error.message}) : interprétation par mots-clés.`);
      query = interpretWithRules(question, input.spec, input.profile, input.rows);
      sentToAi = null;
    }
  }

  const resolve = (text: string) => input.pseudo.reidentify(text).text;
  if (query.unsupported_reason) {
    return { ...usage, question, answer: resolve(query.unsupported_reason), value: null, chart: null, query, interpretedBy, notes, sentToAi };
  }
  const result = runQuery(query, input.spec, input.profile, input.rows, resolve);
  return {
    ...usage,
    question,
    answer: result.answer,
    value: result.value,
    chart: result.chart ? { ...result.chart, title: resolve(result.chart.title) } : null,
    query: result.query,
    interpretedBy,
    notes: [...notes, ...result.notes],
    sentToAi,
  };
}
