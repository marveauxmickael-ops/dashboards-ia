"use client";

import { useState } from "react";

const ACCEPT = ".csv,.xlsx,.pdf";
const EXTENSIONS = ["csv", "xlsx", "pdf"];

/**
 * Zone de dépôt de fichier : glisser-déposer ou clic (le champ natif reste accessible au clavier et aux lecteurs d'écran).
 * Le fichier reste dans le navigateur ; il n'est envoyé qu'au moment de l'analyse.
 */
export function FileUpload({ id, file, onChange, disabled = false }: { id: string; file: File | null; onChange: (file: File | null) => void; disabled?: boolean }) {
  const [over, setOver] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  function pick(candidate: File | null) {
    if (candidate && !EXTENSIONS.includes(candidate.name.split(".").pop()?.toLowerCase() ?? "")) {
      setRefused(`« ${candidate.name} » n'est pas un fichier .csv, .xlsx ou .pdf.`);
      return;
    }
    setRefused(null);
    onChange(candidate);
  }

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
          if (!disabled) pick(e.dataTransfer.files?.[0] ?? null);
        }}
        className={`group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed px-6 py-8 text-center transition-colors duration-150 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-800 ${
          over ? "border-brand-600 bg-brand-50" : file ? "border-brand-300 bg-brand-50/50" : "border-slate-300 bg-slate-50 hover:border-brand-300 hover:bg-brand-50/40"
        } ${disabled ? "pointer-events-none opacity-60" : ""}`}
      >
        <svg width="36" height="36" viewBox="0 0 24 24" aria-hidden="true" className={`text-brand-800 transition-transform duration-200 ${over ? "motion-safe:-translate-y-1" : ""}`}>
          <path fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5a4 4 0 0 1-.5 7.97M12 12v8m0-8-3 3m3-3 3 3" />
        </svg>
        {file ? (
          <>
            <span className="font-semibold text-slate-900">{file.name}</span>
            <span className="text-xs text-slate-600">
              {(file.size / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo · cliquez ou déposez un autre fichier pour le remplacer
            </span>
          </>
        ) : (
          <>
            <span className="font-semibold text-slate-900">Glissez votre fichier ici, ou cliquez pour parcourir</span>
            <span className="text-xs text-slate-600">20 Mo maximum</span>
          </>
        )}
        <span className="mt-1 flex gap-1.5" aria-hidden="true">
          {EXTENSIONS.map((x) => (
            <span key={x} className="rounded-full border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] text-slate-600">
              .{x}
            </span>
          ))}
        </span>
        <input id={id} type="file" accept={ACCEPT} disabled={disabled} className="sr-only" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
      </label>
      {refused && (
        <p role="alert" className="text-sm text-red-800">
          {refused}
        </p>
      )}
    </div>
  );
}
