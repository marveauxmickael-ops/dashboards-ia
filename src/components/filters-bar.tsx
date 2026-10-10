"use client";

import { useState } from "react";
import { describeFilters, isFiltered, NO_FILTERS, type FilterOptions, type Filters } from "@/lib/filters";
import { formatPeriod } from "@/lib/format";

/** Filtres interactifs : période et valeurs par dimension. Chaque application recalcule tout le dashboard. */
export function FiltersBar({
  options,
  applied,
  busy,
  onApply,
}: {
  options: FilterOptions;
  applied: Filters;
  busy: boolean;
  onApply: (filters: Filters) => void;
}) {
  const [draft, setDraft] = useState<Filters>(applied);
  const changed = JSON.stringify(draft) !== JSON.stringify(applied);
  const select = "rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800";

  const setDimension = (column: string, values: string[], all: string[]) => {
    const dimensions = { ...draft.dimensions };
    if (values.length === all.length) delete dimensions[column];
    else dimensions[column] = values;
    setDraft({ ...draft, dimensions });
  };

  return (
    <section aria-label="Filtres" className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 print:hidden">
      <div className="flex flex-wrap items-end gap-3">
        {options.dateColumn && options.periods.length > 1 && (
          <>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Du
              <select className={select} value={draft.from ?? ""} onChange={(e) => setDraft({ ...draft, from: e.target.value || null })}>
                <option value="">Début</option>
                {options.periods.map((p) => (
                  <option key={p} value={p} disabled={!!draft.to && p > draft.to}>
                    {formatPeriod(p)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Au
              <select className={select} value={draft.to ?? ""} onChange={(e) => setDraft({ ...draft, to: e.target.value || null })}>
                <option value="">Fin</option>
                {options.periods.map((p) => (
                  <option key={p} value={p} disabled={!!draft.from && p < draft.from}>
                    {formatPeriod(p)}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {options.dimensions.map((d) => {
          const selected = draft.dimensions[d.column] ?? d.values;
          return (
            <details key={d.column} className="relative text-sm">
              <summary className={`${select} cursor-pointer list-none`}>
                {d.column} {selected.length < d.values.length ? `(${selected.length}/${d.values.length})` : "(tous)"} ▾
              </summary>
              <div className="absolute z-10 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
                <div className="mb-1.5 flex gap-3 text-xs">
                  <button type="button" className="text-teal-900 underline" onClick={() => setDimension(d.column, d.values, d.values)}>
                    Tout cocher
                  </button>
                  <button type="button" className="text-teal-900 underline" onClick={() => setDimension(d.column, [], d.values)}>
                    Tout décocher
                  </button>
                </div>
                <ul className="flex max-h-60 flex-col gap-1 overflow-y-auto">
                  {d.values.map((v) => (
                    <li key={v}>
                      <label className="flex cursor-pointer items-center gap-2 text-slate-800">
                        <input
                          type="checkbox"
                          className="size-3.5 accent-teal-800"
                          checked={selected.includes(v)}
                          onChange={() => setDimension(d.column, selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v], d.values)}
                        />
                        <span className="truncate">{v}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          );
        })}
        <button
          type="button"
          disabled={!changed || busy || Object.values(draft.dimensions).some((v) => v.length === 0)}
          onClick={() => onApply(draft)}
          className="rounded-lg bg-teal-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Calcul…" : "Appliquer les filtres"}
        </button>
        {isFiltered(applied) && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setDraft(NO_FILTERS);
              onApply(NO_FILTERS);
            }}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            Retirer les filtres
          </button>
        )}
      </div>
      {Object.values(draft.dimensions).some((v) => v.length === 0) && (
        <p className="text-xs text-red-700">Cochez au moins une valeur dans chaque filtre.</p>
      )}
    </section>
  );
}

/** Rappel des filtres actifs, visible à l'écran et dans le PDF. */
export function ActiveFilters({ filters }: { filters?: Filters }) {
  if (!filters || !isFiltered(filters)) return null;
  return (
    <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <strong>Vue filtrée</strong> · {describeFilters(filters, formatPeriod).join(" · ")}. Tous les chiffres sont recalculés sur les lignes
      retenues.
    </p>
  );
}
