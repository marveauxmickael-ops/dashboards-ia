"use client";

import { useState } from "react";
import { MAX_FILES } from "@/lib/combine";

const ACCEPT = ".csv,.xlsx,.xls,.pdf";
const EXTENSIONS = ["csv", "xlsx", "xls", "pdf"];

/** Nature probable d'un fichier, d'après son nom : simple repère visuel, le regroupement reste fait sur le contenu. */
function fileKind(name: string): string | null {
  if (/d[ée]marque|mrg|perte|casse/i.test(name)) return "Démarque";
  if (/vente|extr_ca|chiffre|_ca_|^ca[_-]/i.test(name)) return "Ventes";
  return null;
}

const size = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("fr-FR")} Ko` : `${(bytes / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;

const sameFile = (a: File, b: File) => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;

/**
 * Zone de dépôt unique : ventes, démarque, plusieurs magasins, par glisser-déposer ou clic (le champ natif reste accessible
 * au clavier et aux lecteurs d'écran). Chaque dépôt s'ajoute à la sélection. Les fichiers restent dans le navigateur ;
 * ils ne sont envoyés qu'au moment de l'analyse.
 */
export function FileUpload({ id, files, onChange, disabled = false }: { id: string; files: File[]; onChange: (files: File[]) => void; disabled?: boolean }) {
  const [over, setOver] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  function pick(list: FileList | null | undefined) {
    const candidates = Array.from(list ?? []);
    if (candidates.length === 0) return;
    const rejected = candidates.filter((f) => !EXTENSIONS.includes(f.name.split(".").pop()?.toLowerCase() ?? ""));
    const added = candidates.filter((f) => !rejected.includes(f) && !files.some((g) => sameFile(f, g)));
    const merged = [...files, ...added];
    const messages: string[] = [];
    if (rejected.length > 0) messages.push(`${rejected.map((f) => `« ${f.name} »`).join(", ")} : seuls les fichiers .csv, .xlsx, .xls et .pdf sont acceptés.`);
    if (merged.length > MAX_FILES) messages.push(`${MAX_FILES} fichiers au plus : les ${merged.length - MAX_FILES} derniers sont ignorés.`);
    setRefused(messages.length > 0 ? messages.join(" ") : null);
    if (added.length > 0) onChange(merged.slice(0, MAX_FILES));
  }

  function remove(index: number) {
    setRefused(null);
    onChange(files.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-3">
      <label
        htmlFor={id}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!disabled) pick(e.dataTransfer.files);
        }}
        className={`group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border-2 border-dashed px-6 py-10 text-center transition-colors duration-150 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-800 sm:py-12 ${
          over ? "border-brand-600 bg-brand-50" : "border-brand-200 bg-brand-50/40 hover:border-brand-400 hover:bg-brand-50"
        } ${disabled ? "pointer-events-none opacity-60" : ""}`}
      >
        <span className="flex size-14 items-center justify-center rounded-2xl bg-white text-brand-800 shadow-card" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" className={`transition-transform duration-200 ${over ? "motion-safe:-translate-y-1" : ""}`}>
            <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5a4 4 0 0 1-.5 7.97M12 12v8m0-8-3 3m3-3 3 3" />
          </svg>
        </span>
        <span className="font-display text-xl font-bold text-slate-900 sm:text-2xl">{over ? "Relâchez pour ajouter vos fichiers" : "Glissez-déposez toutes vos extractions ici"}</span>
        <span className="max-w-xl text-sm text-slate-600">
          Lisio reconnaît chaque fichier tout seul et produit un rapport complet : ventes, marge, démarque, comparaison de vos magasins.
        </span>
        <span className="flex flex-wrap justify-center gap-2" aria-hidden="true">
          {["Ventes", "Démarque", "Plusieurs magasins"].map((x) => (
            <span key={x} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
              {x}
            </span>
          ))}
        </span>
        <span className="text-sm font-semibold text-brand-800 underline-offset-4 group-hover:underline">ou parcourir mon ordinateur</span>
        <span className="text-xs text-slate-500">
          .csv, .xlsx, .xls ou .pdf · jusqu&apos;à {MAX_FILES} fichiers · 20 Mo maximum chacun
        </span>
        <input
          id={id}
          type="file"
          accept={ACCEPT}
          multiple
          disabled={disabled}
          className="sr-only"
          onChange={(e) => {
            pick(e.target.files);
            // Permet de redéposer le même fichier après l'avoir retiré.
            e.target.value = "";
          }}
        />
      </label>
      {refused && (
        <p role="alert" className="text-sm text-red-800">
          {refused}
        </p>
      )}
      {files.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Fichiers sélectionnés">
          {files.map((f, i) => {
            const kind = fileKind(f.name);
            return (
              <li key={`${f.name}-${f.size}-${f.lastModified}`} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="flex-none text-slate-500">
                  <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5" />
                </svg>
                <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{f.name}</span>
                {kind && <span className={`flex-none rounded-full px-2 py-0.5 text-xs font-semibold ${kind === "Démarque" ? "bg-accent-50 text-accent-700" : "bg-brand-50 text-brand-900"}`}>{kind}</span>}
                <span className="flex-none text-xs text-slate-500">{size(f.size)}</span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => remove(i)}
                  aria-label={`Retirer ${f.name}`}
                  className="flex size-8 flex-none items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
