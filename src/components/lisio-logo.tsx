/** Symbole Lisio : un axe et une courbe qui monte, du bleu (données) au violet (IA). */
export function LisioMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id="lisio-courbe" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#245bdb" />
          <stop offset="1" stopColor="#7955e8" />
        </linearGradient>
      </defs>
      <rect x="9" y="6" width="6" height="36" rx="3" fill="#182338" />
      <path d="M12 39 L22 30 L29 34 L40 18" fill="none" stroke="url(#lisio-courbe)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="40" cy="18" r="4.2" fill="#7955e8" />
    </svg>
  );
}

/** Logo complet : symbole et nom. */
export function LisioLogo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 text-slate-900">
      <LisioMark size={size} />
      <span className="font-display text-xl font-bold tracking-tight">Lisio</span>
    </span>
  );
}
