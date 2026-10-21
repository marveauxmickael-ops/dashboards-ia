import { z } from "zod";
import { activeProvider, AiError, callClaude, type AiUsage } from "@/lib/ai/gateway";
import type { Recommendation, RecommendationsResult, Signal } from "./types";
export type { Recommendation, RecommendationGroup, RecommendationsResult, Signal, SignalKind } from "./types";
export { suggestionsFor } from "./types";
import { inScope } from "@/lib/ingest/scopes";
import type { Pseudonymizer } from "@/lib/privacy/pseudonymize";
import type { ShrinkageReport } from "@/lib/shrinkage";
import type { AiMode, DatasetProfile, TypedRow } from "@/lib/types";

// Recommandations (US-19) : des pistes d'action pour réduire les pertes et développer ce qui marche.
// Le moteur repère les signaux et calcule chaque chiffre (pertes par article, meilleures ventes, marges, hausses) ;
// l'IA rédige les conseils sur des données pseudonymisées, sans écrire aucun chiffre ; sans IA (mode strict,
// démonstration, IA indisponible), des règles métier les rédigent. Ce sont des pistes à valider, pas des certitudes.

const ITEM_LABEL = /libell[ée]\s+article|d[ée]signation|libell[ée]\s+produit|^produit$|^article$/i;
const SALES_HEADER = /vente|chiffre|\bca\b|revenu/i;
const MARGIN_HEADER = /marge/i;
const NON_ADDITIVE = /taux|%|pourcent|ratio|moyen/i;
const TOP_SELLERS = 3;
const HIGH_MARGIN_GAP = 0.05;
const RISING_MIN = 0.2;
const LOSS_RATE_ALERT = 0.05;

const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const lower = (s: string) => s.toLowerCase();

