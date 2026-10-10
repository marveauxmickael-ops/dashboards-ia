"use client";

import type { DashboardResult } from "@/lib/pipeline";
import type { AiTreatment } from "@/lib/types";

const TREATMENT: Record<AiTreatment, { label: string; className: string }> = {
  send: { label: "Transmise", className: "bg-slate-100 text-slate-700" },
  tokenize: { label: "Jetons", className: "bg-teal-50 text-teal-800" },
  drop: { label: "Supprimée", className: "bg-red-50 text-red-800" },
  block: { label: "Bloquée (RGPD)", className: "bg-red-100 text-red-900" },
  exclude: { label: "Exclue", className: "bg-amber-50 text-amber-800" },
};

const TYPE_LABEL: Record<string, string> = {
  date: "Date",
  number: "Nombre",
  email: "Email",
  phone: "Téléphone",
  iban: "IBAN",
  category: "Catégorie",
  text: "Texte libre",
};

export function PrivacyPanel({ result }: { result: DashboardResult }) {
  const { profile, aiContext, ai } = result;
  return (
    <section aria-label="Données et confidentialité" className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 print:hidden">
      <div>
        <h3 className="text-base font-semibold text-slate-900">Ce que l&apos;IA a vu</h3>
        <p className="mt-1 text-sm text-slate-600">
          {ai.provider === "anthropic"
            ? `Conçu par Claude (${ai.model}) à partir de données pseudonymisées.`
            : "Mode démonstration : conçu sans appel à l'IA, à partir du même contexte pseudonymisé."}{" "}
          {aiContext.mode === "strict"
            ? "Mode strict : seuls les noms et types de colonnes ont été transmis."
            : `${result.tokensUsed} valeur(s) identifiante(s) remplacée(s) par des jetons, ré-identifiées sur le serveur avant affichage.`}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-3 font-medium">Colonne</th>
              <th className="py-2 pr-3 font-medium">Type</th>
              <th className="py-2 pr-3 font-medium">Envoi à l&apos;IA</th>
              <th className="py-2 font-medium">Pourquoi</th>
            </tr>
          </thead>
          <tbody>
            {profile.columns.map((c) => (
              <tr key={c.name} className="border-b border-slate-100 last:border-0">
                <td className="py-2 pr-3 font-medium text-slate-900">{c.name}</td>
                <td className="py-2 pr-3 text-slate-600">{TYPE_LABEL[c.type]}</td>
                <td className="py-2 pr-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TREATMENT[c.treatment].className}`}>{TREATMENT[c.treatment].label}</span>
                </td>
                <td className="py-2 text-slate-600">{c.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {profile.warnings.length > 0 && (
        <ul className="list-disc rounded-lg bg-amber-50 py-2 pl-8 pr-3 text-sm text-amber-900">
          {profile.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer font-medium text-teal-800">Afficher la requête exacte envoyée à l&apos;IA</summary>
        <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-100">
          {JSON.stringify(aiContext, null, 2)}
        </pre>
      </details>
    </section>
  );
}
