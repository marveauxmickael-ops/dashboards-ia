/** Symbole Lisio : un axe et une courbe qui monte (ardoise et cuivre). */
export function LisioMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <rect x="9" y="6" width="6" height="36" rx="3" fill="#1f3a4d" />
      <path d="M12 39 L22 30 L29 34 L40 18" fill="none" stroke="#c8743a" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="40" cy="18" r="4.2" fill="#c8743a" />
    </svg>
  );
}

/** Logo complet : symbole et nom. */
export function LisioLogo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 text-brand-800">
      <LisioMark size={size} />
      <span className="font-display text-xl font-extrabold tracking-tight">Lisio</span>
    </span>
  );
}
