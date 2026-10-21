"use client";

import { useSyncExternalStore } from "react";
import type { Recommendation, RecommendationGroup, RecommendationsResult } from "@/lib/recommendations/types";

const GROUPS: { id: RecommendationGroup; title: string; tone: string; dot: string }[] = [
  { id: "losses", title: "Réduire les pertes", tone: "text-red-800", dot: "bg-red-400" },
  { id: "growth", title: "Développer ce qui marche", tone: "text-success-strong", dot: "bg-emerald-500" },
];

function Card({ r, dot }: { r: Recommendation; dot: string }) {
  return (
    <li className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${dot}`} />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-semibold text-slate-900">{r.title}</p>
        <p className="text-sm text-slate-700">{r.action}</p>
        <p className="text-xs text-slate-500">
          <span className="font-medium text-slate-600">Pourquoi : </span>
          {r.why}
        </p>
      </div>
    </li>
  );
}

/**
 * Recommandations (US-19) : pistes d'action pour réduire les pertes et développer ce qui marche. Les chiffres
 * (« Pourquoi ») viennent du moteur ; le conseil est rédigé par l'IA ou par des règles métier, et reste à valider.
 */
// Bloc réduit ou déplié : choix de chaque personne (administrateur, éditeur ou lecteur), mémorisé dans son navigateur
// pour tous ses dashboards. Il ne modifie pas l'affichage enregistré avec le dashboard, que voient les autres.
const COLLAPSED_KEY = "lisio:recommandations-reduites";
const listeners = new Set<() => void>();

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean) {
  try {
    if (value) window.localStorage.setItem(COLLAPSED_KEY, "1");
    else window.localStorage.removeItem(COLLAPSED_KEY);
  } catch {
    // Stockage indisponible : le choix vaut pour la page en cours.
    fallback = value;
  }
  listeners.forEach((l) => l());
}

let fallback: boolean | null = null;
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function RecommendationsPanel({ result, hidden = [], compact }: { result: RecommendationsResult; hidden?: RecommendationGroup[]; compact: boolean }) {
  const collapsed = useSyncExternalStore(subscribe, () => fallback ?? readCollapsed(), () => false);
  const groups = GROUPS.map((g) => ({ ...g, items: result.items.filter((r) => r.group === g.id) })).filter((g) => g.items.length > 0 && !hidden.includes(g.id));
  if (groups.length === 0) return null;
  const toggle = (
    <button
      type="button"
      aria-expanded={!collapsed}
      aria-controls="recommandations-contenu"
      onClick={() => writeCollapsed(!collapsed)}
      className="inline-flex items-center gap-1 rounded-lg border border-accent-200 bg-white px-2.5 py-1 text-xs font-medium text-accent-900 hover:bg-accent-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-800 print:hidden"
    >
      {collapsed ? "Afficher" : "Réduire"}
      <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" className={`transition-transform ${collapsed ? "" : "rotate-180"}`}>
        <path fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );

  // Réduit : une seule ligne, le nombre de pistes par groupe ; les ampoules restent sur les graphiques.
  if (collapsed) {
    return (
      <section aria-label="Recommandations" className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-card)] border border-accent-200 bg-accent-50/40 px-3 py-2 print:hidden">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-accent-800">Recommandations</span>
          {groups.map((g) => (
            <span key={g.id} className="inline-flex items-center gap-1.5 text-slate-700">
              <span aria-hidden="true" className={`size-2 rounded-full ${g.dot}`} />
              {g.items.length} pour « {g.title.charAt(0).toLowerCase() + g.title.slice(1)} »
            </span>
          ))}
        </p>
        {toggle}
      </section>
    );
  }

  return (
    <section aria-label="Recommandations" className={`flex flex-col rounded-[var(--radius-card)] border border-accent-200 bg-accent-50/40 shadow-card print:break-inside-avoid print:shadow-none ${compact ? "gap-3 p-3" : "gap-4 p-4"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={`font-semibold uppercase tracking-wide text-accent-800 ${compact ? "text-xs" : "text-sm"}`}>Recommandations</h3>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-slate-500">Pistes à valider avec vos équipes · chiffres calculés par le moteur</p>
          {toggle}
        </div>
      </div>
      <div id="recommandations-contenu" className={`grid grid-cols-1 gap-4 ${groups.length === 2 ? "lg:grid-cols-2" : ""}`}>
        {groups.map((g) => (
          <div key={g.id} className="flex flex-col gap-2">
            <h4 className={`text-xs font-semibold uppercase tracking-wide ${g.tone}`}>{g.title}</h4>
            <ul className="flex flex-col gap-2">
              {g.items.map((r) => (
                <Card key={r.id} r={r} dot={g.dot} />
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        {result.writtenBy === "ai"
          ? "Conseils rédigés par l'IA à partir de données pseudonymisées (articles et rayons remplacés par des jetons) ; l'IA n'écrit aucun chiffre."
          : "Conseils rédigés automatiquement par des règles métier, sans IA."}
        {result.notes.length > 0 && ` ${result.notes.join(" ")}`}
      </p>
    </section>
  );
}