/** Signaux du moteur : pertes (journal de démarque) et performances (ventes). */
export function computeSignals(profile: DatasetProfile, rows: TypedRow[], shrinkage: ShrinkageReport | null | undefined): Signal[] {
  const signals: Signal[] = [];
  const itemColumn = profile.columns.find((c) => ITEM_LABEL.test(c.name) && c.type !== "number" && c.type !== "date")?.name ?? null;

  // Ventes : lignes du fichier principal quand des fichiers sont reliés. Un journal de démarque seul n'a pas de ventes.
  const scopes = profile.scopes;
  const salesRows = scopes ? rows.filter((r) => String(r[scopes.column]) === scopes.sources[0]) : shrinkage ? [] : rows;
  const measures = profile.columns.filter((c) => c.role === "measure" && salesRows.some((r) => r[c.name] !== null && inScope(scopes, r, c.name))).map((c) => c.name);
  const salesCandidates = measures.filter((c) => SALES_HEADER.test(c) && !NON_ADDITIVE.test(c) && !/valeur/i.test(c));
  const salesColumn = salesCandidates.find((c) => /\bht\b/i.test(c)) ?? salesCandidates[0] ?? null;
  const marginColumn = measures.find((c) => MARGIN_HEADER.test(c) && !NON_ADDITIVE.test(c)) ?? null;

  type ItemStats = { sales: number; margin: number; byMonth: Map<string, number> };
  const stats = new Map<string, ItemStats>();
  const dateColumn = profile.columns.find((c) => c.role === "date" && salesRows.some((r) => r[c.name] !== null))?.name ?? null;
  if (itemColumn && salesColumn) {
    for (const r of salesRows) {
      const item = r[itemColumn];
      if (item === null) continue;
      const s = stats.get(String(item)) ?? { sales: 0, margin: 0, byMonth: new Map() };
      s.sales += num(r[salesColumn]);
      if (marginColumn) s.margin += num(r[marginColumn]);
      const date = dateColumn ? r[dateColumn] : null;
      if (typeof date === "string") s.byMonth.set(date.slice(0, 7), (s.byMonth.get(date.slice(0, 7)) ?? 0) + num(r[salesColumn]));
      stats.set(String(item), s);
    }
  }
  const totalSales = [...stats.values()].reduce((n, s) => n + s.sales, 0);

  const lossColumns = [shrinkage?.saleColumn, shrinkage?.costColumn].filter((c): c is string => !!c);
  const growthColumns = [salesColumn, marginColumn].filter((c): c is string => !!c);

  // 1. Pertes : articles, rayon et motif dominants.
  if (shrinkage) {
    for (const it of shrinkage.items.slice(0, 3)) {
      const sold = stats.get(it.item)?.sales ?? null;
      const rate = sold && sold > 0 ? it.lost / sold : null;
      const alert = rate !== null && rate >= LOSS_RATE_ALERT && (stats.get(it.item)?.sales ?? 0) > 0;
      signals.push({
        id: `${alert ? "sell_but_lose" : "loss_item"}:${it.item}`,
        kind: alert ? "sell_but_lose" : "loss_item",
        group: "losses",
        subject: it.item,
        subjectColumn: shrinkage.itemColumn,
        columns: lossColumns,
        metrics: { lost: it.lost, share_of_losses: it.share, main_type: it.mainType, main_type_share: it.mainTypeShare, aisle: it.aisle, sales: sold, loss_rate: rate },
      });
    }
    const aisle = shrinkage.byAisle[0];
    if (aisle && aisle.share >= 0.25) {
      signals.push({ id: `loss_aisle:${aisle.aisle}`, kind: "loss_aisle", group: "losses", subject: aisle.aisle, subjectColumn: null, columns: lossColumns, metrics: { lost: aisle.lost, share_of_losses: aisle.share } });
    }
    const type = shrinkage.byType[0];
    if (type && type.share >= 0.5) {
      signals.push({ id: `loss_type:${type.type}`, kind: "loss_type", group: "losses", subject: type.type, subjectColumn: null, columns: lossColumns, metrics: { lost: type.lost, share_of_losses: type.share } });
    }
  }

  // 2. Performances : meilleures ventes, marges au-dessus de la moyenne, articles en hausse.
  if (stats.size >= 3 && totalSales > 0) {
    const ranked = [...stats].sort((a, b) => b[1].sales - a[1].sales);
    const avgRate = marginColumn ? [...stats.values()].reduce((n, s) => n + s.margin, 0) / totalSales : null;
    const lossItems = new Set(shrinkage?.items.map((i) => i.item) ?? []);
    for (const [item, s] of ranked.slice(0, TOP_SELLERS)) {
      if (lossItems.has(item)) continue;
      signals.push({
        id: `top_seller:${item}`,
        kind: "top_seller",
        group: "growth",
        subject: item,
        subjectColumn: itemColumn,
        columns: growthColumns,
        metrics: { rank: ranked.findIndex(([i]) => i === item) + 1, sales: Math.round(s.sales), share_of_sales: s.sales / totalSales, margin_rate: marginColumn && s.sales > 0 ? s.margin / s.sales : null },
      });
    }
    if (avgRate !== null) {
      const median = ranked[Math.floor(ranked.length / 2)][1].sales;
      const strong = ranked
        .filter(([item, s]) => s.sales >= median && s.sales > 0 && s.margin / s.sales >= avgRate + HIGH_MARGIN_GAP && !lossItems.has(item) && !signals.some((g) => g.subject === item))
        .sort((a, b) => b[1].margin / b[1].sales - a[1].margin / a[1].sales)
        .slice(0, 2);
      for (const [item, s] of strong) {
        signals.push({ id: `high_margin:${item}`, kind: "high_margin", group: "growth", subject: item, subjectColumn: itemColumn, columns: growthColumns, metrics: { margin_rate: s.margin / s.sales, average_margin_rate: avgRate, sales: Math.round(s.sales) } });
      }
    }
    const months = [...new Set([...stats.values()].flatMap((s) => [...s.byMonth.keys()]))].sort();
    if (months.length >= 2) {
      const [prev, last] = months.slice(-2);
      const rising = ranked
        .map(([item, s]) => ({ item, before: s.byMonth.get(prev) ?? 0, after: s.byMonth.get(last) ?? 0 }))
        .filter((x) => x.before > 0 && (x.after - x.before) / x.before >= RISING_MIN && !signals.some((g) => g.subject === x.item))
        .sort((a, b) => b.after - b.before - (a.after - a.before))
        .slice(0, 2);
      for (const x of rising) {
        signals.push({ id: `rising:${x.item}`, kind: "rising", group: "growth", subject: x.item, subjectColumn: itemColumn, columns: growthColumns, metrics: { before: Math.round(x.before), after: Math.round(x.after), change: (x.after - x.before) / x.before, from_month: prev, to_month: last } });
      }
    }
  }
  return signals;
}

