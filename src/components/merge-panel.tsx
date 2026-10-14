"use client";

import { useState } from "react";
import { formatPeriod, formatValue } from "@/lib/format";
import type { KeepPolicy, MergePreview, MergeSnapshot } from "@/lib/merge";
import { mergedFileName } from "@/lib/merge";
import type { DashboardResult } from "@/lib/pipeline";
import { saveBlob } from "./quality-panel";

type Step = "preview" | "apply" | "download";

async function callMerge(dashboardId: string, step: Step, previous: File, file: File, keep: KeepPolicy): Promise<Response> {
  const body = new FormData();
  body.append("previous", previous);
  body.append("file", file);
  body.append("step", step);
  body.append("keep", keep);
  return fetch(`/api/dashboards/${dashboardId}/ajout`, { method: "POST", body });
}

async function errorOf(response: Response): Promise<string> {
  try {
    return ((await response.json()) as { error?: string }).error ?? "L'ajout a échoué.";
  } catch {
    return "L'ajout a échoué.";
  }
}

const periodLabel = (p: MergeSnapshot["period"]) => (!p ? "—" : p.from === p.to ? formatPeriod(p.from) : `${formatPeriod(p.from)} → ${formatPeriod(p.to)}`);
const count = (n: number) => n.toLocaleString("fr-FR");

