"use client";

import { useState } from "react";
import { formatValue } from "@/lib/format";
import type { Recommendation } from "@/lib/recommendations/types";
import type { ShrinkageReport } from "@/lib/shrinkage";
import type { ShrinkagePart } from "@/lib/view";

const pct = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 1 });
const euros = (v: number | null) => formatValue(v, "currency");
const card = "flex min-w-0 flex-col gap-3 rounded-[var(--radius-card)] border border-slate-200 bg-white p-4 shadow-card print:break-inside-avoid print:shadow-none";
const title = "font-display text-lg font-bold text-slate-900";
const ARTICLES_SHOWN = 5;

/**
 * Carte « Chiffre perdu » en tête des indicateurs : la perte réelle (motifs de perte uniquement), en euros positifs,
 * et sa part du chiffre d'affaires. Remplace le ratio brut démarque / CA, qui mélange pertes et corrections de stock.
 */
export function LostSalesCard({ report, hidden }: { report: ShrinkageReport; hidden: ShrinkagePart[] }) {
  const main = report.lostSales ?? report.lostCost;
  return (
    <article className="relative col-span-2 flex flex-col rounded-[var(--radius-card)] border border-red-200 bg-red-50 p-4 @3xl:col-span-1 shadow-card print:break-inside-avoid print:shadow-none">
      <p className="text-sm font-semibold text-red-900">{report.lostSales !== null ? "Chiffre perdu en démarque" : "Marchandise perdue"}</p>
      <p className="mt-1 text-[2rem] font-bold leading-tight tracking-tight tabular-nums text-red-900">{euros(main)}</p>
      {!hidden.includes("share") && report.sales && <p className="mt-1 text-sm font-medium text-red-900">{pct.format(report.sales.share)} du chiffre d&apos;affaires</p>}
      {!hidden.includes("lostCost") && report.lostSales !== null && report.lostCost !== null && (
        <p className="mt-1 text-xs text-red-900/80">{euros(report.lostCost)} au prix d&apos;achat</p>
      )}
      <p className="mt-2 text-xs text-red-900/70">
        {report.lossTypes.join(", ")} · {report.lines.toLocaleString("fr-FR")} mouvement(s){report.sales ? ` · sur « ${report.sales.column} »` : ""}
      </p>
    </article>
  );
}

function Bars({ rows }: { rows: { label: string; lost: number; share: number }[] }) {
  const max = Math.max(...rows.map((r) => r.lost));
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <li key={r.label} className="flex flex-col gap-1 text-sm">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-slate-800" title={r.label}>
              {r.label}
            </span>
            <span className="flex-none tabular-nums font-semibold text-slate-900">
              {euros(r.lost)} <span className="text-xs font-normal text-slate-500">· {pct.format(r.share)}</span>
            </span>
          </span>
          <span aria-hidden="true" className="h-2 rounded-full bg-slate-100">
            <span className="block h-full rounded-full bg-red-400" style={{ width: `${Math.max(3, (r.lost / max) * 100)}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Cockpit de la démarque : où ça se perd (rayons), pourquoi (motifs), quoi faire cette semaine (recommandations),
 * puis les articles à surveiller. Tout est calculé par le moteur sur les lignes de démarque, sans IA.
 */
export function CockpitSummary({ report, hidden, actions }: { report: ShrinkageReport; hidden: ShrinkagePart[]; actions: Recommendation[] }) {
  const [allItems, setAllItems] = useState(false);
  const show = (part: ShrinkagePart) => !hidden.includes(part);
  const aisles = show("byAisle") ? report.byAisle.slice(0, 6) : [];
  const types = show("byType") ? report.byType : [];
  const todo = actions.slice(0, 3);
  const items = show("items") ? report.items : [];
  const blocks = [aisles.length > 0, types.length > 0, todo.length > 0].filter(Boolean).length;

  return (
    <>
      {blocks > 0 && (
        <section id="demarque" aria-label="Démarque" className={`grid scroll-mt-4 grid-cols-1 gap-3 ${blocks === 3 ? "@2xl:grid-cols-2 @4xl:grid-cols-3" : blocks === 2 ? "@2xl:grid-cols-2" : ""}`}>
          {aisles.length > 0 && (
            <div className={card}>
              <h3 className={title}>Où ça se perd</h3>
              <Bars rows={aisles.map((a) => ({ label: a.aisle, lost: a.lost, share: a.share }))} />
              {report.byAisle.length > aisles.length && <p className="text-xs text-slate-500">Les {aisles.length} rayons qui perdent le plus, sur {report.byAisle.length}.</p>}
            </div>
          )}
          {types.length > 0 && (
            <div className={card}>
              <h3 className={title}>Pourquoi</h3>
              <Bars rows={types.map((t) => ({ label: t.type, lost: t.lost, share: t.share }))} />
            </div>
          )}
          {todo.length > 0 && (
            <div className={`${card} ${blocks === 3 ? "@2xl:col-span-2 @4xl:col-span-1" : ""}`}>
              <h3 className={title}>À faire cette semaine</h3>
              <ul className="flex flex-col gap-3">
                {todo.map((r) => (
                  <li key={r.id} className="flex gap-2.5 text-sm">
                    <span aria-hidden="true" className={`mt-1.5 size-2 flex-none rounded-full ${r.group === "losses" ? "bg-red-400" : "bg-emerald-500"}`} />
                    <span className="min-w-0">
                      <span className="font-semibold text-slate-900">{r.title}</span>
                      <span className="line-clamp-2 block text-slate-600" title={r.action}>{r.action}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <a href="#recommandations" className="mt-auto text-sm font-semibold text-brand-800 underline-offset-4 hover:underline print:hidden">
                Toutes les recommandations
              </a>
            </div>
          )}
        </section>
      )}

      {items.length > 0 && (
        <section id="articles" aria-label="Articles à surveiller" className={`${card} scroll-mt-4`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className={title}>Articles à surveiller</h3>
            {items.length > ARTICLES_SHOWN && (
              <button type="button" onClick={() => setAllItems((v) => !v)} className="text-sm font-semibold text-brand-800 underline-offset-4 hover:underline print:hidden">
                {allItems ? `Voir les ${ARTICLES_SHOWN} premiers` : `Voir les ${items.length}`}
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th scope="col" className="py-2 pr-3 font-semibold">Article</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Rayon</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Motif</th>
                  <th scope="col" className="py-2 text-right font-semibold">Perdu</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={it.item} className={`border-t border-slate-100 ${!allItems && i >= ARTICLES_SHOWN ? "hidden print:table-row" : ""}`}>
                    <td className="py-2 pr-3 font-medium text-slate-900">{it.item}</td>
                    <td className="py-2 pr-3 text-slate-600">{it.aisle ?? "—"}</td>
                    <td className="py-2 pr-3 text-slate-600">{it.mainTypeShare >= 0.995 ? it.mainType : `${pct.format(it.mainTypeShare)} ${it.mainType.toLowerCase()}`}</td>
                    <td className="py-2 text-right font-semibold tabular-nums text-red-900">{euros(it.lost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">
            Calculé par le moteur sur les lignes de démarque, sans IA. Une perte enregistrée en négatif (sortie de stock) est affichée en positif.
          </p>
        </section>
      )}
    </>
  );
}
