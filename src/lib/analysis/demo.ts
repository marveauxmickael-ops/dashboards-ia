import type { AnalysisContext } from "./context";
import type { Analysis, VariationExplanation } from "./schema";

// Explications sans appel à un modèle : utilisées en mode démonstration et en mode strict
// (où l'IA ne reçoit aucune valeur). Même format que la réponse de l'IA, mêmes vérifications.

const pct = (fraction: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(Math.abs(fraction) * 100);
const amount = (n: number, format: string) =>
  format === "currency"
    ? new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Math.abs(n))
    : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(Math.abs(n));

function periodPhrase(period: string, previous: string, comparison: string): string {
  if (comparison === "rolling_quarter") return `sur les trois derniers mois (${period}) par rapport aux trois précédents`;
  if (comparison === "same_period_last_year") return `en ${period} par rapport à ${previous}, un an plus tôt`;
  return `en ${period} par rapport à ${previous}`;
}

const HYPOTHESES: [RegExp, string][] = [
  [/commercial|vendeur|collaborateur/i, "Un changement dans l'activité d'un commercial (absence, portefeuille réaffecté, objectifs différents) pourrait expliquer une partie de l'écart."],
  [/client|compte|soci[ée]t[ée]/i, "Un client important pourrait avoir réduit, décalé ou réorienté ses commandes."],
  [/r[ée]gion|zone|secteur|ville|pays/i, "Un facteur local, comme l'arrivée d'un concurrent ou le départ d'un client, pourrait peser sur cette zone."],
  [/produit|cat[ée]gor|gamme|famille/i, "Une évolution des prix, une rupture de stock ou une baisse de la demande sur cette gamme pourrait être en cause."],
  [/canal/i, "Un changement d'habitude d'achat des clients entre les canaux pourrait jouer."],
];

const SUGGESTIONS: [RegExp, (c: string) => string][] = [
  [/commercial|vendeur|collaborateur/i, (c) => `Faire un point avec ${c} sur son portefeuille, ses rendez-vous à venir et les comptes à relancer.`],
  [/client|compte|soci[ée]t[ée]/i, (c) => `Planifier un rendez-vous avec ${c} pour comprendre l'évolution de ses besoins et sécuriser les prochaines commandes.`],
  [/r[ée]gion|zone|secteur|ville|pays/i, (c) => `Lister les comptes en recul en ${c} et lancer une action de relance ciblée sur les plus importants.`],
  [/produit|cat[ée]gor|gamme|famille/i, (c) => `Vérifier le prix, la disponibilité et l'argumentaire de vente de la gamme ${c}.`],
  [/canal/i, (c) => `Analyser pourquoi le canal ${c} recule et réorienter les clients concernés vers le canal le plus efficace.`],
];

export function buildDemoAnalysis(ctx: AnalysisContext): Analysis {
  return {
    explanations: ctx.variations.map((v): VariationExplanation => {
      const facts: VariationExplanation["facts"] = [];
      const verb = v.direction === "down" ? "recule" : "progresse";
      facts.push({
        text: `${v.measure} ${verb} de ${pct(v.change_pct)} % (${v.direction === "down" ? "−" : "+"}${amount(v.delta, v.format)}) ${periodPhrase(v.period, v.previous_period, v.comparison)}.`,
        citations: [
          { dimension: null, category: null, field: "change_pct", value: v.change_pct },
          { dimension: null, category: null, field: "delta", value: v.delta },
        ],
      });

      const main = v.drivers.find((d) => d.items.length > 0);
      const top = main?.items[0];
      if (main && top) {
        facts.push({
          text: `${main.dimension} : ${top.category} explique ${pct(Math.min(top.share, 1))} % de la ${v.direction === "down" ? "baisse" : "hausse"} (${v.direction === "down" ? "−" : "+"}${amount(top.delta, v.format)}).`,
          citations: [
            { dimension: main.dimension, category: top.category, field: "share", value: Math.min(top.share, 1) },
            { dimension: main.dimension, category: top.category, field: "delta", value: top.delta },
          ],
        });
      }

      const counter = v.drivers.flatMap((d) => d.opposite.map((o) => ({ d, o }))).find(({ o }) => o.change_pct !== null);
      if (counter && counter.o.change_pct !== null) {
        facts.push({
          text: `À contre-courant, ${counter.o.category} (${counter.d.dimension}) ${counter.o.delta < 0 ? "recule" : "progresse"} de ${pct(counter.o.change_pct)} %.`,
          citations: [{ dimension: counter.d.dimension, category: counter.o.category, field: "change_pct", value: counter.o.change_pct }],
        });
      }

      const hypotheses: string[] = [];
      if (main) hypotheses.push(HYPOTHESES.find(([re]) => re.test(main.dimension))?.[1] ?? "Un facteur propre à ce segment pourrait expliquer l'essentiel de l'écart.");
      if (v.comparison === "previous_period") hypotheses.push("Un effet saisonnier pourrait jouer : comparez avec la même période de l'année précédente.");

      // Suggestions : pour une baisse, sur le segment principal ; pour une hausse, sur un segment en recul.
      const suggestions: VariationExplanation["suggestions"] = [];
      const target =
        v.direction === "down" && main && top
          ? { dimension: main.dimension, category: top.category, factIndex: 1 }
          : counter && counter.o.delta < 0
            ? { dimension: counter.d.dimension, category: counter.o.category, factIndex: facts.length - 1 }
            : null;
      if (target) {
        const make = SUGGESTIONS.find(([re]) => re.test(target.dimension))?.[1];
        if (make) suggestions.push({ text: make(target.category), fact_index: target.factIndex });
        if (/additionnel|compl[ée]mentaire|service/i.test(v.measure)) {
          suggestions.push({ text: "Rappeler à l'équipe de proposer systématiquement les services additionnels (garantie, installation, maintenance) à chaque commande.", fact_index: 0 });
        }
        suggestions.push({ text: "Fixer un objectif de rattrapage chiffré pour la période suivante et suivre son avancement chaque semaine.", fact_index: 0 });
      }
      return { variation_id: v.id, facts, hypotheses, suggestions };
    }),
  };
}
