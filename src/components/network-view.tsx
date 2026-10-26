"use client";

import { useState } from "react";
import { STORE_HEADER } from "@/lib/combine";
import { gapToAverage, type Comparison } from "@/lib/engine/comparison";
import { formatValue } from "@/lib/format";
import { displayName } from "@/lib/display";

const signed = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1, signDisplay: "exceptZero" });
const gapLabel = (gap: { gap: number; unit: "points" | "percent" }) => (gap.unit === "points" ? `${signed.format(gap.gap * 100)} pts` : `${signed.format(gap.gap * 100)} %`);
const toneOf = (gap: { gap: number } | null) => (!gap || Math.abs(gap.gap) < 0.005 ? "text-slate-500" : gap.gap > 0 ? "text-success-strong" : "text-red-800");
const card = "flex flex-col gap-1.5 rounded-[var(--radius-card)] border bg-white p-5 shadow-card print:break-inside-avoid print:shadow-none";

/** Nom du magasin : bouton qui ouvre son dashboard quand c'est possible. */
function StoreName({ value, onOpen }: { value: string; onOpen?: (store: string) => void }) {
  return onOpen ? (
    <button type="button" onClick={() => onOpen(value)} className="text-left font-semibold text-slate-900 underline-offset-4 hover:text-brand-900 hover:underline">
      {value}
    </button>
  ) : (
    <span className="font-semibold text-slate-900">{value}</span>
  );
}

/** Vue Réseau : seulement quand la comparaison porte sur une colonne magasin (site, agence, point de vente…). */
export function isNetwork(comparison: Comparison | null | undefined): comparison is Comparison {
  return !!comparison && STORE_HEADER.test(comparison.column) && comparison.rows.length >= 2;
}

/**
 * Vue Réseau (directeur multi-sites) : les magasins côte à côte, ceux à regarder en priorité, puis le classement.
 * Chaque chiffre est recalculé par le moteur sur les lignes du magasin ; un clic ouvre le dashboard du magasin.
 */
