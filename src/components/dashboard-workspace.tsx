"use client";

import { useState } from "react";
import { isFiltered, NO_FILTERS, type Filters } from "@/lib/filters";
import type { Branding } from "@/lib/branding";
import type { DashboardResult } from "@/lib/pipeline";
import type { QuestionAnswer } from "@/lib/questions";
import type { ViewState } from "@/lib/view";
import { DashboardView, type SaveView } from "./dashboard-view";
import { LossToggle } from "./loss-toggle";
import { lossesOnly, lossPreset, withLossesOnly } from "@/lib/losses";
import { FiltersBar } from "./filters-bar";
import { MergePanel } from "./merge-panel";
import { QuestionPanel } from "./question-panel";
import { downloadCleanedOnServer, type DownloadCleaned } from "./quality-panel";

export type AskQuestion = (input: { file: File; previous: DashboardResult; question: string; dashboardId?: string | null }) => Promise<{ ok: true; answer: QuestionAnswer } | { ok: false; message: string }>;

/** Question par défaut : API du serveur (le dashboard doit être enregistré). */
export const askOnServer: AskQuestion = async ({ file, question, dashboardId }) => {
  if (!dashboardId) return { ok: false, message: "Le dashboard doit être enregistré pour poser une question." };
  const body = new FormData();
  body.append("file", file);
  body.append("question", question);
  try {
    const response = await fetch(`/api/dashboards/${dashboardId}/question`, { method: "POST", body });
    const json = await response.json();
    return response.ok ? { ok: true, answer: json.answer as QuestionAnswer } : { ok: false, message: json.error ?? "La question n'a pas pu être traitée." };
  } catch {
    return { ok: false, message: "Le serveur ne répond pas. Vérifiez votre connexion et réessayez." };
  }
};

export type RecomputeAction = "filter" | "reimport";
export type RecomputeOutcome = { ok: true; result: DashboardResult } | { ok: false; message: string };
export type Recompute = (input: { file: File; previous: DashboardResult; filters: Filters; action: RecomputeAction; dashboardId?: string | null }) => Promise<RecomputeOutcome>;

/** Recalcul par défaut : API du serveur (le dashboard doit être enregistré). */
export const recomputeOnServer: Recompute = async ({ file, filters, action, dashboardId }) => {
  if (!dashboardId) return { ok: false, message: "Le dashboard doit être enregistré pour être filtré." };
  const body = new FormData();
  body.append("file", file);
  body.append("action", action);
  body.append("filters", JSON.stringify(filters));
  try {
    const response = await fetch(`/api/dashboards/${dashboardId}/recompute`, { method: "POST", body });
    const json = await response.json();
    return response.ok ? { ok: true, result: json.result as DashboardResult } : { ok: false, message: json.error ?? "Le recalcul a échoué." };
  } catch {
    return { ok: false, message: "Le serveur ne répond pas. Vérifiez votre connexion et réessayez." };
  }
};

/**
 * Dashboard et outils de travail sur le fichier source : filtres interactifs et mise à jour (US-08).
 * Le fichier source reste dans la mémoire du navigateur le temps de la session ; il n'est jamais conservé
 * par le serveur, qui le lit pour chaque calcul puis l'oublie.
 */
