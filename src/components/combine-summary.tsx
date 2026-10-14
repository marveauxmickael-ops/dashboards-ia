"use client";

import type { CombineSummary } from "@/lib/combine";
import { saveBlob } from "./quality-panel";

/** Regroupement de plusieurs fichiers (US-16) : un seul fichier CSV et son récapitulatif, ou un message d'erreur. */
export type CombineOutcome = { ok: true; file: File; summary: CombineSummary } | { ok: false; message: string };
export type CombineFiles = (files: File[]) => Promise<CombineOutcome>;

/** Regroupement par défaut : par le serveur, qui lit les fichiers en mémoire sans les conserver. */
export const combineOnServer: CombineFiles = async (files) => {
  const body = new FormData();
  for (const file of files) body.append("files", file);
  try {
    const response = await fetch("/api/regrouper", { method: "POST", body });
    const json = await response.json();
    if (!response.ok) return { ok: false, message: json.error ?? "Les fichiers n'ont pas pu être regroupés." };
    return { ok: true, file: new File([json.csv as string], json.fileName as string, { type: "text/csv" }), summary: json.summary as CombineSummary };
  } catch {
    return { ok: false, message: "Le serveur ne répond pas. Vérifiez votre connexion et réessayez." };
  }
};

const STATUS = {
  added: { label: "Regroupé", className: "bg-mint text-success-strong" },
  duplicate: { label: "Déjà déposé", className: "bg-amber-50 text-amber-900 ring-1 ring-amber-200" },
  incompatible: { label: "Écarté", className: "bg-red-50 text-red-800 ring-1 ring-red-200" },
} as const;

/** Récapitulatif affiché avant la génération : fichiers regroupés, magasins détectés, fichiers écartés et pourquoi. */
export function CombineSummaryPanel({ summary, file }: { summary: CombineSummary; file: File }) {
  const added = summary.files.filter((f) => f.status === "added");
  const set = summary.files.length - added.length;
  const what = summary.column && !summary.columnAdded ? `valeur(s) de « ${summary.column} »` : "fichier(s) comparé(s)";
  return (
    <section aria-label="Fichiers regroupés" className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-brand-200 bg-white p-4 text-sm shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-900">Vos fichiers, regroupés en un seul dashboard</h3>
        <button
          type="button"
          onClick={() => saveBlob(file, file.name)}
          className="text-sm font-medium text-brand-900 underline"
          title="Lisio ne conserve pas vos fichiers : gardez ce fichier pour filtrer ou mettre à jour le dashboard plus tard."
        >
          Télécharger le fichier regroupé
        </button>
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-slate-800">
        <span>
          <strong className="tabular-nums">{added.length}</strong> fichier(s) regroupé(s)
        </span>
        {summary.column && (
          <span>
            <strong className="tabular-nums">{summary.values.length}</strong> {what}
          </span>
        )}
        <span>
          <strong className="tabular-nums">{summary.rows.toLocaleString("fr-FR")}</strong> lignes
        </span>
        {set > 0 && (
          <span className="text-amber-900">
            <strong className="tabular-nums">{set}</strong> fichier(s) écarté(s)
          </span>
        )}
      </p>
      <ul className="flex flex-col divide-y divide-slate-100 rounded-lg border border-slate-200">
        {summary.files.map((f, i) => (
          <li key={`${f.name}-${i}`} className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
            <span className={`inline-flex w-fit shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[f.status].className}`}>{STATUS[f.status].label}</span>
            <span className="min-w-0 break-words font-medium text-slate-900">{f.name}</span>
            <span className="text-xs text-slate-600 sm:ml-auto sm:text-right">
              {f.reason ?? `${f.rows.toLocaleString("fr-FR")} lignes${f.values.length > 0 && !summary.columnAdded ? ` · ${f.values.join(", ")}` : ""}`}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-600">
        {summary.column === null
          ? "Un seul fichier retenu : ses lignes sont analysées telles quelles."
          : summary.columnAdded
            ? `Aucune colonne ne distingue vos fichiers (magasin, rayon, produit…) : chaque ligne porte le nom de son fichier dans la colonne « ${summary.column} », et le dashboard compare les fichiers.`
            : `Chaque fichier correspond à une valeur de « ${summary.column} » : le dashboard les compare (classement, écart à la moyenne).`}{" "}
        Un fichier en double ou de structure différente n&apos;est jamais additionné.
      </p>
    </section>
  );
}
