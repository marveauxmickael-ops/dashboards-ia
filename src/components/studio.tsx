"use client";

import { useState } from "react";
import type { Branding } from "@/lib/branding";
import type { DashboardResult } from "@/lib/pipeline";
import { EMPTY_PLAN, isEmptyPlan, type CleaningPlan, type QualityReport } from "@/lib/quality";
import type { AiMode } from "@/lib/types";
import type { ViewState } from "@/lib/view";
import type { SaveView } from "./dashboard-view";
import { DashboardWorkspace, recomputeOnServer, type AskQuestion, type Recompute } from "./dashboard-workspace";
import { PrivacyPanel } from "./privacy-panel";
import { AIProcessing } from "./animations/ai-processing";
import { Button } from "./ui/button";
import { FileUpload } from "./ui/file-upload";
import { CombineSummaryPanel, combineOnServer, type CombineFiles } from "./combine-summary";
import type { CombineSummary, LinkChoice } from "@/lib/combine";
import { analyzeOnServer, downloadCleanedOnServer, QualityPanel, type AnalyzeQuality, type DownloadCleaned } from "./quality-panel";

type Quality = { status: "idle" } | { status: "loading" } | { status: "ready"; report: QualityReport } | { status: "error"; message: string };

type State = { status: "idle" } | { status: "loading"; fileName: string } | { status: "error"; message: string } | { status: "done"; result: DashboardResult; dashboardId?: string; display?: ViewState | null; habitualApplied?: boolean };

/** Résultat d'une génération : le dashboard, ou un message d'erreur à afficher. */
/** `dashboardId` est présent quand le dashboard a été enregistré dans l'organisation. */
export type GenerateOutcome =
  | { ok: true; result: DashboardResult; dashboardId?: string; display?: ViewState | null; habitualApplied?: boolean }
  | { ok: false; message: string };

/** Génération par défaut : envoi du fichier à l'API du serveur. */
async function generateOnServer(file: File, mode: AiMode, cleaning?: CleaningPlan, compareBy?: string | null): Promise<GenerateOutcome> {
  const body = new FormData();
  body.append("file", file);
  body.append("mode", mode);
  if (compareBy) body.append("compareBy", compareBy);
  if (cleaning) body.append("cleaning", JSON.stringify(cleaning));
  try {
    const response = await fetch("/api/dashboard", { method: "POST", body });
    const json = await response.json();
    return response.ok ? { ok: true, result: json.result as DashboardResult, dashboardId: json.dashboardId, display: json.display, habitualApplied: json.habitualApplied } : { ok: false, message: json.error ?? "La génération a échoué." };
  } catch {
    return { ok: false, message: "Le serveur ne répond pas. Vérifiez votre connexion et réessayez." };
  }
}

