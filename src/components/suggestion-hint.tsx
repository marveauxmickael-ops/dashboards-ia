import type { Recommendation } from "@/lib/recommendations";

/**
 * Suggestion contextuelle (US-19) : une petite ampoule signale qu'une piste existe ; la bulle apparaît au survol de
 * la carte (ou au focus clavier / au toucher sur l'ampoule) et disparaît quand le curseur en sort.
 * La carte parente porte la classe `group` et `relative`.
 */
export function SuggestionHint({ items, placement }: { items: Recommendation[]; placement: "inside" | "below" }) {
  if (items.length === 0) return null;
  const losses = items.every((r) => r.group === "losses");
  return (
    <>
      <button
        type="button"
        aria-label={`Voir ${items.length > 1 ? "les suggestions" : "la suggestion"}`}
        className={`absolute bottom-2 right-2 z-10 inline-flex size-6 items-center justify-center rounded-full ring-1 transition-colors print:hidden ${
          losses ? "bg-red-50 text-red-700 ring-red-200" : "bg-emerald-50 text-emerald-700 ring-emerald-200"
        } focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-800`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V17h5v-1.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" />
        </svg>
      </button>
      <div
        role="tooltip"
        className={`pointer-events-none absolute z-30 flex flex-col gap-2 rounded-xl border bg-white p-3 text-left shadow-lg opacity-0 transition duration-150 motion-safe:translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0 print:hidden ${
          losses ? "border-red-200" : "border-emerald-200"
        } ${placement === "inside" ? "inset-x-3 bottom-10" : "inset-x-0 top-full mt-2"}`}
      >
        {items.map((r) => (
          <div key={r.id} className="flex flex-col gap-0.5">
            <p className={`text-[11px] font-semibold uppercase tracking-wide ${r.group === "losses" ? "text-red-800" : "text-emerald-800"}`}>
              {r.group === "losses" ? "Réduire les pertes" : "Développer ce qui marche"}
            </p>
            <p className="text-sm font-semibold text-slate-900">{r.title}</p>
            <p className="text-xs text-slate-700">{r.action}</p>
            <p className="text-[11px] text-slate-500">{r.why}</p>
          </div>
        ))}
      </div>
    </>
  );
}