export function NetworkView({
  comparison,
  hiddenKpis,
  onOpen,
}: {
  comparison: Comparison;
  /** Indicateurs écartés : masqués par l'utilisateur, ou remplacés dans le Cockpit (ratio brut démarque / CA). */
  hiddenKpis: (id: string) => boolean;
  /** Ouvre le dashboard d'un magasin (filtre recalculé) ; absent sans fichier source chargé. */
  onOpen?: (store: string) => void;
}) {
  const metrics = comparison.kpis.map((k, i) => ({ ...k, index: i })).filter((k) => !hiddenKpis(k.id));
  const [leadId, setLeadId] = useState(metrics[0]?.id);
  if (metrics.length === 0) return null;
  const lead = metrics.find((m) => m.id === leadId) ?? metrics[0];
  const rows = [...comparison.rows].sort((a, b) => (b.values[lead.index] ?? -Infinity) - (a.values[lead.index] ?? -Infinity) || a.value.localeCompare(b.value, "fr"));
  const max = Math.max(...rows.map((r) => Math.abs(r.values[lead.index] ?? 0)), 0);
  const store = displayName(comparison.column).toLowerCase();
  const others = metrics.filter((m) => m.id !== lead.id).slice(0, 3);
  // Taux (marge…) : le meilleur mérite d'être montré à part, le plus fort CA ne l'ayant pas forcément.
  const rate = metrics.find((m) => m.format === "percent" && m.id !== lead.id);
  const best = rows[0];
  const worst = rows.at(-1)!;
  const bestRate = rate ? [...rows].sort((a, b) => (b.values[rate.index] ?? -Infinity) - (a.values[rate.index] ?? -Infinity))[0] : null;
  const gapOf = (r: (typeof rows)[number], m: (typeof metrics)[number]) => gapToAverage(r.values[m.index], m.average, m.format);

  return (
    <section id="reseau" aria-label="Réseau" className="flex scroll-mt-4 flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-slate-600">
            {rows.length} {/[sx]$/.test(store) ? store : `${store}s`} comparés
          </p>
          <h3 className="font-display text-2xl font-bold text-slate-900">Vos magasins, côte à côte</h3>
        </div>
        {metrics.length > 1 && (
          <div role="group" aria-label="Classer par" className="inline-flex flex-wrap gap-1 rounded-full border border-slate-200 bg-white p-1 print:hidden">
            {metrics.slice(0, 4).map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={m.id === lead.id}
                onClick={() => setLeadId(m.id)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${m.id === lead.id ? "bg-brand-800 text-white" : "text-slate-700 hover:bg-slate-100"}`}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {best.values[lead.index] !== null && (
        <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-3">
          <div className={`${card} border-slate-200`}>
            <span className="text-sm font-semibold text-success-strong">En tête</span>
            <span className="font-display text-xl font-bold">
              <StoreName value={best.value} onOpen={onOpen} />
            </span>
            <span className="text-sm text-slate-700">
              {formatValue(best.values[lead.index], lead.format)}
              {gapOf(best, lead) && (
                <>
                  {" · "}
                  <strong className={toneOf(gapOf(best, lead))}>{gapLabel(gapOf(best, lead)!)}</strong> par rapport à la moyenne
                </>
              )}
            </span>
          </div>
          <div className={`${card} border-red-200`}>
            <span className="text-sm font-semibold text-red-800">À visiter en priorité</span>
            <span className="font-display text-xl font-bold">
              <StoreName value={worst.value} onOpen={onOpen} />
            </span>
            <span className="text-sm text-slate-700">
              {formatValue(worst.values[lead.index], lead.format)}
              {gapOf(worst, lead) && (
                <>
                  {" · "}
                  <strong className={toneOf(gapOf(worst, lead))}>{gapLabel(gapOf(worst, lead)!)}</strong> par rapport à la moyenne
                </>
              )}
            </span>
          </div>
          {rate && bestRate && bestRate.values[rate.index] !== null && (
            <div className={`${card} border-slate-200`}>
              <span className="text-sm font-semibold text-slate-600">Meilleur {rate.label.charAt(0).toLowerCase() + rate.label.slice(1)}</span>
              <span className="font-display text-xl font-bold">
                <StoreName value={bestRate.value} onOpen={onOpen} />
              </span>
              <span className="text-sm text-slate-700">
                {formatValue(bestRate.values[rate.index], rate.format)}
                {gapOf(bestRate, rate) && (
                  <>
                    {" · "}
                    <strong className={toneOf(gapOf(bestRate, rate))}>{gapLabel(gapOf(bestRate, rate)!)}</strong> par rapport à la moyenne
                  </>
                )}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-slate-200 bg-white p-5 shadow-card print:break-inside-avoid print:shadow-none">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="font-display text-lg font-bold text-slate-900">Classement par {lead.label.charAt(0).toLowerCase() + lead.label.slice(1)}</h4>
          <span className="text-sm text-slate-500">
            Moyenne des {rows.length} : {formatValue(lead.average, lead.format)}
          </span>
        </div>
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[46rem] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th scope="col" className="py-2 pr-3 font-semibold">
                  {displayName(comparison.column)}
                </th>
                <th scope="col" className="w-[28%] py-2 pr-3 font-semibold">
                  {lead.label}
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">
                  Écart
                </th>
                {others.map((m) => (
                  <th key={m.id} scope="col" className="py-2 pl-3 text-right font-semibold">
                    {m.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const gap = gapOf(r, lead);
                return (
                  <tr key={r.value} className={`border-t border-slate-100 ${r === worst ? "bg-red-50/60" : ""}`}>
                    <th scope="row" className="whitespace-nowrap py-3 pr-3 text-left font-normal">
                      <span className="mr-1.5 font-mono text-xs tabular-nums text-slate-500">{i + 1}</span>
                      <StoreName value={r.value} onOpen={onOpen} />
                    </th>
                    <td className="py-3 pr-3">
                      <span className="flex items-center gap-2">
                        <span aria-hidden="true" className="h-2.5 flex-1 rounded-full bg-slate-100">
                          {max > 0 && r.values[lead.index] !== null && (
                            <span className="block h-full rounded-full bg-brand-800" style={{ width: `${Math.max(2, (Math.abs(r.values[lead.index]!) / max) * 100)}%` }} />
                          )}
                        </span>
                        <span className="w-24 flex-none whitespace-nowrap text-right tabular-nums text-slate-900">{formatValue(r.values[lead.index], lead.format)}</span>
                      </span>
                    </td>
                    <td className={`whitespace-nowrap py-3 pr-3 text-right font-semibold tabular-nums ${toneOf(gap)}`}>{gap ? gapLabel(gap) : "—"}</td>
                    {others.map((m) => (
                      <td key={m.id} className="whitespace-nowrap py-3 pl-3 text-right tabular-nums text-slate-800">
                        {formatValue(r.values[m.index], m.format)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500">
          {onOpen ? `Cliquez sur un ${store} pour ouvrir son dashboard détaillé. ` : ""}
          Chaque chiffre est recalculé par le moteur sur les seules lignes du {store} ; écart en points pour un taux, en % de la moyenne sinon.
        </p>
      </div>
    </section>
  );
}