export function DashboardWorkspace({
  initial,
  dashboardId,
  exportable = true,
  canReimport = false,
  initialFile = null,
  recompute = recomputeOnServer,
  reloadAfterReimport = false,
  tools = true,
  branding,
  ask = askOnServer,
  aiAvailable = true,
  downloadCleaned = downloadCleanedOnServer,
  savedView,
  saveView,
  fixedView,
  habitualApplied,
  refreshedAt,
}: {
  initial: DashboardResult;
  dashboardId?: string | null;
  exportable?: boolean;
  canReimport?: boolean;
  initialFile?: File | null;
  recompute?: Recompute;
  /** Recharge la page après une mise à jour (historique et date d'actualisation à jour). */
  reloadAfterReimport?: boolean;
  /** false : consultation seule (version précédente, lien partagé), sans fichier source ni filtres. */
  tools?: boolean;
  branding?: Branding;
  /** Questions en langage naturel (US-07) ; la démo navigateur répond localement. */
  ask?: AskQuestion;
  aiAvailable?: boolean;
  /** Fichier corrigé (US-11) : les corrections du dashboard appliquées au fichier chargé. */
  downloadCleaned?: DownloadCleaned;
  /** Affichage enregistré avec le dashboard et son enregistrement (éditeurs). */
  savedView?: ViewState;
  saveView?: SaveView;
  /** Affichage imposé par l'éditeur (lecteurs, lien de partage). */
  fixedView?: ViewState;
  /** Nouveau dashboard : affichage habituel de l'utilisateur appliqué (US-13). */
  habitualApplied?: boolean;
  /** Date de la version en cours, rappelée lors d'un ajout de données (US-12). */
  refreshedAt?: string;
}) {
  const [base, setBase] = useState(initial);
  const [shown, setShown] = useState(initial);
  const [file, setFile] = useState<File | null>(initialFile);
  const [busy, setBusy] = useState<RecomputeAction | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [merging, setMerging] = useState(false);
  const supported = tools && !!base.spec && !!base.filterOptions;

  async function run(action: RecomputeAction, filters: Filters, source = file) {
    if (!source) return;
    // Retirer les filtres : retour au dashboard enregistré, sans recalcul.
    if (action === "filter" && !isFiltered(filters)) {
      setShown(base);
      setMessage(null);
      return;
    }
    setBusy(action);
    setMessage(null);
    const outcome = await recompute({ file: source, previous: base, filters, action, dashboardId });
    setBusy(null);
    if (!outcome.ok) {
      setMessage({ tone: "error", text: outcome.message });
      return;
    }
    if (action === "reimport") {
      if (reloadAfterReimport) {
        window.location.reload();
        return;
      }
      setBase(outcome.result);
      setMessage({ tone: "success", text: `Dashboard mis à jour avec ${outcome.result.fileName} (${outcome.result.profile.rowCount.toLocaleString("fr-FR")} lignes).` });
    }
    setShown(outcome.result);
  }

  // Journal de démarque reconnu : bascule « pertes uniquement », filtre prêt à l'emploi.
  const losses = supported && file ? lossPreset(base.filterOptions) : null;

  return (
    <DashboardView result={shown} base={base} dashboardId={dashboardId} exportable={exportable} branding={branding} savedView={savedView} saveView={saveView} fixedView={fixedView} habitualApplied={habitualApplied}>
      {losses && (
        <LossToggle
          preset={losses}
          on={lossesOnly(shown.filters, losses)}
          busy={busy === "filter"}
          onChange={(on) => void run("filter", withLossesOnly(shown.filters ?? NO_FILTERS, losses, on))}
        />
      )}
      {supported && (
        <section aria-label="Fichier source" className="flex flex-col gap-2 rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm print:hidden">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-medium text-slate-800">Fichier source :</span>
            {file ? <span className="text-slate-700">{file.name}</span> : <span className="text-slate-500">non chargé</span>}
            <label className="cursor-pointer rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-50">
              {file ? "Changer de fichier" : "Charger le fichier"}
              <input
                type="file"
                accept=".csv,.xlsx,.xls,.pdf"
                className="sr-only"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setMessage(null);
                }}
              />
            </label>
            {file && canReimport && dashboardId && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => {
                  if (window.confirm(`Remplacer les données de ce dashboard par « ${file.name} » ? Les chiffres enregistrés seront remplacés ; pour compléter la période, utilisez plutôt « Ajouter des données ».`)) void run("reimport", NO_FILTERS);
                }}
                className="rounded-lg bg-slate-800 px-3 py-1.5 font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
              >
                {busy === "reimport" ? "Remplacement…" : "Remplacer les données par ce fichier"}
              </button>
            )}
            {canReimport && dashboardId && !merging && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => {
                  setMerging(true);
                  setMessage(null);
                }}
                className="rounded-lg border border-brand-800 bg-white px-3 py-1.5 font-semibold text-brand-900 hover:bg-brand-50 disabled:opacity-50"
              >
                Ajouter des données
              </button>
            )}
            {file && base.cleaning && (
              <button
                type="button"
                onClick={() => {
                  void downloadCleaned(file, base.cleaning!.plan).then((outcome) => {
                    if (!outcome.ok) setMessage({ tone: "error", text: outcome.message });
                  });
                }}
                className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-50"
              >
                Télécharger le fichier corrigé (CSV)
              </button>
            )}
          </div>
          <p className="text-xs text-slate-500">
            {file
              ? `Le fichier est lu pour chaque calcul puis oublié : il n'est jamais conservé. Les filtres n'appellent pas l'IA.${base.cleaning ? " Les corrections du contrôle qualité sont réappliquées à chaque calcul." : ""}`
              : "Pour filtrer le dashboard ou remplacer ses données, chargez le fichier source ; pour compléter la période, utilisez « Ajouter des données ». Les fichiers ne sont jamais conservés."}
          </p>
          {merging && dashboardId && (
            <MergePanel
              dashboardId={dashboardId}
              currentName={base.fileName}
              refreshedAt={refreshedAt}
              loadedFile={file}
              onCancel={() => setMerging(false)}
              onDone={(result, text) => {
                setMerging(false);
                if (reloadAfterReimport) {
                  window.location.reload();
                  return;
                }
                setBase(result);
                setShown(result);
                setFile(null);
                setMessage({ tone: "success", text });
              }}
            />
          )}
          {message && (
            <p role={message.tone === "error" ? "alert" : "status"} className={message.tone === "error" ? "text-red-800" : "text-emerald-800"}>
              {message.text}
            </p>
          )}
        </section>
      )}
      {supported && file && base.filterOptions && (
        <QuestionPanel ask={(question) => ask({ file, previous: base, question, dashboardId })} branding={branding} aiAvailable={aiAvailable} />
      )}
      {supported && file && base.filterOptions && (
        <FiltersBar key={`${base.fileName}${base.profile.rowCount}${JSON.stringify(shown.filters ?? null)}`} options={base.filterOptions} applied={shown.filters ?? NO_FILTERS} busy={busy === "filter"} onApply={(f) => void run("filter", f)} />
      )}
    </DashboardView>
  );
}
