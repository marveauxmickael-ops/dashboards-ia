"use client";

import { useState } from "react";
import type { Branding } from "@/lib/branding";
import type { DashboardResult } from "@/lib/pipeline";
import type { AiMode } from "@/lib/types";
import { DashboardWorkspace, recomputeOnServer, type AskQuestion, type Recompute } from "./dashboard-workspace";
import { PrivacyPanel } from "./privacy-panel";

type State = { status: "idle" } | { status: "loading"; fileName: string } | { status: "error"; message: string } | { status: "done"; result: DashboardResult; dashboardId?: string };

/** Résultat d'une génération : le dashboard, ou un message d'erreur à afficher. */
/** `dashboardId` est présent quand le dashboard a été enregistré dans l'organisation. */
export type GenerateOutcome = { ok: true; result: DashboardResult; dashboardId?: string } | { ok: false; message: string };

/** Génération par défaut : envoi du fichier à l'API du serveur. */
async function generateOnServer(file: File, mode: AiMode): Promise<GenerateOutcome> {
  const body = new FormData();
  body.append("file", file);
  body.append("mode", mode);
  try {
    const response = await fetch("/api/dashboard", { method: "POST", body });
    const json = await response.json();
    return response.ok ? { ok: true, result: json.result as DashboardResult, dashboardId: json.dashboardId } : { ok: false, message: json.error ?? "La génération a échoué." };
  } catch {
    return { ok: false, message: "Le serveur ne répond pas. Vérifiez votre connexion et réessayez." };
  }
}

export function Studio({
  generateDashboard = generateOnServer,
  demoFileUrl = "/demo/ventes-demo.csv",
  exportable = true,
  recompute = recomputeOnServer,
  branding,
  ask,
  aiAvailable,
}: {
  generateDashboard?: (file: File, mode: AiMode) => Promise<GenerateOutcome>;
  demoFileUrl?: string;
  /** Affiche les boutons de téléchargement (désactivé dans la démo navigateur). */
  exportable?: boolean;
  /** Recalcul (filtres, mise à jour) ; la démo navigateur le fait localement. */
  recompute?: Recompute;
  /** Charte graphique de l'organisation (logo, couleurs). */
  branding?: Branding;
  ask?: AskQuestion;
  aiAvailable?: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<AiMode>("standard");
  const [state, setState] = useState<State>({ status: "idle" });

  async function generate(selected: File) {
    setState({ status: "loading", fileName: selected.name });
    const outcome = await generateDashboard(selected, mode);
    setState(outcome.ok ? { status: "done", result: outcome.result, dashboardId: outcome.dashboardId } : { status: "error", message: outcome.message });
  }

  async function loadDemo() {
    const response = await fetch(demoFileUrl);
    const demo = new File([await response.blob()], "ventes-demo.csv", { type: "text/csv" });
    setFile(demo);
    await generate(demo);
  }

  const loading = state.status === "loading";

  return (
    <div className="flex flex-col gap-8">
      <form
        className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 print:hidden"
        onSubmit={(e) => {
          e.preventDefault();
          if (file) void generate(file);
        }}
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="file" className="text-sm font-medium text-slate-800">
            Fichier CSV ou Excel (20 Mo maximum)
          </label>
          <input
            id="file"
            type="file"
            accept=".csv,.xlsx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-800 hover:file:bg-slate-200"
          />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-slate-800">Données transmises à l&apos;IA</legend>
          <div className="flex flex-col gap-2 sm:flex-row">
            {(
              [
                ["standard", "Standard", "Structure, agrégats et extrait pseudonymisés"],
                ["strict", "Strict", "Noms et types de colonnes uniquement"],
              ] as const
            ).map(([value, label, hint]) => (
              <label
                key={value}
                className={`flex flex-1 cursor-pointer flex-col rounded-lg border p-3 text-sm ${mode === value ? "border-teal-700 bg-teal-50" : "border-slate-200"}`}
              >
                <span className="flex items-center gap-2 font-medium text-slate-900">
                  <input id={`mode-${value}`} type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} />
                  {label}
                </span>
                <span className="mt-1 text-slate-600">{hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="submit"
            disabled={!file || loading}
            className="rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Générer le dashboard
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void loadDemo()}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 disabled:opacity-50"
          >
            Essayer avec le fichier de démonstration
          </button>
        </div>
      </form>

      {state.status === "loading" && (
        <p role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-700 print:hidden">
          Analyse de {state.fileName} : pseudonymisation, conception par l&apos;IA puis calcul des indicateurs…
        </p>
      )}
      {state.status === "error" && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          {state.message}
        </p>
      )}
      {state.status === "done" && (
        <>
          {state.dashboardId && (
            <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 print:hidden">
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
