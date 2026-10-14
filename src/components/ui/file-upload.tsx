"use client";

import { useState } from "react";
import { MAX_FILES } from "@/lib/combine";

const ACCEPT = ".csv,.xlsx,.xls,.pdf";
const EXTENSIONS = ["csv", "xlsx", "xls", "pdf"];

/**
 * Zone de dépôt : un ou plusieurs fichiers (US-16), par glisser-déposer ou clic (le champ natif reste accessible au
 * clavier et aux lecteurs d'écran). Les fichiers restent dans le navigateur ; ils ne sont envoyés qu'au moment de l'analyse.
 */
export function FileUpload({ id, files, onChange, disabled = false }: { id: string; files: File[]; onChange: (files: File[]) => void; disabled?: boolean }) {
  const [over, setOver] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  function pick(list: FileList | null | undefined) {
    const candidates = Array.from(list ?? []);
    if (candidates.length === 0) return;
    const rejected = candidates.filter((f) => !EXTENSIONS.includes(f.name.split(".").pop()?.toLowerCase() ?? ""));
    const accepted = candidates.filter((f) => !rejected.includes(f));
    const messages: string[] = [];
    if (rejected.length > 0) messages.push(`${rejected.map((f) => `« ${f.name} »`).join(", ")} : seuls les fichiers .csv, .xlsx, .xls et .pdf sont acceptés.`);
    if (accepted.length > MAX_FILES) messages.push(`${MAX_FILES} fichiers au plus : les ${accepted.length - MAX_FILES} derniers sont ignorés.`);
    setRefused(messages.length > 0 ? messages.join(" ") : null);
    if (accepted.length > 0) onChange(accepted.slice(0, MAX_FILES));
  }

  const file = files.length === 1 ? files[0] : null;
  const totalMb = files.reduce((n, f) => n + f.size, 0) / 1024 / 1024;

  return (
    <div className="flex flex-col gap-2">
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
        className={`group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed px-6 py-8 text-center transition-colors duration-150 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-800 ${
          over ? "border-brand-600 bg-brand-50" : files.length > 0 ? "border-brand-300 bg-brand-50/50" : "border-slate-300 bg-slate-50 hover:border-brand-300 hover:bg-brand-50/40"
        } ${disabled ? "pointer-events-none opacity-60" : ""}`}
      >
        <svg width="36" height="36" viewBox="0 0 24 24" aria-hidden="true" className={`text-brand-800 transition-transform duration-200 ${over ? "motion-safe:-translate-y-1" : ""}`}>
          <path fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5a4 4 0 0 1-.5 7.97M12 12v8m0-8-3 3m3-3 3 3" />
        </svg>
        {file ? (
          <>
            <span className="font-semibold text-slate-900">{file.name}</span>
            <span className="text-xs text-slate-600">
              {(file.size / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo · cliquez ou déposez d&apos;autres fichiers pour le remplacer
            </span>
          </>
        ) : files.length > 1 ? (
          <>
            <span className="font-semibold text-slate-900">{files.length} fichiers sélectionnés</span>
            <span className="max-w-full truncate text-xs text-slate-600">{files.map((f) => f.name).join(" · ")}</span>
            <span className="text-xs text-slate-600">
              {totalMb.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo · cliquez ou déposez d&apos;autres fichiers pour remplacer la sélection
            </span>
          </>
        ) : (
          <>
            <span className="font-semibold text-slate-900">Glissez un ou plusieurs fichiers ici, ou cliquez pour parcourir</span>
            <span className="text-xs text-slate-600">Jusqu&apos;à {MAX_FILES} fichiers de même structure (un par magasin, par exemple) · 20 Mo maximum chacun</span>
          </>
        )}
        <span className="mt-1 flex gap-1.5" aria-hidden="true">
          {EXTENSIONS.map((x) => (
            <span key={x} className="rounded-full border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] text-slate-600">
              .{x}
            </span>
          ))}
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
            // Permet de redéposer la même sélection après une correction.
            e.target.value = "";
          }}
        />
      </label>
      {refused && (
        <p role="alert" className="text-sm text-red-800">
          {refused}
        </p>
      )}
    </div>
  );
}