function Figure({ label, value, hint, tone }: { label: string; value: number; hint: string; tone: string }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${tone}`}>
      <p className="text-xs font-medium">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{count(value)}</p>
      <p className="text-xs opacity-80">{hint}</p>
    </div>
  );
}

/**
 * Ajout de données (US-12) : fichier de la version en cours + nouveau fichier, récapitulatif, puis validation.
 * Les deux fichiers restent dans le navigateur et ne sont lus par le serveur que le temps du calcul.
 */
export function MergePanel({
  dashboardId,
  currentName,
  refreshedAt,
  loadedFile,
  onDone,
  onCancel,
}: {
  dashboardId: string;
  /** Nom du fichier de la version en cours. */
  currentName: string;
  refreshedAt?: string;
  /** Fichier déjà chargé dans la session, proposé comme fichier de la version en cours. */
  loadedFile: File | null;
  onDone: (result: DashboardResult, message: string) => void;
  onCancel: () => void;
}) {
  const [previous, setPrevious] = useState<File | null>(loadedFile);
  const [file, setFile] = useState<File | null>(null);
  const [keep, setKeep] = useState<KeepPolicy>("new");
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [busy, setBusy] = useState<Step | null>(null);
  const [error, setError] = useState<string | null>(null);
  const when = refreshedAt ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(refreshedAt)) : null;

  async function analyze(policy: KeepPolicy = keep) {
    if (!previous || !file) return;
    setBusy("preview");
    setError(null);
    try {
      const response = await callMerge(dashboardId, "preview", previous, file, policy);
      if (!response.ok) {
        setPreview(null);
        setError(await errorOf(response));
      } else setPreview(((await response.json()) as { preview: MergePreview }).preview);
    } catch {
      setError("Le serveur ne répond pas. Vérifiez votre connexion et réessayez.");
    }
    setBusy(null);
  }

  async function download(): Promise<boolean> {
    if (!previous || !file) return false;
    const response = await callMerge(dashboardId, "download", previous, file, keep);
    if (!response.ok) {
      setError(await errorOf(response));
      return false;
    }
    saveBlob(await response.blob(), mergedFileName(currentName));
    return true;
  }

  async function apply() {
    if (!previous || !file || !preview) return;
    setBusy("apply");
    setError(null);
    try {
      const response = await callMerge(dashboardId, "apply", previous, file, keep);
      if (!response.ok) {
        setError(await errorOf(response));
        setBusy(null);
        return;
      }
      const { result } = (await response.json()) as { result: DashboardResult };
      // Le fichier fusionné sera demandé au prochain ajout : il est téléchargé d'office (Lisio ne le conserve pas).
      setBusy("download");
      await download();
      setBusy(null);
      onDone(result, `Données ajoutées : ${count(preview.summary.added)} ligne(s) nouvelle(s). Conservez le fichier fusionné téléchargé : il vous sera demandé au prochain ajout.`);
    } catch {
      setError("Le serveur ne répond pas. Vérifiez votre connexion et réessayez.");
      setBusy(null);
    }
  }

  const summary = preview?.summary;
  const changes = summary ? summary.added + (keep === "new" ? summary.modified : 0) : 0;
  const fileInput = "mt-1 block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:font-medium file:text-slate-800";

  return (
    <section aria-label="Ajouter des données" className="flex flex-col gap-4 rounded-xl border border-brand-200 bg-brand-50/40 p-4 text-sm">
      <div>
        <h3 className="text-base font-semibold text-slate-900">Ajouter des données</h3>
        <p className="mt-1 text-slate-600">
          Seules les lignes nouvelles ou modifiées du nouveau fichier sont ajoutées : les lignes déjà présentes ne sont pas comptées deux fois. Lisio ne
          conservant pas vos fichiers, chargez aussi celui de la version en cours.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col">
          <span className="font-medium text-slate-800">1. Fichier de la version en cours</span>
          <span className="text-xs text-slate-500">
            « {currentName} »{when && `, actualisé le ${when}`}
            {previous && ` · chargé : ${previous.name}`}
          </span>
          <input
            type="file"
            accept=".csv,.xlsx,.xls,.pdf"
            className={fileInput}
            onChange={(e) => {
              setPrevious(e.target.files?.[0] ?? null);
              setPreview(null);
              setError(null);
            }}
          />
        </label>
        <label className="flex flex-col">
          <span className="font-medium text-slate-800">2. Nouveau fichier</span>
          <span className="text-xs text-slate-500">Mêmes colonnes ; il peut recouper la période déjà importée.{file && ` · chargé : ${file.name}`}</span>
          <input
            type="file"
            accept=".csv,.xlsx,.xls,.pdf"
            className={fileInput}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
              setError(null);
            }}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!previous || !file || busy !== null}
          onClick={() => void analyze()}
          className="rounded-lg bg-brand-800 px-3 py-1.5 font-semibold text-white hover:bg-brand-900 disabled:opacity-50"
        >
          {busy === "preview" ? "Analyse…" : preview ? "Analyser à nouveau" : "Analyser l'ajout"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-50">
          Annuler
        </button>
      </div>

      {error && (
        <p role="alert" className="text-red-800">
          {error}
        </p>
      )}

      {preview && summary && (
        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3" aria-live="polite">
          <div className="grid gap-2 sm:grid-cols-3">
            <Figure label="Déjà présentes" value={summary.alreadyPresent} hint="ignorées" tone="border-slate-200 bg-slate-50 text-slate-800" />
            <Figure label="Nouvelles" value={summary.added} hint="ajoutées" tone="border-emerald-200 bg-emerald-50 text-emerald-900" />
            <Figure label="Modifiées" value={summary.modified} hint={keep === "new" ? "nouvelle valeur gardée" : "ancienne valeur gardée"} tone="border-amber-200 bg-amber-50 text-amber-900" />
          </div>
          <p className="text-xs text-slate-600">
            {summary.idColumn
              ? `Une ligne est « modifiée » si son « ${summary.idColumn} » existe déjà avec des valeurs différentes.`
              : "Aucune colonne d'identifiant unique (n° de commande, de facture) : une ligne modifiée ne peut pas être reconnue et serait comptée comme nouvelle."}
          </p>
          {summary.modified > 0 && (
            <fieldset className="flex flex-wrap gap-4">
              <legend className="mb-1 font-medium text-slate-800">Pour les lignes modifiées</legend>
              {(
                [
                  ["new", "Garder la nouvelle valeur"],
                  ["old", "Garder l'ancienne valeur"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="keep"
                    checked={keep === value}
                    onChange={() => {
                      setKeep(value);
                      void analyze(value);
                    }}
                    className="accent-brand-800"
                  />
                  {label}
                </label>
              ))}
            </fieldset>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="py-1 pr-3 font-medium" />
                  <th className="py-1 pr-3 font-medium">Avant</th>
                  <th className="py-1 font-medium">Après l&apos;ajout</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-100">
                  <td className="py-1.5 pr-3 text-slate-600">Période</td>
                  <td className="py-1.5 pr-3">{periodLabel(preview.before.period)}</td>
                  <td className="py-1.5 font-medium">{periodLabel(preview.after.period)}</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-1.5 pr-3 text-slate-600">Lignes</td>
                  <td className="py-1.5 pr-3 tabular-nums">{count(preview.before.rows)}</td>
                  <td className="py-1.5 font-medium tabular-nums">{count(preview.after.rows)}</td>
                </tr>
                {preview.after.kpis.map((k) => {
                  const before = preview.before.kpis.find((b) => b.id === k.id);
                  return (
                    <tr key={k.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-1.5 pr-3 text-slate-600">{k.label}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{before ? formatValue(before.value, before.format) : "—"}</td>
                      <td className="py-1.5 font-medium tabular-nums">{formatValue(k.value, k.format)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {preview.unverified && (
            <p className="rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
              Ce dashboard date d&apos;avant l&apos;ajout de données : Lisio ne peut pas vérifier que le fichier n° 1 est bien celui de la version en cours.
              Vérifiez-le avant de valider.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={changes === 0 || busy !== null}
              onClick={() => void apply()}
              className="rounded-lg bg-brand-800 px-3 py-1.5 font-semibold text-white hover:bg-brand-900 disabled:opacity-50"
            >
              {busy === "apply" ? "Ajout en cours…" : busy === "download" ? "Téléchargement du fichier fusionné…" : "Valider l'ajout"}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void download()}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              Télécharger le fichier fusionné (CSV)
            </button>
            {changes === 0 && <span className="text-xs text-slate-600">Aucune ligne nouvelle ou modifiée : le dashboard est déjà à jour.</span>}
          </div>
          <p className="text-xs text-slate-500">
            Une nouvelle version est créée dans l&apos;historique ; la précédente reste consultable. Le fichier fusionné est téléchargé à la validation :
            conservez-le, il vous sera demandé au prochain ajout. Aucun fichier n&apos;est conservé par Lisio.
          </p>
        </div>
      )}
    </section>
  );
}
