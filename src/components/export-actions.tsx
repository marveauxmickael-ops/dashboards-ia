"use client";

import type { DashboardResult } from "@/lib/pipeline";
import { encodeView, isDefaultView, type ViewState } from "@/lib/view";

// Téléchargement du dashboard (US-09). Le PDF passe par l'impression du navigateur
// (« Enregistrer au format PDF ») avec une mise en page dédiée ; Excel et CSV sont produits par le serveur.
// Les exports reprennent la sélection de l'affichage (éléments cochés).
// Excel et CSV portent sur le dashboard enregistré (non filtré) : `base` sert à traduire la sélection.
export function ExportActions({
  dashboardId,
  view,
  base,
  onPrintOnePage,
  onPrintContinuous,
}: {
  dashboardId?: string | null;
  view?: ViewState;
  base?: DashboardResult;
  /** PDF réduit pour tenir sur une seule page A4 paysage. */
  onPrintOnePage?: () => void;
  /** PDF d'une seule page continue, aux dimensions du dashboard : défilement vertical et horizontal. */
  onPrintContinuous?: () => void;
}) {
  const vue = view && base && !isDefaultView(view) ? `&vue=${encodeView(view, base)}` : "";
  const link = "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-800";
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden" role="group" aria-label="Télécharger le dashboard">
      <span className="text-sm text-slate-600">Télécharger :</span>
      <button type="button" onClick={() => window.print()} className={link} title="Choisissez « Enregistrer au format PDF » comme imprimante">
        PDF (pages A4)
      </button>
      {onPrintContinuous && (
        <button type="button" onClick={onPrintContinuous} className={link} title="Une seule page sans coupure, à faire défiler de haut en bas et de gauche à droite">
          PDF continu
        </button>
      )}
      {onPrintOnePage && (
        <button type="button" onClick={onPrintOnePage} className={link} title="Tout le dashboard sur une seule page A4 paysage">
          PDF une page A4
        </button>
      )}
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