export function Studio({
  generateDashboard = generateOnServer,
  demoFileUrl = "/demo/ventes-demo.csv",
  demoShrinkageUrls = ["/demo/multi/ventes-septembre-2026-bastille.csv", "/demo/multi/demarque-septembre-2026-bastille.csv"],
  exportable = true,
  recompute = recomputeOnServer,
  branding,
  ask,
  aiAvailable,
  analyzeQuality = analyzeOnServer,
  downloadCleaned = downloadCleanedOnServer,
  saveView,
  combineFiles = combineOnServer,
}: {
  generateDashboard?: (file: File, mode: AiMode, cleaning?: CleaningPlan, compareBy?: string | null) => Promise<GenerateOutcome>;
  /** Regroupement de plusieurs fichiers (US-16) ; la démo navigateur le fait localement. */
  combineFiles?: CombineFiles;
  demoFileUrl?: string;
  /** Exemple « ventes + démarque » : fichiers fictifs reliés par le code article. */
  demoShrinkageUrls?: string[];
  /** Affiche les boutons de téléchargement (désactivé dans la démo navigateur). */
  exportable?: boolean;
  /** Recalcul (filtres, mise à jour) ; la démo navigateur le fait localement. */
  recompute?: Recompute;
  /** Charte graphique de l'organisation (logo, couleurs). */
  branding?: Branding;
  ask?: AskQuestion;
  aiAvailable?: boolean;
  /** Contrôle qualité du fichier (US-11) ; la démo navigateur le fait localement. */
  analyzeQuality?: AnalyzeQuality;
  downloadCleaned?: DownloadCleaned;
  /** Enregistrement de l'affichage avec le dashboard et des réglages habituels (US-13). */
  saveView?: (dashboardId: string, ...args: Parameters<SaveView>) => ReturnType<SaveView>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [selected, setSelected] = useState<File[]>([]);
  // Plusieurs fichiers : regroupés en un seul (US-16), avec leur récapitulatif.
  const [combined, setCombined] = useState<{ status: "idle" } | { status: "loading"; count: number } | { status: "ready"; summary: CombineSummary } | { status: "error"; message: string }>({ status: "idle" });
  const [mode, setMode] = useState<AiMode>("standard");
  const [state, setState] = useState<State>({ status: "idle" });
  const [quality, setQuality] = useState<Quality>({ status: "idle" });
  const [plan, setPlan] = useState<CleaningPlan>(EMPTY_PLAN);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function generate(selected: File, corrections: CleaningPlan = plan, compareBy: string | null = combined.status === "ready" ? combined.summary.column : null) {
    setState({ status: "loading", fileName: selected.name });
    const outcome = await generateDashboard(selected, mode, isEmptyPlan(corrections) ? undefined : corrections, compareBy);
    setState(outcome.ok ? { status: "done", result: outcome.result, dashboardId: outcome.dashboardId, display: outcome.display, habitualApplied: outcome.habitualApplied } : { status: "error", message: outcome.message });
  }

  // Contrôle qualité dès le choix du fichier : propositions de corrections, rien n'est appliqué d'office.
  async function select(selected: File | null) {
    setFile(selected);
    setPlan(EMPTY_PLAN);
    setDownloadError(null);
    if (!selected) {
      setQuality({ status: "idle" });
      return null;
    }
    setQuality({ status: "loading" });
    const outcome = await analyzeQuality(selected);
    setQuality(outcome.ok ? { status: "ready", report: outcome.report } : { status: "error", message: outcome.message });
    return outcome.ok ? outcome.report : null;
  }

  // Un fichier : contrôle qualité direct. Plusieurs : regroupement d'abord, puis contrôle qualité du fichier regroupé.
  async function choose(files: File[], link: LinkChoice | null = null) {
    setSelected(files);
    setState({ status: "idle" });
    if (files.length <= 1) {
      setCombined({ status: "idle" });
      await select(files[0] ?? null);
      return;
    }
    setCombined({ status: "loading", count: files.length });
    await select(null);
    const outcome = await combineFiles(files, { link });
    if (!outcome.ok) {
      setCombined({ status: "error", message: outcome.message });
      return;
    }
    setCombined({ status: "ready", summary: outcome.summary });
    await select(outcome.file);
  }

  async function loadDemo() {
    setSelected([]);
    setCombined({ status: "idle" });
    const response = await fetch(demoFileUrl);
    const demo = new File([await response.blob()], "ventes-demo.csv", { type: "text/csv" });
    // Fichier sans anomalie (ou contrôle indisponible) : génération directe ; sinon, les propositions d'abord.
    const report = await select(demo);
    if (!report || report.issueCount === 0) await generate(demo, EMPTY_PLAN);
  }

  // Exemple « ventes + démarque » (US-15, US-18) : deux fichiers fictifs reliés par le code article, générés d'un clic.
  async function loadShrinkageDemo() {
    setState({ status: "idle" });
    const files = await Promise.all(
      demoShrinkageUrls.map(async (url) => new File([await (await fetch(url)).blob()], url.split("/").pop() ?? "demo.csv", { type: "text/csv" })),
    );
    setSelected(files);
    setCombined({ status: "loading", count: files.length });
    await select(null);
    const outcome = await combineFiles(files);
    if (!outcome.ok) {
      setCombined({ status: "error", message: outcome.message });
      return;
    }
    setCombined({ status: "ready", summary: outcome.summary });
    await select(outcome.file);
    await generate(outcome.file, EMPTY_PLAN, outcome.summary.column);
  }

  async function download() {
    if (!file) return;
    setDownloading(true);
    setDownloadError(null);
    const outcome = await downloadCleaned(file, plan);
    setDownloading(false);
    if (!outcome.ok) setDownloadError(outcome.message);
  }

  const loading = state.status === "loading";
  const withCorrections = !isEmptyPlan(plan);

  return (
    <div className="flex flex-col gap-8">
      <form
        className="flex flex-col gap-6 rounded-[var(--radius-card)] border border-slate-200 bg-white p-5 shadow-card sm:p-8 print:hidden"
        onSubmit={(e) => {
          e.preventDefault();
          if (file) void generate(file);
        }}
      >
        <FileUpload id="file" files={selected.length > 0 ? selected : file ? [file] : []} disabled={loading || combined.status === "loading"} onChange={(f) => void choose(f)} />

        <div className="flex flex-col items-center gap-3">
          <Button type="submit" disabled={!file || loading} className="min-h-12 w-full px-6! text-base! sm:w-auto sm:min-w-72">
            {withCorrections ? "Créer mon dashboard avec les corrections" : "Créer mon dashboard"}
            <span aria-hidden="true">→</span>
          </Button>
          <p className="text-center text-sm text-slate-600">
            Pas de fichier sous la main ? Voir un exemple :{" "}
            <button type="button" disabled={loading || combined.status === "loading"} onClick={() => void loadShrinkageDemo()} className="font-semibold text-brand-800 underline-offset-4 hover:underline disabled:opacity-50">
              ventes + démarque
            </button>{" "}
            ·{" "}
            <button type="button" disabled={loading} onClick={() => void loadDemo()} className="font-semibold text-brand-800 underline-offset-4 hover:underline disabled:opacity-50">
              ventes seules
            </button>
          </p>
        </div>

        <details className="group rounded-xl border border-slate-200 px-4 py-3">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
            Options de confidentialité
            <span className="text-xs font-normal text-slate-500">
              {mode === "standard" ? "Standard" : "Strict"}
              <span aria-hidden="true" className="ml-2 inline-block transition-transform group-open:rotate-180">
                ▾
              </span>
            </span>
          </summary>
          <fieldset className="mt-3 flex flex-col gap-2">
            <legend className="mb-2 text-sm text-slate-600">Ce que l&apos;IA reçoit pour concevoir le dashboard :</legend>
            <div className="flex flex-col gap-2 sm:flex-row">
              {(
                [
                  ["standard", "Standard", "Structure, agrégats et extrait pseudonymisés"],
                  ["strict", "Strict", "Noms et types de colonnes uniquement"],
                ] as const
              ).map(([value, label, hint]) => (
                <label
                  key={value}
                  className={`flex flex-1 cursor-pointer flex-col rounded-xl border p-3 text-sm transition-colors duration-150 ${mode === value ? "border-accent-500 bg-accent-50 ring-1 ring-accent-500" : "border-slate-200 hover:border-accent-200"}`}
                >
                  <span className="flex items-center gap-2 font-medium text-slate-900">
                    <input id={`mode-${value}`} type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="accent-accent-600" />
                    {label}
                  </span>
                  <span className="mt-1 text-slate-600">{hint}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-slate-500">PDF : export d&apos;un logiciel ou d&apos;un tableur, avec une ligne d&apos;en-têtes. Les documents scannés ne sont pas lus.</p>
          </fieldset>
        </details>

        {combined.status === "loading" && (
          <p role="status" className="text-sm text-slate-600">
            Regroupement de vos {combined.count} fichiers : lecture, structure, doublons…
          </p>
        )}
        {combined.status === "error" && (
          <p role="alert" className="text-sm text-red-800">
            {combined.message}
          </p>
        )}
        {file && quality.status === "loading" && (
          <p role="status" className="text-sm text-slate-600">
            Contrôle qualité de {file.name} : doublons, cellules vides, valeurs incohérentes…
          </p>
        )}
        {quality.status === "error" && <p className="text-sm text-amber-900">Contrôle qualité indisponible : {quality.message} Vous pouvez tout de même générer le dashboard.</p>}
      </form>

      {!file && state.status === "idle" && (
        <ul className="grid gap-3 sm:grid-cols-3 print:hidden" aria-label="Vos données">
          {(
            [
              ["Données identifiantes protégées", "Elles sont pseudonymisées avant que l'IA ne conçoive le dashboard ; vous choisissez ce qu'elle reçoit."],
              ["Des chiffres justes", "Chaque indicateur est recalculé sur vos lignes par le moteur de calcul, pas estimé par l'IA."],
              ["Rien n'est gardé", "Le fichier importé n'est pas conservé : seul le dashboard est enregistré."],
            ] as const
          ).map(([title, text]) => (
            <li key={title} className="flex flex-col gap-1 rounded-[var(--radius-card)] border border-slate-200 bg-white p-4 text-sm">
              <span className="font-semibold text-slate-900">{title}</span>
              <span className="text-slate-600">{text}</span>
            </li>
          ))}
        </ul>
      )}

      {file && combined.status === "ready" && <CombineSummaryPanel summary={combined.summary} file={file} busy={loading} onLink={(choice) => void choose(selected, choice)} />}

      {file && quality.status === "ready" && (
        <div className="flex flex-col gap-2">
          <QualityPanel report={quality.report} plan={plan} onChange={setPlan} onDownload={() => void download()} downloading={downloading} />
          {downloadError && (
            <p role="alert" className="text-sm text-red-800">
              {downloadError}
            </p>
          )}
        </div>
      )}

      {state.status === "loading" && (
        <div role="status" className="flex items-center gap-4 rounded-[var(--radius-card)] border border-accent-200 bg-white p-5 shadow-card print:hidden">
          <AIProcessing active />
          <div className="flex min-w-0 flex-col gap-1 text-sm">
            <p className="font-semibold text-slate-900">Analyse de {state.fileName} en cours…</p>
            <p className="text-slate-600">
              Les données identifiantes sont pseudonymisées, l&apos;IA conçoit le dashboard, puis le moteur calcule chaque indicateur sur vos données.
              Selon la taille du fichier, cela peut prendre jusqu&apos;à une minute.
            </p>
          </div>
        </div>
      )}
      {state.status === "error" && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          {state.message}
        </p>
      )}
      {state.status === "done" && (
        <>
          {state.dashboardId && (
            <p role="status" className="flex items-center gap-2 rounded-xl bg-mint px-3 py-2 text-sm text-success-strong print:hidden">
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" d="m5 12 5 5 9-10" />
              </svg>
              Dashboard enregistré dans votre organisation.{" "}
              <a href={`/dashboards/${state.dashboardId}`} className="font-medium underline">
                Le retrouver
              </a>
            </p>
          )}
          <DashboardWorkspace
            key={state.dashboardId ?? state.result.fileName + state.result.durationMs}
            initial={state.result}
            dashboardId={state.dashboardId}
            exportable={exportable}
            canReimport={!!state.dashboardId}
            initialFile={file}
            recompute={recompute}
            branding={branding}
            ask={ask}
            aiAvailable={aiAvailable}
            downloadCleaned={downloadCleaned}
            {...(saveView && state.dashboardId && state.display
              ? { savedView: state.display, saveView: (view: ViewState, preferences: Parameters<SaveView>[1]) => saveView(state.dashboardId!, view, preferences), habitualApplied: state.habitualApplied }
              : {})}
          />
          <PrivacyPanel result={state.result} />
          <p className="text-xs text-slate-500 print:hidden">
            Généré en{" "}
            {state.result.durationMs < 1000
              ? "moins d'une seconde"
              : `${(state.result.durationMs / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s`}
            .
          </p>
        </>
      )}
    </div>
  );
}