/** Le « pourquoi » : chiffres du moteur, toujours rédigés par des règles. */
export function whyOf(s: Signal): string {
  const m = s.metrics;
  switch (s.kind) {
    case "loss_item":
      return `${eur.format(num(m.lost))} perdus sur la période (${pct.format(num(m.share_of_losses))} des pertes)${m.main_type ? `, dont ${pct.format(num(m.main_type_share))} en ${lower(String(m.main_type))}` : ""}.`;
    case "sell_but_lose":
      return `${eur.format(num(m.lost))} perdus pour ${eur.format(num(m.sales))} vendus, soit ${pct.format(num(m.loss_rate))} des ventes de l'article (motif principal : ${lower(String(m.main_type))}).`;
    case "loss_aisle":
      return `${eur.format(num(m.lost))} perdus, ${pct.format(num(m.share_of_losses))} de la démarque du magasin.`;
    case "loss_type":
      return `${eur.format(num(m.lost))}, soit ${pct.format(num(m.share_of_losses))} des pertes.`;
    case "top_seller":
      return `N°${m.rank} des ventes : ${eur.format(num(m.sales))} (${pct.format(num(m.share_of_sales))} du chiffre d'affaires)${m.margin_rate !== null ? `, marge ${pct.format(num(m.margin_rate))}` : ""}.`;
    case "high_margin":
      return `Marge ${pct.format(num(m.margin_rate))} contre ${pct.format(num(m.average_margin_rate))} en moyenne, pour ${eur.format(num(m.sales))} de ventes.`;
    case "rising":
      return `Ventes de ${eur.format(num(m.before))} à ${eur.format(num(m.after))} d'un mois sur l'autre (+${pct.format(num(m.change))}).`;
  }
}

/** Conseils rédigés par des règles métier (sans IA). */
export function ruleRecommendation(s: Signal): Pick<Recommendation, "title" | "action"> {
  const type = lower(String(s.metrics.main_type ?? ""));
  switch (s.kind) {
    case "loss_item":
      if (/p[ée]rim|dlc|dluo/.test(type)) return { title: `Réduire le périmé sur ${s.subject}`, action: "Ajuster les quantités commandées au rythme réel des ventes et passer les produits proches de la date en démarque anticipée (remise la veille, offre anti-gaspillage)." };
      if (/cass|ab[îi]m|d[ée]t[ée]rior/.test(type)) return { title: `Limiter la casse sur ${s.subject}`, action: "Vérifier le conditionnement, le rangement en rayon et la manipulation à la mise en rayon ; signaler les livraisons abîmées au fournisseur." };
      if (/don/.test(type)) return { title: `Commander au plus juste ${s.subject}`, action: "Les invendus partent en dons : réduire légèrement les commandes et les caler sur les ventes des dernières semaines." };
      if (/vol/.test(type)) return { title: `Protéger ${s.subject}`, action: "Rapprocher le produit des caisses ou d'une zone surveillée, ou l'équiper d'un antivol." };
      return { title: `Réduire les pertes sur ${s.subject}`, action: "Identifier la cause des pertes avec l'équipe du rayon et ajuster les commandes en conséquence." };
    case "sell_but_lose":
      return { title: `Ajuster les commandes de ${s.subject}`, action: "L'article se vend bien mais une part importante finit en perte : commander plus souvent, en plus petites quantités, plutôt qu'augmenter le stock." };
    case "loss_aisle":
      return { title: `Plan d'action pour le rayon ${s.subject}`, action: "Contrôle quotidien des dates, rotation des produits (premier entré, premier sorti) et commandes ajustées au rythme des ventes, suivis chaque semaine." };
    case "loss_type":
      return /p[ée]rim/.test(lower(s.subject))
        ? { title: "Le périmé est la première cause de perte", action: "Mettre en place une démarque anticipée systématique sur les produits frais et revoir la fréquence des commandes." }
        : { title: `${s.subject} : première cause de perte`, action: "Traiter cette cause en priorité avec les chefs de rayon : c'est là que l'effort rapportera le plus." };
    case "top_seller":
      return { title: `Sécuriser le stock de ${s.subject}`, action: "Article moteur : renforcer le stock de sécurité pour éviter la rupture et lui garder un emplacement bien visible en rayon." };
    case "high_margin":
      return { title: `Mettre en avant ${s.subject}`, action: "Marge supérieure à la moyenne : lui donner plus de visibilité (tête de gondole, facing élargi) et un stock ajusté pour en vendre davantage." };
    case "rising":
      return { title: `Accompagner la hausse de ${s.subject}`, action: "Les ventes progressent : augmenter les commandes pour suivre la demande sans tomber en rupture." };
  }
}

const AiRecommendationsSchema = z.object({
  recommendations: z.array(z.object({ id: z.string(), title: z.string(), action: z.string() })),
});

