import type { HTMLAttributes } from "react";

/** Carte : fond blanc, bordure fine, rayon de 14 px, ombre très légère. */
export function Card({ className = "", ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={`rounded-[var(--radius-card)] border border-slate-200 bg-white shadow-card ${className}`} {...props} />;
}

/** Pastille d'icône (fond bleu ou violet très clair). */
export function IconTile({ tone = "brand", children }: { tone?: "brand" | "ai"; children: React.ReactNode }) {
  return (
    <span aria-hidden="true" className={`grid size-10 shrink-0 place-items-center rounded-xl ${tone === "ai" ? "bg-accent-50 text-accent-600" : "bg-brand-50 text-brand-800"}`}>
      {children}
    </span>
  );
}
