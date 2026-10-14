import { formatValue } from "@/lib/format";
import type { ComputedKpi } from "@/lib/engine/compute";

// Composition CSS de l'animation hero (« Data in motion ») : le fichier arrive, une ligne le relie au noyau IA,
// puis les indicateurs et les graphiques se composent. Les valeurs viennent du vrai moteur, sur des données fictives.
// Chaque étape est décalée ; avec « réduire les animations », l'état final s'affiche directement.

const delay = (ms: number) => ({ animationDelay: `${ms}ms` });

export function HeroVisual({ kpis, bars, shares }: { kpis: ComputedKpi[]; bars: number[]; shares: number[] }) {
  const max = Math.max(...bars, 1);
  const total = shares.reduce((a, b) => a + b, 0) || 1;
  const colors = ["#245bdb", "#7955e8", "#0b8a6a", "#1f86c9"];
  // Secteurs du graphique en anneau : angle de début = somme des parts précédentes.
  const arcs = shares.map((v, i) => {
    const start = (shares.slice(0, i).reduce((a, b) => a + b, 0) / total) * 360;
    return `${colors[i % colors.length]} ${start}deg ${start + (v / total) * 360}deg`;
  });

  return (
    <div className="relative mx-auto aspect-[5/4] w-full max-w-[560px]" role="img" aria-label="Un fichier Excel ou CSV est analysé par l'IA, puis devient un dashboard">
      {/* Halo discret : la seule zone en dégradé de la page. */}
      <div aria-hidden="true" className="absolute inset-[8%] rounded-full bg-[radial-gradient(closest-side,rgb(121_85_232/0.18),rgb(36_91_219/0.08),transparent)] blur-2xl" />

      {/* 01. Comprendre : le fichier arrive. */}
      <div aria-hidden="true" className="absolute left-0 top-[6%] flex w-[34%] flex-col gap-2 motion-safe:animate-rise" style={delay(0)}>
        {[
          ["xlsx", "#0b8a6a"],
          ["csv", "#245bdb"],
        ].map(([ext, color], i) => (
          <div key={ext} className={`flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-card ${i === 1 ? "ml-6" : ""}`}>
            <span className="grid size-7 place-items-center rounded-md text-[10px] font-bold text-white" style={{ background: color }}>
              {ext === "xlsx" ? "X" : "CSV"}
            </span>
            <span className="font-mono text-xs text-slate-600">ventes.{ext}</span>
          </div>
        ))}
      </div>

      {/* 02. Analyser : la ligne de données rejoint le noyau IA. */}
      <svg aria-hidden="true" viewBox="0 0 560 448" className="absolute inset-0 size-full">
        <defs>
          <linearGradient id="flux" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#245bdb" />
            <stop offset="1" stopColor="#7955e8" />
          </linearGradient>
        </defs>
        <path d="M150 95 C 220 95, 230 60, 300 70" fill="none" stroke="url(#flux)" strokeWidth="2" strokeDasharray="1" pathLength={1} className="motion-safe:animate-draw" style={delay(250)} />
        <path d="M150 95 C 220 95, 230 60, 300 70" fill="none" stroke="#7955e8" strokeOpacity="0.25" strokeWidth="6" strokeLinecap="round" />
      </svg>
      <div aria-hidden="true" className="absolute left-[50%] top-[6%] grid size-14 place-items-center rounded-full bg-[radial-gradient(circle_at_35%_35%,#a48df1,#5532b8)] text-sm font-bold text-white shadow-float motion-safe:animate-pulse-core" style={delay(500)}>
        IA
      </div>

      {/* 03. Décider : le dashboard se compose. */}
      <div aria-hidden="true" className="absolute bottom-0 right-0 flex w-[82%] flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_24px_60px_-24px_rgb(24_35_56/0.35)] motion-safe:animate-rise" style={delay(700)}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-900">Tableau de bord des ventes</span>
          <span className="rounded-full bg-mint px-2 py-0.5 text-[10px] font-semibold text-success-strong">Chiffres vérifiés</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {kpis.slice(0, 2).map((k, i) => (
            <div key={k.id} className="rounded-xl border border-slate-200 p-2.5 motion-safe:animate-rise" style={delay(950 + i * 120)}>
              <p className="truncate text-[10px] text-slate-600">{k.label}</p>
              <p className="text-base font-semibold tracking-tight text-slate-900 tabular-nums">{formatValue(k.value, k.format)}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <div className="flex h-24 items-end gap-1.5 rounded-xl border border-slate-200 p-2.5">
            {bars.map((v, i) => (
              <span
                key={i}
                className="flex-1 origin-bottom rounded-t bg-gradient-to-t from-brand-800 to-accent-500 motion-safe:animate-grow"
                style={{ height: `${Math.max(8, (v / max) * 100)}%`, ...delay(1200 + i * 60) }}
              />
            ))}
          </div>
          <div className="grid size-24 place-items-center rounded-full motion-safe:animate-rise" style={{ background: `conic-gradient(${arcs.join(",")})`, ...delay(1500) }}>
            <span className="size-12 rounded-full bg-white" />
          </div>
        </div>
      </div>
    </div>
  );
}
