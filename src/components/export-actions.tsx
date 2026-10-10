"use client";

import type { DashboardResult } from "@/lib/pipeline";
import { encodeView, isDefaultView, type ViewState } from "@/lib/view";

// Téléchargement du dashboard (US-09). Le PDF passe par l'impression du navigateur
// (« Enregistrer au format PDF ») avec une mise en page dédiée ; Excel et CSV sont produits par le serveur.
// Les exports reprennent la sélection de l'affichage (éléments cochés).
// Excel et CSV portent sur le dashboard enregistré (non filtré) : `base` sert à traduire la sélection.
export function ExportActions({ dashboardId, view, base }: { dashboardId?: string | null; view?: ViewState; base?: DashboardResult }) {
  const vue = view && base && !isDefaultView(view) ? `&vue=${encodeView(view, base)}` : "";
  const link = "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800";
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden" role="group" aria-label="Télécharger le dashboard">
      <span className="text-sm text-slate-600">Télécharger :</span>
      <button type="button" onClick={() => window.print()} className={link} title="Choisissez « Enregistrer au format PDF » comme imprimante">
        PDF
      </button>
      {dashboardId && (
        <>
          <a href={`/api/dashboards/${dashboardId}/export?format=xlsx${vue}`} className={link} download>
            Excel
          </a>
          <a href={`/api/dashboards/${dashboardId}/export?format=csv${vue}`} className={link} download>
            CSV
          </a>
        </>
      )}
    </div>
  );
}
