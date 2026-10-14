"use client";

import type { CombineSummary, LinkChoice } from "@/lib/combine";
import { saveBlob } from "./quality-panel";

/** Regroupement de plusieurs fichiers (US-16) : un seul fichier CSV et son récapitulatif, ou un message d'erreur. */
export type CombineOutcome = { ok: true; file: File; summary: CombineSummary } | { ok: false; message: string };
export type CombineFiles = (files: File[], options?: { link?: LinkChoice | null }) => Promise<CombineOutcome>;

/** Regroupement par défaut : par le serveur, qui lit les fichiers en mémoire sans les conserver. */
export const combineOnServer: CombineFiles = async (files, options = {}) => {
  const body = new FormData();
  for (const file of files) body.append("files", file);
  if (options.link) body.append("link", JSON.stringify(options.link));
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
  linked: { label: "Relié", className: "bg-accent-50 text-accent-900 ring-1 ring-accent-200" },
  duplicate: { label: "Déjà déposé", className: "bg-amber-50 text-amber-900 ring-1 ring-amber-200" },
  incompatible: { label: "Écarté", className: "bg-red-50 text-red-800 ring-1 ring-red-200" },
} as const;

/** Récapitulatif affiché avant la génération : fichiers regroupés, magasins détectés, fichiers écartés et pourquoi. */
export function CombineSummaryPanel({ summary, file, onLink, busy = false }: { summary: CombineSummary; file: File; onLink?: (choice: LinkChoice) => void; busy?: boolean }) {
  const added = summary.files.filter((f) => f.status === "added" || f.status === "linked");
  const link = summary.link;
  const set = summary.files.length - added.length;
  const what = summary.column && !summary.columnAdded ? `valeur(s) de « ${summary.column} »` : "fichier(s) comparé(s)";
  return (
    <section aria-label="Fichiers regroupés" className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-brand-200 bg-white p-4 text-sm shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-900">{link ? "Vos fichiers, reliés en un seul dashboard" : "Vos fichiers, regroupés en un seul dashboard"}</h3>
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
          <strong className="tabular-nums">{added.length}</strong> fichier(s) {link ? "utilisé(s)" : "regroupé(s)"}
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
      {link && <LinkDetails link={link} onLink={onLink} busy={busy} />}
      <p className="text-xs text-slate-600">
        {summary.column === null
          ? link
            ? "Chaque ligne garde son fichier d'origine (colonne « Fichier source ») : aucun montant n'est compté deux fois."
            : "Un seul fichier retenu : ses lignes sont analysées telles quelles."
          : summary.columnAdded
            ? `Aucune colonne ne distingue vos fichiers (magasin, rayon, produit…) : chaque ligne porte le nom de son fichier dans la colonne « ${summary.column} », et le dashboard compare les fichiers.`
            : `Chaque fichier correspond à une valeur de « ${summary.column} » : le dashboard les compare (classement, écart à la moyenne).`}{" "}
        Un fichier en double ou de structure différente n&apos;est jamais additionné.
      </p>
    </section>
  );
}

const pct = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });

/** Rapprochement de deux types de fichiers (US-15) : la clé utilisée, ce qui a été retrouvé, et le choix d'une autre clé. */
function LinkDetails({ link, onLink, busy }: { link: NonNullable<CombineSummary["link"]>; onLink?: (choice: LinkChoice) => void; busy: boolean }) {
  const keyLabel = (k: { main: string; other: string }) => (k.main === k.other ? `« ${k.main} »` : `« ${k.main} » ↔ « ${k.other} »`);
  const current = `${link.key.main}\u001f${link.key.other}`;
  const unmatched = link.otherRows - link.matchedRows;
  const coverage = link.matchedRows / Math.max(link.otherRows, 1);
  const choose = (patch: Partial<LinkChoice>) => onLink?.({ main: link.key.main, other: link.key.other, onlyMatched: link.onlyMatched, ...patch });
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-accent-200 bg-accent-50/50 p-3">
      <p className="text-slate-800">
        <strong>{link.otherLabel}</strong> est relié à <strong>{link.mainLabel}</strong> par {keyLabel(link.key)} :{" "}
        <strong className="tabular-nums">{link.key.matched.toLocaleString("fr-FR")}</strong> valeur(s) en commun (
        {pct.format(link.key.rate)} du plus petit fichier).
      </p>
      <ul className="list-disc pl-5 text-xs text-slate-700">
        <li>
          {link.matchedRows.toLocaleString("fr-FR")} ligne(s) sur {link.otherRows.toLocaleString("fr-FR")} rattachée(s) à un article du fichier principal
          {unmatched > 0 &&
            (link.onlyMatched
              ? ` ; ${unmatched.toLocaleString("fr-FR")} sans correspondance, écartée(s) à votre demande`
              : ` ; ${unmatched.toLocaleString("fr-FR")} sans correspondance, gardée(s) dans les totaux mais sans classification du fichier principal`)}
          .
        </li>
        {link.filled.length > 0 && <li>Reporté d&apos;après la clé : {link.filled.map((c) => `« ${c} »`).join(", ")}.</li>}
        {link.dateAligned && (
          <li>
            Dates alignées : « {link.dateAligned.from} » suit « {link.dateAligned.to} ».
          </li>
        )}
        {link.renamed.map((r) => (
          <li key={r.from}>
            « {r.from} » de {link.otherLabel} renommé « {r.to} » (même nom, autre sens).
          </li>
        ))}
        {link.ambiguous.length > 0 && <li>Non reporté (une même clé y a plusieurs valeurs) : {link.ambiguous.map((c) => `« ${c} »`).join(", ")}.</li>}
      </ul>
      {coverage < 0.8 && !link.onlyMatched && (
        <p role="note" className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900 ring-1 ring-amber-200">
          Seules {pct.format(coverage)} des lignes de {link.otherLabel} correspondent au fichier principal : celui-ci semble partiel (un extrait, une autre
          période ou un autre périmètre). Un taux qui rapporte l&apos;un à l&apos;autre compterait des lignes sans vente en face.
        </p>
      )}
      {onLink && unmatched > 0 && (
        <label className="flex items-center gap-2 text-xs text-slate-700">
          <input type="checkbox" checked={link.onlyMatched} disabled={busy} onChange={(e) => choose({ onlyMatched: e.target.checked })} className="size-4 accent-brand-800" />
          Ne garder que les lignes de {link.otherLabel} rattachées au fichier principal
        </label>
      )}
      {onLink && link.candidates.length > 1 && (
        <label className="flex flex-col gap-1 text-xs text-slate-700 sm:flex-row sm:items-center sm:gap-2">
          Relier plutôt par
          <select
            value={current}
            disabled={busy}
            onChange={(e) => {
              const [main, other] = e.target.value.split("\u001f");
              choose({ main, other });
            }}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
          >
            {link.candidates.map((k) => (
              <option key={`${k.main}\u001f${k.other}`} value={`${k.main}\u001f${k.other}`}>
                {keyLabel(k)} · {k.matched} en commun ({pct.format(k.rate)})
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