const SYSTEM_PROMPT = `Tu es le conseiller commerce d'un SaaS de tableaux de bord pour la distribution (supermarchés de proximité). Tes lecteurs sont des directeurs de magasin et de secteur : ils veulent des actions concrètes, à mener dès la semaine prochaine.

Tu reçois des signaux calculés par un moteur déterministe : articles, rayons ou motifs qui font perdre de l'argent (démarque : périmé, casse, dons, vol…), et articles qui performent (meilleures ventes, marge supérieure à la moyenne, ventes en hausse). Les articles et rayons sont remplacés par des jetons (ex. LIBELLE_ARTICLE_1a2b3c4d) : recopie-les à l'identique dans le titre, n'essaie jamais de deviner ce qu'ils cachent.

Pour chaque signal, écris :
- title : une action courte (8 mots maximum) qui commence par un verbe à l'infinitif et cite le jeton du sujet s'il y en a un ;
- action : une ou deux phrases concrètes et réalistes pour un magasin (commandes, démarque anticipée, anti-gaspillage, rotation des produits, rangement, mise en avant, stock de sécurité, facing, tête de gondole…), adaptées au motif et aux chiffres reçus.

Règles impératives : n'écris AUCUN chiffre, montant ni pourcentage (ils sont affichés à côté par le moteur) ; ne promets pas de résultat ; reste au conseil, sans jargon. Réponds pour chaque id reçu, dans le même ordre.`;

/** Recommandations : rédigées par l'IA en mode standard (données pseudonymisées), sinon par les règles. */
export async function recommend(input: {
  profile: DatasetProfile;
  rows: TypedRow[];
  shrinkage: ShrinkageReport | null | undefined;
  mode: AiMode;
  pseudo: Pseudonymizer;
  allowAi: boolean;
}): Promise<RecommendationsResult> {
  const none: AiUsage = { provider: "demo", model: null, inputTokens: null, outputTokens: null };
  const signals = computeSignals(input.profile, input.rows, input.shrinkage);
  const byRules = (s: Signal): Recommendation => ({ id: s.id, kind: s.kind, group: s.group, ...ruleRecommendation(s), why: whyOf(s), subject: s.subject, columns: s.columns });
  if (signals.length === 0) return { ...none, writtenBy: "rules", items: [], notes: [] };

  const provider = activeProvider();
  if (!input.allowAi || input.mode === "strict" || provider === "demo") return { ...none, writtenBy: "rules", items: signals.map(byRules), notes: [] };

  // Aller : sujets remplacés par des jetons (articles, rayons) ; motifs de perte et chiffres transmis tels quels.
  const token = (s: Signal) => (s.kind === "loss_type" ? s.subject : input.pseudo.tokenize(s.subjectColumn ?? "Libellé rayon", s.subject));
  const sent = signals.map((s, i) => ({ id: `s${i + 1}`, kind: s.kind, subject: token(s), metrics: { ...s.metrics, aisle: s.metrics.aisle ? input.pseudo.tokenize("Libellé rayon", String(s.metrics.aisle)) : null } }));
  try {
    const { output, ...usage } = await callClaude(provider, AiRecommendationsSchema, SYSTEM_PROMPT, `Voici les signaux, pseudonymisés. Rédige une recommandation par signal.\n\n<signaux>\n${JSON.stringify(sent)}\n</signaux>`);
    const written = new Map(output.recommendations.map((r) => [r.id, r]));
    const notes: string[] = [];
    const items = signals.map((s, i) => {
      const r = written.get(`s${i + 1}`);
      const clear = (text: string) => input.pseudo.reidentify(text);
      // Un chiffre écrit par l'IA, ou un jeton inconnu, et c'est la règle qui rédige : seuls les chiffres du moteur s'affichent.
      const digits = (text: string) => /\d/.test(text.replace(/\b[A-Z][A-Z0-9_]*_[0-9a-f]{8,12}\b/g, ""));
      if (!r || digits(r.title) || digits(r.action)) return byRules(s);
      const title = clear(r.title);
      const action = clear(r.action);
      if (title.unknownTokens.length > 0 || action.unknownTokens.length > 0) return byRules(s);
      return { id: s.id, kind: s.kind, group: s.group, title: title.text, action: action.text, why: whyOf(s), subject: s.subject, columns: s.columns };
    });
    return { ...usage, writtenBy: "ai", items, notes };
  } catch (error) {
    if (!(error instanceof AiError)) throw error;
    return { ...none, writtenBy: "rules", items: signals.map(byRules), notes: [`L'IA n'a pas pu rédiger les recommandations (${error.message}) : elles sont rédigées automatiquement.`] };
  }
}
