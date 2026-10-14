"use client";

import type { LossPreset } from "@/lib/losses";

/** Liste lisible : « Casse, Dons divers et Produit périmé ». */
function list(values: string[]): string {
  return values.length <= 1 ? (values[0] ?? "") : `${values.slice(0, -1).join(", ")} et ${values.at(-1)}`;
}

/**
 * Bascule « Tous les mouvements / Pertes uniquement » d'un journal de démarque : une seule commande, à deux positions,
 * plutôt qu'un critère de plus à composer. Elle applique le filtre du moteur sur la colonne de type de mouvement.
 */
export function LossToggle({ preset, on, busy, onChange }: { preset: LossPreset; on: boolean; busy: boolean; onChange: (on: boolean) => void }) {
  const options = [
    [false, "Tous les mouvements"],
    [true, "Pertes uniquement"],
  ] as const;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 print:hidden" aria-busy={busy}>
      <div role="group" aria-label="Mouvements de stock pris en compte" className={`inline-flex rounded-full bg-slate-100 p-0.5 text-sm transition-opacity ${busy ? "opacity-60" : ""}`}>
        {options.map(([value, label]) => (
          <button
            key={label}
            type="button"
            aria-pressed={on === value}
            disabled={busy}
            onClick={() => on !== value && onChange(value)}
            className={`rounded-full px-3.5 py-1.5 font-medium transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-800 ${
              on === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        {busy
          ? "Recalcul…"
          : on
            ? `${list(preset.losses)} seulement : ${list(preset.others).toLowerCase()} écartés.`
            : `Pertes et corrections de stock (${list(preset.others).toLowerCase()}) confondues.`}
      </p>
    </div>
  );
}
