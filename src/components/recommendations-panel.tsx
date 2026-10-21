"use client";

import { useCollapsed } from "@/hooks/use-collapsed";
import { CollapseToggle } from "./ui/collapse-toggle";
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
export function RecommendationsPanel({ result, hidden = [], compact }: { result: RecommendationsResult; hidden?: RecommendationGroup[]; compact: boolean }) {
  const [collapsed, setCollapsed] = useCollapsed("lisio:recommandations-reduites");
  const groups = GROUPS.map((g) => ({ ...g, items: result.items.filter((r) => r.group === g.id) })).filter((g) => g.items.length > 0 && !hidden.includes(g.id));
  if (groups.length === 0) return null;
  const toggle = <CollapseToggle collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} controls="recommandations-contenu" />;

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
