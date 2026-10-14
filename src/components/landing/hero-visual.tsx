"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import type { MonthFigures } from "@/lib/landing-preview";

// Animation hero (« Data in motion ») : le fichier arrive, une ligne lumineuse le relie au noyau IA, puis le dashboard
// se compose et s'anime. Les mois défilent seuls, les chiffres roulent jusqu'à leur valeur, un indicateur s'allume
// au survol et les barres se choisissent au survol ou au clic. Valeurs réelles du moteur sur des données fictives.
// Avec « réduire les animations » : pas de lecture automatique ni de défilement, l'état final s'affiche directement.

type Key = "revenue" | "margin" | "clients";

const euros = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const one = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const FORMAT: Record<Key, (v: number) => string> = {
  revenue: (v) => `${euros.format(v)} €`,
  margin: (v) => `${one.format(v)} %`,
  clients: (v) => euros.format(v),
};
const LABEL: Record<Key, string> = { revenue: "Chiffre d'affaires HT", margin: "Taux de marge", clients: "Clients actifs" };
const DONUT = ["#245bdb", "#7955e8", "#0b8a6a", "#1f86c9"];
const delay = (ms: number) => ({ animationDelay: `${ms}ms` });

/** Valeur affichée qui roule jusqu'à la cible (courbe ease-out, 700 ms). */
function useRolling(target: number, enabled: boolean): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (!enabled) {
      from.current = target;
      return;
    }
    const start = from.current;
    const t0 = performance.now();
    let frame = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 700);
      const value = start + (target - start) * (1 - Math.pow(1 - p, 3));
      from.current = value;
      setShown(value);
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, enabled]);
  return enabled ? shown : target;
}

function Trend({ k, current, previous }: { k: Key; current: number | null; previous: number | null }) {
  if (current === null || previous === null || previous === 0) return <span className="h-4" />;
  const gap = k === "margin" ? current - previous : ((current - previous) / previous) * 100;
  const up = gap > 0;
  return (
    <span className={`inline-flex w-fit items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${gap === 0 ? "bg-slate-100 text-slate-600" : up ? "bg-mint text-success-strong" : "bg-red-50 text-red-700"}`}>
      {gap === 0 ? "=" : up ? "▲" : "▼"} {up ? "+" : gap < 0 ? "−" : ""}
      {one.format(Math.abs(gap))}
      {k === "margin" ? " pt" : " %"}
    </span>
  );
}

function Kpi({ k, figures, previous, animate, lit, onLight }: { k: Key; figures: MonthFigures; previous: MonthFigures | null; animate: boolean; lit: boolean; onLight: (on: boolean) => void }) {
  const value = figures[k];
  const shown = useRolling(value ?? 0, animate);
  return (
    <button
      type="button"
      onMouseEnter={() => onLight(true)}
      onMouseLeave={() => onLight(false)}
      onFocus={() => onLight(true)}
      onBlur={() => onLight(false)}
      className={`flex min-w-0 flex-col gap-1 rounded-xl border p-2.5 text-left transition duration-200 ${
        lit ? "border-brand-300 bg-brand-50 shadow-[0_0_0_3px_rgb(36_91_219/0.12),0_10px_24px_-12px_rgb(36_91_219/0.5)] motion-safe:-translate-y-0.5" : "border-slate-200 bg-white"
      }`}
    >
      <span className="truncate text-[10px] text-slate-600">{LABEL[k]}</span>
      <span className="text-sm font-semibold tracking-tight text-slate-900 tabular-nums sm:text-base">{value === null ? "—" : FORMAT[k](shown)}</span>
      <Trend k={k} current={value} previous={previous ? previous[k] : null} />
    </button>
  );
}

