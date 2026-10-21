/** Bouton « Réduire / Afficher » des blocs du dashboard. */
export function CollapseToggle({ collapsed, onToggle, controls, tone = "accent" }: { collapsed: boolean; onToggle: () => void; controls: string; tone?: "accent" | "red" | "neutral" }) {
  return (
    <button
      type="button"
      aria-expanded={!collapsed}
      aria-controls={controls}
      onClick={onToggle}
      className={`inline-flex items-center gap-1 rounded-lg border bg-white px-2.5 py-1 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-800 print:hidden ${
        tone === "red" ? "border-red-200 text-red-900 hover:bg-red-50" : tone === "neutral" ? "border-slate-300 text-slate-800 hover:bg-slate-50" : "border-accent-200 text-accent-900 hover:bg-accent-50"
      }`}
    >
      {collapsed ? "Afficher" : "Réduire"}
      <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" className={`transition-transform ${collapsed ? "" : "rotate-180"}`}>
        <path fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );
}
