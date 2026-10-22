// Contenu commercial partagé par la page Tarifs et la plaquette : offres, prix et arguments.
// Uniquement des fonctionnalités réelles de Lisio ; prix hors taxes, par mois.

export interface Plan {
  id: string;
  name: string;
  price: string;
  unit: string;
  audience: string;
  highlighted?: boolean;
  features: string[];
}

export const PLANS: Plan[] = [
  {
    id: "magasin",
    name: "Magasin",
    price: "299 €",
    unit: "HT / mois",
    audience: "Un point de vente qui veut piloter son chiffre et sa démarque.",
    features: [
      "1 site",
      "3 éditeurs, lecteurs illimités",
      "Démarque en perte de chiffre et articles à surveiller",
      "Recommandations pour réduire les pertes et développer les ventes",
      "Dashboards illimités, multi-fichiers, partage sécurisé et exports",
      "IA hébergée en Europe (bientôt)",
    ],
  },
  {
    id: "enseigne",
    name: "Enseigne",
    price: "Sur devis",
    unit: "à partir de 15 sites",
    audience: "Une enseigne ou un groupe multi-sites.",
    highlighted: true,
    features: [
      "Tout le Magasin, sur plusieurs sites",
      "Éditeurs illimités, comparaison des magasins",
      "Accompagnement dédié et formation des équipes",
      "Contrat de sous-traitance (DPA) dédié",
      "Connexion automatique aux exports de caisse (bientôt)",
      "Authentification unique, SSO (bientôt)",
      "Engagement de service, SLA (bientôt)",
    ],
  },
];

export const OPTIONS = [
  { title: "Mise en service", text: "490 € HT une fois (offerte en annuel) : paramétrage avec vos propres exports, formation de l'équipe." },
  { title: "Engagement annuel", text: "−15 % sur l'abonnement, mise en service offerte." },
  { title: "Programme pilote", text: "3 mois à demi-tarif pour les premiers clients, en échange d'un retour d'expérience chiffré." },
];

/** « Vos données protégées » : texte validé, repris tel quel dans la page Tarifs et la plaquette. */
export const PROTECTION_TITLE = "Vos données protégées";
export const PROTECTION = [
  { lead: "Pseudonymisées avant l’IA", text: "les noms de clients, d’articles, de marques et de rayons sont remplacés par des jetons. L’IA ne voit jamais vos informations en clair." },
  { lead: "Chiffres calculés et vérifiés", text: "chaque indicateur est calculé par le moteur de Lisio sur vos données, jamais inventé par l’IA." },
  { lead: "Fichiers jamais conservés", text: "vos fichiers sont lus pour le calcul puis oubliés." },
  { lead: "Accès maîtrisé", text: "chaque organisation ne voit que ses dashboards, avec la double authentification et des liens de partage sécurisés." },
];

export const BROCHURE_URL = "/plaquette-lisio.pdf";