export function HeroVisual({ months, total, shares }: { months: MonthFigures[]; total: MonthFigures | null; shares: number[] }) {
  const reduced = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState(-1);
  const [paused, setPaused] = useState(false);
  const [lit, setLit] = useState<Key | null>(null);
  const animate = visible && !reduced;

  // Démarre quand l'aperçu devient visible.
  useEffect(() => {
    const el = root.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setVisible(true);
        obs.disconnect();
      }
    }, { threshold: 0.3 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Lecture automatique des mois (puis la période entière), suspendue au survol.
  useEffect(() => {
    if (!animate || paused || months.length === 0) return;
    const timer = setInterval(() => setCurrent((c) => (c >= months.length - 1 ? -1 : c + 1)), 2200);
    return () => clearInterval(timer);
  }, [animate, paused, months.length]);

  if (!total || months.length === 0) return null;
  const figures = current < 0 ? total : months[current];
  const previous = current > 0 ? months[current - 1] : null;
  const max = Math.max(...months.map((m) => m.revenue), 1);
  const keys: Key[] = (["revenue", "margin", "clients"] as Key[]).filter((k) => total[k] !== null);
  const sum = shares.reduce((a, b) => a + b, 0) || 1;
  const arcs = shares.map((v, i) => {
    const start = (shares.slice(0, i).reduce((a, b) => a + b, 0) / sum) * 360;
    return `${DONUT[i % DONUT.length]} ${start}deg ${start + (v / sum) * 360}deg`;
  });
  const gap = previous ? ((figures.revenue - previous.revenue) / previous.revenue) * 100 : null;
  const period = current < 0 ? `${total.label.charAt(0).toUpperCase()}${total.label.slice(1)}` : figures.label;
  const choose = (i: number) => {
    setPaused(true);
    setCurrent(i);
  };

  // Sur mobile, seul le dashboard s'affiche (pleine largeur) ; la mise en scène complète à partir de 640 px.
  return (
    <div ref={root} className="relative mx-auto w-full max-w-[560px] sm:aspect-[5/4.9]">
      <div aria-hidden="true" className="absolute inset-[8%] hidden rounded-full sm:block bg-[radial-gradient(closest-side,rgb(121_85_232/0.18),rgb(36_91_219/0.08),transparent)] blur-2xl" />

      {/* 01. Comprendre : le fichier arrive. */}
      <div aria-hidden="true" className="absolute left-0 top-[2%] hidden w-[34%] sm:flex flex-col gap-2 motion-safe:animate-rise">
        {[
          ["xlsx", "#0b8a6a", "X"],
          ["csv", "#245bdb", "CSV"],
        ].map(([ext, color, mark], i) => (
          <div key={ext} className={`flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-card ${i === 1 ? "ml-6" : ""}`}>
            <span className="grid size-7 place-items-center rounded-md text-[10px] font-bold text-white" style={{ background: color }}>
              {mark}
            </span>
            <span className="font-mono text-xs text-slate-600">ventes.{ext}</span>
          </div>
        ))}
      </div>

      {/* 02. Analyser : des données circulent le long de la ligne vers le noyau IA. */}
      <svg aria-hidden="true" viewBox="0 0 560 549" className="absolute inset-0 hidden size-full sm:block">
        <defs>
          <linearGradient id="flux" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#245bdb" />
            <stop offset="1" stopColor="#7955e8" />
          </linearGradient>
        </defs>
        <path d="M150 88 C 220 88, 230 52, 296 60" fill="none" stroke="#7955e8" strokeOpacity="0.2" strokeWidth="6" strokeLinecap="round" />
        <path d="M150 88 C 220 88, 230 52, 296 60" fill="none" stroke="url(#flux)" strokeWidth="2" />
        {animate &&
          [0, 0.6, 1.2].map((d) => (
            <circle key={d} r="3.5" fill="#ffffff" stroke="#7955e8" strokeWidth="1.5">
              <animateMotion dur="1.8s" begin={`${d}s`} repeatCount="indefinite" path="M150 88 C 220 88, 230 52, 296 60" />
            </circle>
          ))}
      </svg>
      <div aria-hidden="true" className="absolute left-[52%] top-[1%] hidden size-14 sm:grid place-items-center rounded-full bg-[radial-gradient(circle_at_35%_35%,#a48df1,#5532b8)] text-sm font-bold text-white shadow-float motion-safe:animate-pulse-core">
        IA
      </div>

      {/* 03. Décider : le dashboard, interactif. */}
      <div
        className="relative flex w-full flex-col sm:absolute sm:bottom-0 sm:right-0 sm:w-[90%] gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_24px_60px_-24px_rgb(24_35_56/0.35)] motion-safe:animate-rise"
        style={delay(500)}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => {
          setPaused(false);
          setLit(null);
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-900">Tableau de bord des ventes</p>
            <p className="truncate text-[11px] text-slate-500" aria-live="polite">
              {period}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-mint px-2 py-0.5 text-[10px] font-semibold text-success-strong">Chiffres vérifiés</span>
        </div>

        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${keys.length}, minmax(0, 1fr))` }}>
          {keys.map((k) => (
            <Kpi key={k} k={k} figures={figures} previous={previous} animate={animate} lit={lit === k} onLight={(on) => setLit(on ? k : null)} />
          ))}
        </div>

        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
          <div className={`rounded-xl border p-2.5 transition-colors duration-200 ${lit === "revenue" ? "border-brand-300 bg-brand-50/60" : "border-slate-200"}`}>
            <div className="flex h-24 items-end gap-1" role="group" aria-label="Chiffre d'affaires par mois">
              {months.map((m, i) => (
                <button
                  key={m.label}
                  type="button"
                  aria-label={`${m.label} : ${FORMAT.revenue(m.revenue)}`}
                  aria-pressed={i === current}
                  onMouseEnter={() => choose(i)}
                  onFocus={() => choose(i)}
                  onClick={() => choose(i)}
                  className="group relative h-full flex-1 focus-visible:outline-none"
                >
                  <span
                    className={`absolute inset-x-0 bottom-0 origin-bottom rounded-t transition-[filter,opacity] duration-200 motion-safe:animate-grow ${
                      current === -1 || i === current ? "opacity-100" : "opacity-45"
                    } ${i === current ? "bg-gradient-to-t from-accent-600 to-accent-500 brightness-110" : "bg-gradient-to-t from-brand-800 to-accent-500"} group-focus-visible:ring-2 group-focus-visible:ring-brand-800`}
                    style={{ height: `${Math.max(8, (m.revenue / max) * 100)}%`, ...delay(800 + i * 45) }}
                  />
                  {i === current && (
                    <span className={`pointer-events-none absolute -top-7 z-10 whitespace-nowrap rounded-md bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white ${i < 2 ? "left-0" : i > months.length - 3 ? "right-0" : "left-1/2 -translate-x-1/2"}`}>
                      {FORMAT.revenue(m.revenue)}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div aria-hidden="true" className="mt-1 flex gap-1 text-[8px] text-slate-500">
              {months.map((m) => (
                <span key={m.label} className="flex-1 text-center">
                  {m.short}
                </span>
              ))}
            </div>
          </div>
          <div aria-hidden="true" className="hidden size-24 place-items-center rounded-full motion-safe:animate-rise sm:grid" style={{ background: `conic-gradient(${arcs.join(",")})`, ...delay(1100) }}>
            <span className="size-12 rounded-full bg-white" />
          </div>
        </div>

        <p className="min-h-8 text-[11px] leading-snug text-slate-600">
          <strong className="text-accent-700">Pourquoi ça bouge ?</strong>{" "}
          {gap === null
            ? "Lisio isole les catégories qui expliquent une hausse ou une baisse, chiffres vérifiés par le moteur de calcul."
            : `${figures.label} : chiffre d'affaires ${gap >= 0 ? "en hausse" : "en baisse"} de ${one.format(Math.abs(gap))} % par rapport à ${previous!.label.toLowerCase()}. Lisio isole les catégories qui l'expliquent.`}
        </p>
      </div>
    </div>
  );
}
