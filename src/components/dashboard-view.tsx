"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { ComputedChart, InsightStatus } from "@/lib/engine/compute";
import { formatPeriod, formatValue } from "@/lib/format";
import type { DashboardResult } from "@/lib/pipeline";
import { allowedChartTypes, analysisView, chartSizeOf, chartTypeOf, moveChart, orderCharts, type ChartSize, EMPTY_VIEW, ViewSchema, visibleData, type ChartType, type ViewState } from "@/lib/view";
import { AnalysisPanel } from "./analysis-panel";
import { ExportActions } from "./export-actions";
import { ActiveFilters } from "./filters-bar";
import { describeFilters, isFiltered } from "@/lib/filters";

const PALETTE = ["#0d5c70", "#3b8ea5", "#7fb7c7", "#c08a3e", "#8c6bb1", "#5f8f5a", "#b5545c"];

const STATUS: Record<InsightStatus, { label: string; className: string }> = {
  verified: { label: "Chiffres vérifiés", className: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  mismatch: { label: "À vérifier", className: "bg-red-50 text-red-800 ring-red-200" },
  unverified: { label: "Chiffres non sourcés", className: "bg-amber-50 text-amber-800 ring-amber-200" },
  qualitative: { label: "Sans chiffre", className: "bg-slate-100 text-slate-700 ring-slate-200" },
};

export function DashboardView({
  result,
  base = result,
  dashboardId,
  exportable = false,
  children,
}: {
  result: DashboardResult;
  /** Dashboard enregistré (non filtré), auquel se rapportent les exports Excel et CSV. */
  base?: DashboardResult;
  dashboardId?: string | null;
  exportable?: boolean;
  /** Outils affichés sous le titre (fichier source, filtres, questions). */
  children?: ReactNode;
}) {
  const [view, setView] = useDashboardView(dashboardId);
  const [customizing, setCustomizing] = useState(false);
  const hiddenKpis = new Set(view.hiddenKpis);
  const hiddenCharts = new Set(view.hiddenCharts);
  const kpis = result.kpis.filter((k) => !hiddenKpis.has(k.id));
  const charts = result.charts.filter((c) => !hiddenCharts.has(c.id));
  const hasAnalysis = !!result.analysis && (result.analysis.variations.length > 0 || result.analysis.notes.length > 0);
  const maskedCount =
    view.hiddenKpis.length + view.hiddenCharts.length +
    [view.hideInsights, view.hideAnalysis, view.hideExplanations, view.hideSuggestions].filter(Boolean).length +
    Object.values(view.hiddenCategories).reduce((n, l) => n + l.length, 0);
  const periodLabel = result.period ? (result.period.from === result.period.to ? formatPeriod(result.period.from) : `${formatPeriod(result.period.from)} → ${formatPeriod(result.period.to)}`) : "Pas de colonne de date";
  const filtersLabel = result.filters && isFiltered(result.filters) ? describeFilters(result.filters, formatPeriod).join(" · ") : "Aucun (toutes les lignes)";
  const compactLayout = view.layout === "compact";
  const orderedIds = orderCharts(result.charts, view).map((c) => c.id);
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <div id="dashboard-print-root" className={`flex flex-col ${compactLayout ? "gap-3" : "gap-6"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className={`font-semibold tracking-tight text-slate-900 ${compactLayout ? "text-xl" : "text-2xl"}`}>{result.title}</h2>
        <p className="text-sm text-slate-500">
          {result.fileName} · {result.profile.rowCount.toLocaleString("fr-FR")} lignes{result.period && ` · ${periodLabel}`}
        </p>
      </div>

      {children}
      <ActiveFilters filters={result.filters} />
      {exportable && result.filters && (
        <p className="text-xs text-slate-500 print:hidden">
          Le PDF reprend la vue filtrée ; les téléchargements Excel et CSV portent sur le dashboard complet.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <ExportActions dashboardId={exportable ? dashboardId : null} view={view} base={base} onPrintOnePage={printOnePage} />
        <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Mise en page" className="inline-flex overflow-hidden rounded-lg border border-slate-300 text-sm">
          {(
            [
              ["standard", "Standard"],
              ["compact", "Compacte"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={view.layout === value}
              onClick={() => setView({ ...view, layout: value })}
              className={`px-3 py-1.5 font-medium ${view.layout === value ? "bg-teal-800 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-expanded={customizing}
          onClick={() => setCustomizing((v) => !v)}
          className="rounded-lg border border-teal-800 bg-white px-3 py-1.5 text-sm font-medium text-teal-900 hover:bg-teal-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800"
        >
          Personnaliser l&apos;affichage{maskedCount > 0 && ` · ${maskedCount} élément(s) masqué(s)`}
        </button>
        </div>
      </div>

      {customizing && (
        <section aria-label="Personnaliser l'affichage" className="flex flex-col gap-4 rounded-xl border border-teal-200 bg-teal-50/40 p-4 print:hidden">
          <p className="text-sm text-slate-700">
            Cochez ce que vous voulez voir. Les valeurs ne changent pas : les éléments décochés sont seulement masqués, à l&apos;écran comme dans les
            téléchargements (PDF, Excel, CSV). Les catégories de chaque graphique se choisissent depuis le graphique.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <CheckGroup
              legend="Indicateurs"
              items={result.kpis.map((k) => ({ id: k.id, label: k.label, checked: !hiddenKpis.has(k.id) }))}
              onToggle={(id) => setView({ ...view, hiddenKpis: toggle(view.hiddenKpis, id) })}
              onAll={(on) => setView({ ...view, hiddenKpis: on ? [] : result.kpis.map((k) => k.id) })}
            />
            <CheckGroup
              legend="Graphiques"
              groups={groupCharts(result.charts).map((g) => ({ title: g.title, ids: g.charts.map((c) => c.id) }))}
              items={result.charts.map((c) => ({ id: c.id, label: c.title, checked: !hiddenCharts.has(c.id) }))}
              onToggle={(id) => setView({ ...view, hiddenCharts: toggle(view.hiddenCharts, id) })}
              onAll={(on) => setView({ ...view, hiddenCharts: on ? [] : result.charts.map((c) => c.id) })}
              onGroup={(ids, on) =>
                setView({ ...view, hiddenCharts: on ? view.hiddenCharts.filter((x) => !ids.includes(x)) : [...new Set([...view.hiddenCharts, ...ids])] })
              }
            />
            <CheckGroup
              legend="Sections"
              items={[
                ...(result.insights.length > 0 ? [{ id: "insights", label: "Constats", checked: !view.hideInsights }] : []),
                ...(hasAnalysis
                  ? [
                      { id: "analysis", label: "Analyse des variations", checked: !view.hideAnalysis },
                      { id: "explanations", label: "Explications (constats et hypothèses)", checked: !view.hideExplanations, disabled: view.hideAnalysis, indent: true },
                      { id: "suggestions", label: "Pistes d'amélioration (suggestions)", checked: !view.hideSuggestions, disabled: view.hideAnalysis, indent: true },
                    ]
                  : []),
              ]}
              onToggle={(id) => setView({ ...view, [SECTION_FLAG[id]]: !view[SECTION_FLAG[id]] })}
              onAll={(on) => setView({ ...view, hideInsights: !on, hideAnalysis: !on, hideExplanations: !on, hideSuggestions: !on })}
            />
          </div>
          <div>
            <button type="button" onClick={() => setView(EMPTY_VIEW)} className="text-sm font-medium text-teal-900 underline">
              Tout réafficher
            </button>
          </div>
        </section>
      )}

      {kpis.length > 0 && (
        <section
          aria-label="Indicateurs clés"
          className={`kpi-grid ${compactLayout ? "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" : "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"}`}
        >
          {kpis.map((k) => (
            <article key={k.id} className={`group relative rounded-xl border border-slate-200 bg-white print:break-inside-avoid ${compactLayout ? "p-2.5" : "p-4"}`}>
              <HideButton label={`Masquer l'indicateur ${k.label}`} onClick={() => setView({ ...view, hiddenKpis: [...view.hiddenKpis, k.id] })} />
              <p className="pr-6 text-sm font-medium text-slate-600">{k.label}</p>
              <p className={`mt-1 font-semibold tabular-nums text-slate-900 ${compactLayout ? "text-lg" : "text-2xl"}`}>{formatValue(k.value, k.format)}</p>
              {k.value === null && <p className="mt-1 text-xs text-amber-800">Donnée indisponible : aucune valeur exploitable, rien n&apos;est estimé.</p>}
              {!compactLayout && <p className="mt-2 text-xs text-slate-500">{k.description}</p>}
              {compactLayout && k.quality && (
                <p className="mt-0.5 text-[11px] text-amber-800" title={k.quality.map((q) => `${q.missing} ligne(s) sans valeur pour « ${q.column} »`).join(" ; ")}>
                  ⚠ {k.quality.reduce((n, q) => n + q.missing, 0)} valeur(s) manquante(s) ignorée(s)
                </p>
              )}
              {!compactLayout && k.quality?.map((q) => (
                <p key={q.column} className="mt-1 text-xs text-amber-800">
                  {q.missing.toLocaleString("fr-FR")} ligne(s) sans valeur exploitable pour « {q.column} »
                  {q.invalid > 0 && ` (dont ${q.invalid.toLocaleString("fr-FR")} non conforme(s))`}, ignorée(s) dans le calcul.
                </p>
              ))}
              {/* Dans le PDF, le calcul est affiché en clair à la place du lien. */}
              <p className="mt-2 hidden font-mono text-[11px] text-slate-600 print:block">Calcul : {k.formula}</p>
              <details className="mt-2 text-xs text-slate-500 print:hidden">
                <summary className="cursor-pointer text-teal-800">Comment est-il calculé ?</summary>
                <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 rounded bg-slate-50 px-2 py-1.5 text-slate-700">
                  <dt className="font-medium">Définition</dt>
                  <dd>{k.description}</dd>
                  <dt className="font-medium">Formule</dt>
                  <dd className="font-mono text-[11px]">{k.formula}</dd>
                  <dt className="font-medium">Période</dt>
                  <dd>{periodLabel}</dd>
                  <dt className="font-medium">Filtres</dt>
                  <dd>{filtersLabel}</dd>
                  <dt className="font-medium">Lignes</dt>
                  <dd>
                    {result.profile.rowCount.toLocaleString("fr-FR")} ligne(s) de {result.fileName}
                  </dd>
                  <dt className="font-medium">Source</dt>
                  <dd>Calculé par le moteur sur les données importées ; l&apos;IA ne fournit aucune valeur.</dd>
                </dl>
              </details>
            </article>
          ))}
        </section>
      )}

      {!view.hideInsights && result.insights.length > 0 && (
        <section aria-label="Constats" className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-base font-semibold text-slate-900">Constats</h3>
          <ul className="mt-3 flex flex-col gap-3">
            {result.insights.map((insight, i) => (
              <li key={i} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
                <span className={`inline-flex w-fit shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${STATUS[insight.status].className}`}>
                  {STATUS[insight.status].label}
                </span>
                <div className="min-w-0 text-sm text-slate-800">
                  {insight.text}
                  {insight.details.length > 0 && <p className="mt-1 text-xs text-red-700">{insight.details.join(" ")}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!view.hideAnalysis && hasAnalysis && result.analysis && (
        <Collapsible enabled={compactLayout} summary={`Analyse des variations (${result.analysis.variations.length})`}>
          <AnalysisPanel analysis={analysisView(result.analysis, view)} dashboardId={dashboardId} />
        </Collapsible>
      )}

      {groupCharts(orderCharts(charts, view)).map((group) => {
        const siblings = group.charts.map((c) => c.id);
        return (
          <section key={group.title} aria-label={group.title} className={`flex flex-col ${compactLayout ? "gap-2" : "gap-3"}`}>
            <h3 className={`font-semibold uppercase tracking-wide text-slate-500 ${compactLayout ? "text-xs" : "text-sm"}`}>{group.title}</h3>
            <div className={`chart-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 ${compactLayout ? "gap-2" : "gap-3"}`}>
              {group.charts.map((c, i) => (
                <ChartCard
                  key={c.id}
                  chart={c}
                  view={view}
                  size={chartSizeOf(c.id, view)}
                  collapsed={view.collapsedCharts.includes(c.id)}
                  compactLayout={compactLayout}
                  onHide={() => setView({ ...view, hiddenCharts: [...view.hiddenCharts, c.id] })}
                  onType={(type) => setView({ ...view, chartTypes: { ...view.chartTypes, [c.id]: type } })}
                  onCategories={(hidden) => setView({ ...view, hiddenCategories: { ...view.hiddenCategories, [c.id]: hidden } })}
                  onSize={(size) => setView({ ...view, chartSizes: { ...view.chartSizes, [c.id]: size } })}
                  onCollapse={() => setView({ ...view, collapsedCharts: toggle(view.collapsedCharts, c.id) })}
                  onMove={(direction) => setView({ ...view, chartOrder: moveChart(orderedIds, siblings, c.id, direction) })}
                  canMoveBack={i > 0}
                  canMoveForward={i < group.charts.length - 1}
                />
              ))}
            </div>
          </section>
        );
      })}

      {kpis.length === 0 && charts.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600">
          Tous les indicateurs et graphiques sont masqués.{" "}
          <button type="button" onClick={() => setView(EMPTY_VIEW)} className="font-medium text-teal-900 underline">
            Tout réafficher
          </button>
        </p>
      )}

      {result.issues.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 print:hidden">
          <h3 className="font-semibold">Éléments proposés par l&apos;IA et écartés par le contrôle</h3>
          <ul className="mt-2 list-disc pl-5">
            {result.issues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** En mise en page compacte, une section longue se replie : un clic l'ouvre. */
function Collapsible({ enabled, summary, children }: { enabled: boolean; summary: string; children: ReactNode }) {
  if (!enabled) return <>{children}</>;
  return (
    <details className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <summary className="cursor-pointer text-sm font-semibold text-slate-800">{summary}</summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

// Largeur et hauteur imprimables d'une page A4 paysage (marges de 8 mm), en pixels CSS.
const PAGE_WIDTH = 1062;
const PAGE_HEIGHT = 733;

/**
 * PDF sur une seule page : le dashboard est mis en page à la largeur d'une A4 paysage, puis réduit
 * à l'échelle pour que toute sa hauteur tienne sur la page. Rien n'est coupé ni masqué.
 */
function printOnePage() {
  const root = document.getElementById("dashboard-print-root");
  if (!root) return window.print();
  const style = document.createElement("style");
  // La grille est fixée explicitement : la largeur d'une page imprimée ne doit pas changer le nombre de colonnes.
  style.textContent = `#dashboard-print-root.one-page .chart-grid { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; }
#dashboard-print-root.one-page .kpi-grid { grid-template-columns: repeat(6, minmax(0, 1fr)) !important; }
#dashboard-print-root.one-page .span-s { grid-column: span 1 / span 1 !important; }
#dashboard-print-root.one-page .span-m { grid-column: span 2 / span 2 !important; }
#dashboard-print-root.one-page .span-l { grid-column: 1 / -1 !important; }
@page { size: A4 landscape; margin: 8mm; }
@media print {
  body * { visibility: hidden !important; }
  #dashboard-print-root, #dashboard-print-root * { visibility: visible !important; }
  #dashboard-print-root .recharts-tooltip-wrapper, #dashboard-print-root .recharts-tooltip-wrapper * { visibility: hidden !important; }
  html, body { height: ${PAGE_HEIGHT}px !important; overflow: hidden !important; }
  #dashboard-print-root { position: absolute; left: 0; top: 0; }
}`;
  document.head.appendChild(style);
  const previous = { width: root.style.width, zoom: root.style.zoom };
  root.style.width = `${PAGE_WIDTH}px`;
  root.classList.add("one-page");
  const restore = () => {
    root.classList.remove("one-page");
    root.style.width = previous.width;
    root.style.zoom = previous.zoom;
    style.remove();
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);
  const wait = () => new Promise((resolve) => window.setTimeout(resolve, 350));
  const contentHeight = () =>
    Math.max(
      1,
      [...root.children].reduce((h, el) => (getComputedStyle(el).display === "none" ? h : Math.max(h, (el as HTMLElement).offsetTop + (el as HTMLElement).offsetHeight)), 0) -
        root.offsetTop,
    );
  // Deux passes : mesure à la largeur de la page, puis mise en page élargie dans les proportions de la page
  // pour en occuper toute la largeur une fois réduite. Les graphiques se redessinent entre les deux mesures.
  void (async () => {
    await wait();
    let scale = Math.min(1, PAGE_HEIGHT / contentHeight());
    if (scale < 1) {
      const width = PAGE_WIDTH / scale;
      root.style.width = `${width}px`;
      await wait();
      scale = Math.min(PAGE_WIDTH / width, PAGE_HEIGHT / contentHeight());
    }
    // En dessous de 45 %, le texte devient illisible : on prévient avant d'imprimer.
    if (
      scale < 0.45 &&
      !window.confirm(
        `Pour tenir sur une page, le dashboard serait réduit à ${Math.round(scale * 100)} % et difficile à lire.\n\nConseil : passez en mise en page compacte, réduisez ou masquez des graphiques.\n\nImprimer quand même ?`,
      )
    ) {
      restore();
      return;
    }
    root.style.zoom = String(scale);
    window.print();
  })();
}

// Sélection mémorisée par dashboard dans ce navigateur : simple confort, l'affichage reste complet
// si le stockage est indisponible (navigation privée, données bloquées).
const storageListeners = new Set<() => void>();
function subscribeStorage(listener: () => void) {
  storageListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    storageListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readStored(key: string | null): string | null {
  try {
    return key ? window.localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function useDashboardView(dashboardId?: string | null): [ViewState, (v: ViewState) => void] {
  const key = dashboardId ? `dashboards-ia:vue:${dashboardId}` : null;
  const [local, setLocal] = useState<ViewState>(EMPTY_VIEW);
  const raw = useSyncExternalStore(subscribeStorage, () => readStored(key), () => null);
  const stored = useMemo(() => {
    if (raw === null) return null;
    try {
      const parsed = ViewSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }, [raw]);
  const setView = (v: ViewState) => {
    setLocal(v);
    try {
      if (key) {
        window.localStorage.setItem(key, JSON.stringify(v));
        storageListeners.forEach((l) => l());
      }
    } catch {
      // Sans stockage, la sélection vaut pour la page en cours uniquement.
    }
  };
  return [stored ?? local, setView];
}

type CheckItem = { id: string; label: string; checked: boolean; disabled?: boolean; indent?: boolean };

function CheckGroup({
  legend,
  items,
  groups,
  onToggle,
  onAll,
  onGroup,
}: {
  legend: string;
  items: CheckItem[];
  /** Sous-groupes facultatifs (ex. graphiques par section), chacun cochable d'un coup. */
  groups?: { title: string; ids: string[] }[];
  onToggle: (id: string) => void;
  onAll: (on: boolean) => void;
  onGroup?: (ids: string[], on: boolean) => void;
}) {
  if (items.length === 0) return null;
  const byId = new Map(items.map((i) => [i.id, i]));
  return (
    <fieldset className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
      <legend className="px-1 text-sm font-semibold text-slate-900">{legend}</legend>
      <div className="mb-2 flex gap-3 text-xs">
        <button type="button" onClick={() => onAll(true)} className="text-teal-900 underline">
          Tout cocher
        </button>
        <button type="button" onClick={() => onAll(false)} className="text-teal-900 underline">
          Tout décocher
        </button>
      </div>
      {groups && onGroup ? (
        <div className="flex max-h-80 flex-col gap-3 overflow-y-auto pr-1">
          {groups.map((g) => {
            const groupItems = g.ids.map((id) => byId.get(id)).filter((x): x is CheckItem => !!x);
            const allOn = groupItems.every((x) => x.checked);
            return (
              <div key={g.title}>
                <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <input type="checkbox" checked={allOn} onChange={() => onGroup(g.ids, !allOn)} className="size-3.5 accent-teal-800" />
                  {g.title}
                </label>
                <CheckList items={groupItems} onToggle={onToggle} />
              </div>
            );
          })}
        </div>
      ) : (
        <CheckList items={items} onToggle={onToggle} />
      )}
    </fieldset>
  );
}

function CheckList({ items, onToggle }: { items: CheckItem[]; onToggle: (id: string) => void }) {
  return (
    <ul className="mt-1 flex flex-col gap-1.5">
      {items.map((item) => (
        <li key={item.id} className={item.indent ? "pl-6" : undefined}>
          <label className={`flex items-start gap-2 text-sm ${item.disabled ? "cursor-not-allowed text-slate-400" : "cursor-pointer text-slate-800"}`}>
            <input
              type="checkbox"
              checked={item.checked && !item.disabled}
              disabled={item.disabled}
              onChange={() => onToggle(item.id)}
              className="mt-0.5 size-4 accent-teal-800"
            />
            <span className="min-w-0">{item.label}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

/** Sections de graphiques : évolutions dans le temps d'abord, puis une section par dimension. */
function groupCharts(charts: ComputedChart[]): { title: string; charts: ComputedChart[] }[] {
  const groups = new Map<string, ComputedChart[]>();
  for (const c of charts) {
    const title = c.chronological ? "Évolutions dans le temps" : c.dimension ? `Par ${c.dimension}` : "Graphiques";
    groups.set(title, [...(groups.get(title) ?? []), c]);
  }
  return [...groups].map(([title, list]) => ({ title, charts: list })).sort((a, b) => Number(b.title.startsWith("Évolutions")) - Number(a.title.startsWith("Évolutions")));
}

function HideButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="absolute right-2 top-2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-800 print:hidden"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
      </svg>
    </button>
  );
}

const SECTION_FLAG: Record<string, "hideInsights" | "hideAnalysis" | "hideExplanations" | "hideSuggestions"> = {
  insights: "hideInsights",
  analysis: "hideAnalysis",
  explanations: "hideExplanations",
  suggestions: "hideSuggestions",
};

const TYPE_LABEL: Record<ChartType, string> = { bar: "Barres", line: "Courbe", pie: "Secteurs", table: "Tableau" };

const SIZE_LABEL: Record<ChartSize, string> = { s: "Petit", m: "Moyen", l: "Grand" };
/** Largeur dans la grille de 4 colonnes : petit = 1, moyen = 2, grand = toute la ligne. */
const SPAN: Record<ChartSize, string> = { s: "span-s", m: "span-m sm:col-span-2", l: "span-l col-span-full" };
const BASE_HEIGHT: Record<ChartSize, number> = { s: 190, m: 250, l: 300 };

const iconButton =
  "inline-flex size-6 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-800";

// Graphiques sans animation : l'impression (export PDF) capture toujours le graphique complet.
function ChartCard({
  chart,
  view,
  size,
  collapsed,
  compactLayout,
  onHide,
  onType,
  onCategories,
  onSize,
  onCollapse,
  onMove,
  canMoveBack,
  canMoveForward,
}: {
  chart: ComputedChart;
  view: ViewState;
  size: ChartSize;
  collapsed: boolean;
  compactLayout: boolean;
  onHide: () => void;
  onType: (type: ChartType) => void;
  onCategories: (hidden: string[]) => void;
  onSize: (size: ChartSize) => void;
  onCollapse: () => void;
  onMove: (direction: -1 | 1) => void;
  canMoveBack: boolean;
  canMoveForward: boolean;
}) {
  const type = chartTypeOf(chart, view);
  const hidden = new Set(view.hiddenCategories[chart.id] ?? []);
  const data = visibleData(chart, view).map((d) => ({ ...d, label: chart.chronological ? formatPeriod(d.category) : d.category }));
  const total = data.reduce((sum, d) => sum + (d.value ?? 0), 0);
  const fmt = (v: unknown) => formatValue(typeof v === "number" ? v : null, chart.format);
  const share = (v: unknown) => (typeof v === "number" && total > 0 ? ` (${Math.round((v / total) * 1000) / 10} %)` : "");
  const compact = (v: number) =>
    new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 }).format(chart.format === "percent" ? v * 100 : v);
  const toggleCategory = (category: string) => onCategories(hidden.has(category) ? [...hidden].filter((x) => x !== category) : [...hidden, category]);
  // Catégories masquées présentes dans les données affichées (une vue filtrée peut en exclure).
  const hiddenCount = chart.data.filter((d) => hidden.has(d.category)).length;

  const small = size === "s" || compactLayout;
  const height = Math.round(BASE_HEIGHT[size] * (compactLayout ? 0.8 : 1));
  const font = small ? 10 : 11;
  // Barres horizontales : une ligne par catégorie, plus serrée sur un petit graphique.
  const barHeight = Math.max(height, data.length * (small ? 20 : 30) + 30);
  const labelWidth = size === "s" ? 90 : size === "m" ? 130 : 160;
  const top = [...data].filter((d) => d.value !== null).slice(0, 3);

  return (
    <article
      className={`group relative min-w-0 rounded-xl border border-slate-200 bg-white print:break-inside-avoid ${compactLayout ? "p-2.5" : "p-3.5"} ${SPAN[size]} ${collapsed ? "self-start" : ""}`}
    >
      <div>
        <h3 className={`min-w-0 font-semibold text-slate-900 ${small ? "text-sm" : "text-base"}`} title={chart.formula}>
          {chart.title}
        </h3>
        {/* Commandes de disposition : visibles au survol ou au clavier, toujours visibles sur écran tactile. */}
        <div
          className="absolute right-1.5 top-1.5 z-10 flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white/95 px-1 py-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100 print:hidden"
          role="group"
          aria-label={`Disposition de ${chart.title}`}
        >
          <button type="button" className={iconButton} disabled={!canMoveBack} onClick={() => onMove(-1)} aria-label="Déplacer avant" title="Déplacer avant">
            ‹
          </button>
          <button type="button" className={iconButton} disabled={!canMoveForward} onClick={() => onMove(1)} aria-label="Déplacer après" title="Déplacer après">
            ›
          </button>
          <span className="mx-0.5 inline-flex overflow-hidden rounded border border-slate-200" role="group" aria-label="Taille">
            {(["s", "m", "l"] as const).map((x) => (
              <button
                key={x}
                type="button"
                aria-pressed={x === size}
                title={`Taille : ${SIZE_LABEL[x]}`}
                onClick={() => onSize(x)}
                className={`px-1.5 text-[11px] font-semibold ${x === size ? "bg-teal-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}
              >
                {x.toUpperCase()}
              </button>
            ))}
          </span>
          <button type="button" className={iconButton} onClick={onCollapse} aria-expanded={!collapsed} aria-label={collapsed ? "Agrandir" : "Réduire"} title={collapsed ? "Agrandir" : "Réduire"}>
            {collapsed ? "▸" : "▾"}
          </button>
          <button type="button" className={iconButton} onClick={onHide} aria-label={`Masquer le graphique ${chart.title}`} title="Masquer">
            ×
          </button>
        </div>
      </div>
      {!compactLayout && (
        <p className="mt-0.5 text-xs text-slate-500">
          {chart.formula}
          {chart.othersCount > 0 && ` · ${chart.othersCount} autre(s) catégorie(s) non affichée(s)`}
          {hiddenCount > 0 && ` · ${hiddenCount} catégorie(s) masquée(s)`}
        </p>
      )}

      {collapsed ? (
        <p className="mt-1 text-xs text-slate-600">
          {top.length === 0 ? "Aucune donnée." : top.map((d) => `${d.label} : ${fmt(d.value)}`).join(" · ")}
          {data.length > top.length && " …"}
        </p>
      ) : (
        <>
          <details className="mt-1 text-xs print:hidden">
            <summary className="cursor-pointer text-slate-500 hover:text-slate-800">Options</summary>
            <div className="mt-1.5 flex flex-wrap items-start gap-2">
              <div role="group" aria-label="Type de graphique" className="inline-flex overflow-hidden rounded-lg border border-slate-200">
                {allowedChartTypes(chart).map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={t === type}
                    onClick={() => onType(t)}
                    className={`px-2 py-0.5 font-medium ${t === type ? "bg-teal-800 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
                  >
                    {TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
              {chart.data.length > 1 && (
                <details className="min-w-0">
                  <summary className="cursor-pointer rounded-lg border border-slate-200 px-2 py-0.5 font-medium text-slate-700 hover:bg-slate-50">
                    {chart.chronological ? "Périodes" : "Catégories"} : {chart.data.length - hiddenCount}/{chart.data.length}
                  </summary>
                  <div className="mt-1.5 rounded-lg border border-slate-200 bg-white p-2">
                    <div className="mb-1.5 flex gap-3">
                      <button type="button" onClick={() => onCategories([])} className="text-teal-900 underline">
                        Tout cocher
                      </button>
                      <button type="button" onClick={() => onCategories(chart.data.map((d) => d.category))} className="text-teal-900 underline">
                        Tout décocher
                      </button>
                    </div>
                    <ul className="grid max-h-48 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
                      {chart.data.map((d) => (
                        <li key={d.category}>
                          <label className="flex cursor-pointer items-center gap-2 text-slate-800">
                            <input type="checkbox" checked={!hidden.has(d.category)} onChange={() => toggleCategory(d.category)} className="size-3.5 accent-teal-800" />
                            <span className="truncate">{chart.chronological ? formatPeriod(d.category) : d.category}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                </details>
              )}
            </div>
          </details>

          <div className="mt-2">
            {data.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                {chart.data.length === 0 ? "Pas assez de données pour ce graphique." : "Aucune catégorie cochée."}
              </p>
            ) : type === "table" ? (
              <div className="overflow-x-auto" style={{ maxHeight: barHeight }}>
                <table className={`w-full ${small ? "text-xs" : "text-sm"}`}>
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                      <th className="py-1 pr-3 font-medium">{chart.chronological ? "Période" : "Catégorie"}</th>
                      <th className="py-1 pr-3 text-right font-medium">{chart.measureLabel}</th>
                      {chart.format !== "percent" && total > 0 && <th className="py-1 text-right font-medium">Part</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((d) => (
                      <tr key={d.category} className="border-b border-slate-100 last:border-0">
                        <td className="py-1 pr-3 text-slate-700">{d.label}</td>
                        <td className="py-1 pr-3 text-right tabular-nums text-slate-900">{fmt(d.value)}</td>
                        {chart.format !== "percent" && total > 0 && (
                          <td className="py-1 text-right tabular-nums text-slate-600">{d.value !== null ? `${Math.round((d.value / total) * 1000) / 10} %` : "—"}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ height: type === "bar" && !chart.chronological ? barHeight : height }}>
                <ResponsiveContainer width="100%" height="100%">
                  {type === "line" ? (
                    <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: font, fill: "#64748b" }} tickLine={false} minTickGap={8} />
                      <YAxis tickFormatter={compact} tick={{ fontSize: font, fill: "#64748b" }} tickLine={false} axisLine={false} width={small ? 38 : 48} />
                      <Tooltip formatter={(v) => [fmt(v), chart.measureLabel]} />
                      <Line type="monotone" dataKey="value" stroke={PALETTE[0]} strokeWidth={2} dot={{ r: small ? 2 : 3 }} isAnimationActive={false} />
                    </LineChart>
                  ) : type === "pie" ? (
                    <PieChart>
                      <Tooltip formatter={(v) => [`${fmt(v)}${share(v)}`, chart.measureLabel]} />
                      <Legend verticalAlign="bottom" iconType="circle" iconSize={small ? 8 : 10} wrapperStyle={{ fontSize: small ? 10 : 12 }} />
                      <Pie data={data} dataKey="value" nameKey="label" innerRadius="45%" outerRadius="75%" paddingAngle={2} isAnimationActive={false}>
                        {data.map((d, i) => (
                          <Cell key={d.category} fill={PALETTE[i % PALETTE.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  ) : chart.chronological ? (
                    <BarChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: font, fill: "#64748b" }} tickLine={false} minTickGap={8} />
                      <YAxis tickFormatter={compact} tick={{ fontSize: font, fill: "#64748b" }} tickLine={false} axisLine={false} width={small ? 38 : 48} />
                      <Tooltip formatter={(v) => [fmt(v), chart.measureLabel]} />
                      <Bar dataKey="value" fill={PALETTE[0]} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  ) : (
                    <BarChart data={data} layout="vertical" margin={{ top: 0, right: small ? 40 : 56, bottom: 0, left: 0 }}>
                      <CartesianGrid stroke="#e2e8f0" horizontal={false} />
                      <XAxis type="number" tickFormatter={compact} tick={{ fontSize: font, fill: "#64748b" }} tickLine={false} />
                      <YAxis type="category" dataKey="label" width={labelWidth} tick={{ fontSize: font, fill: "#334155" }} tickLine={false} axisLine={false} />
                      <Tooltip formatter={(v) => [`${fmt(v)}${share(v)}`, chart.measureLabel]} />
                      <Bar dataKey="value" fill={PALETTE[0]} radius={[0, 4, 4, 0]} isAnimationActive={false}>
                        <LabelList dataKey="value" position="right" formatter={(v: unknown) => (typeof v === "number" ? compact(v) : "")} style={{ fontSize: font, fill: "#334155" }} />
                      </Bar>
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </>
      )}
    </article>
  );
}
