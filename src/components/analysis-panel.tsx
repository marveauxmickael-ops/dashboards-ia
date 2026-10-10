"use client";

import { useState } from "react";
import type { AnalysisResult, VariationInsight } from "@/lib/analysis";
import type { Variation } from "@/lib/engine/variations";
import { formatPeriod, formatValue } from "@/lib/format";

const STATUS: Record<string, { label: string; className: string }> = {
  verified: { label: "Vérifié", className: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  mismatch: { label: "À vérifier", className: "bg-red-50 text-red-800 ring-red-200" },
  unverified: { label: "Non sourcé", className: "bg-amber-50 text-amber-800 ring-amber-200" },
  qualitative: { label: "Constat", className: "bg-slate-100 text-slate-700 ring-slate-200" },
};

const pct = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 1, signDisplay: "always" });

function periodText(period: string): string {
  return period.includes("→") ? period.split(" → ").map(formatPeriod).join(" → ") : formatPeriod(period);
}

function comparisonText(v: Variation): string {
  if (v.comparison === "rolling_quarter") return `${periodText(v.period)} comparé à ${periodText(v.previousPeriod)}`;
  if (v.comparison === "same_period_last_year") return `${periodText(v.period)} comparé à ${periodText(v.previousPeriod)} (un an plus tôt)`;
  return `${periodText(v.period)} comparé à ${periodText(v.previousPeriod)}`;
}

/** Assistant d'analyse des variations (US-10). */
export function AnalysisPanel({ analysis, dashboardId }: { analysis: AnalysisResult; dashboardId?: string | null }) {
  const insightById = new Map(analysis.insights.map((i) => [i.variationId, i]));
  return (
    <section aria-label="Analyse des variations" className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold text-slate-900">Analyse des variations</h3>
        <p className="text-sm text-slate-600">
          Hausses et baisses de plus de {Math.round(analysis.threshold * 100)} %, expliquées à partir des chiffres calculés.{" "}
          {analysis.writtenBy === "ai"
            ? "Rédigé par l'IA à partir de données pseudonymisées ; chaque chiffre cité est vérifié."
            : "Rédigé automatiquement, sans IA ; chaque chiffre cité est vérifié."}
        </p>
      </div>
      {analysis.notes.length > 0 && (
        <ul className="list-disc rounded-lg bg-slate-50 py-2 pl-8 pr-3 text-sm text-slate-700">
          {analysis.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      {analysis.variations.map((v) => (
        <VariationCard key={v.id} variation={v} insight={insightById.get(v.id)} dashboardId={dashboardId} />
      ))}
    </section>
  );
}

function VariationCard({ variation: v, insight, dashboardId }: { variation: Variation; insight?: VariationInsight; dashboardId?: string | null }) {
  const down = v.direction === "down";
  const main = v.drivers[0];
  return (
    <article className={`flex flex-col gap-3 rounded-lg border p-4 ${down ? "border-red-200" : "border-emerald-200"}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${down ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>
          {down ? "Baisse" : "Hausse"}
        </span>
        <h4 className="text-base font-semibold text-slate-900">
          {v.measureLabel} <span className={`tabular-nums ${down ? "text-red-700" : "text-emerald-700"}`}>{pct.format(v.changePct)}</span>
        </h4>
        <span className="text-sm text-slate-600">{comparisonText(v)}</span>
      </div>
      <p className="text-sm tabular-nums text-slate-700">
        {formatValue(v.previous, v.format)} → <strong>{formatValue(v.current, v.format)}</strong> ({v.delta >= 0 ? "+" : "−"}
        {formatValue(Math.abs(v.delta), v.format)})
      </p>

      {insight && insight.facts.length > 0 && (
        <ul className="flex flex-col gap-2">
          {insight.facts.map((f, i) => (
            <li key={i} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
              <span className={`inline-flex w-fit shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${STATUS[f.status].className}`}>
                {STATUS[f.status].label}
              </span>
              <div className="min-w-0 text-sm text-slate-800">
                {f.text}
                {f.details.length > 0 && <p className="mt-1 text-xs text-red-700">{f.details.join(" ")}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {main && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <caption className="mb-1 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              Principaux contributeurs · {main.dimension}
            </caption>
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="py-1 pr-3 font-medium">Segment</th>
                <th className="py-1 pr-3 text-right font-medium">Avant</th>
                <th className="py-1 pr-3 text-right font-medium">Après</th>
                <th className="py-1 pr-3 text-right font-medium">Écart</th>
                <th className="py-1 text-right font-medium">Part de la variation</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {[...main.items.slice(0, 3), ...main.opposite].map((i) => (
                <tr key={i.category} className="border-b border-slate-100 last:border-0">
                  <td className="py-1 pr-3 text-slate-800">{i.category}</td>
                  <td className="py-1 pr-3 text-right text-slate-700">{formatValue(i.previous, v.format)}</td>
                  <td className="py-1 pr-3 text-right text-slate-700">{formatValue(i.current, v.format)}</td>
                  <td className={`py-1 pr-3 text-right ${i.delta < 0 ? "text-red-700" : "text-emerald-700"}`}>
                    {i.delta >= 0 ? "+" : "−"}
                    {formatValue(Math.abs(i.delta), v.format)}
                  </td>
                  <td className="py-1 text-right text-slate-700">{i.share > 0 ? `${Math.round(Math.min(i.share, 1) * 100)} %` : "à contre-sens"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {insight && insight.hypotheses.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {insight.hypotheses.map((h, i) => (
            <li key={i} className="flex flex-col gap-1 text-sm sm:flex-row sm:items-start sm:gap-3">
              <span className="inline-flex w-fit shrink-0 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-800 ring-1 ring-violet-200">Hypothèse</span>
              <span className="text-slate-700">{h}</span>
            </li>
          ))}
        </ul>
      )}

      {insight && insight.suggestions.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg bg-teal-50/60 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-900">Pistes d&apos;amélioration</p>
          <ul className="flex flex-col gap-2">
            {insight.suggestions.map((s, i) => (
              <li key={i} className="flex flex-col gap-2 text-sm sm:flex-row sm:items-start sm:justify-between">
                <span className="text-slate-800">
                  <span className="mr-2 inline-flex rounded-full bg-white px-2 py-0.5 text-xs font-medium text-teal-900 ring-1 ring-teal-200">Suggestion</span>
                  {s.text}
                </span>
                {dashboardId && <Feedback dashboardId={dashboardId} variationId={v.id} suggestionIndex={i} />}
              </li>
            ))}
          </ul>
        </div>
      )}

      {v.limitations.length > 0 && <p className="text-xs text-slate-500">{v.limitations.join(" ")}</p>}
    </article>
  );
}

function Feedback({ dashboardId, variationId, suggestionIndex }: { dashboardId: string; variationId: string; suggestionIndex: number }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  async function send(useful: boolean) {
    setState("sending");
    try {
      const response = await fetch(`/api/dashboards/${dashboardId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variationId, suggestionIndex, useful }),
      });
      setState(response.ok ? "sent" : "error");
    } catch {
      setState("error");
    }
  }
  if (state === "sent") return <span className="shrink-0 text-xs text-teal-900 print:hidden">Merci pour votre avis</span>;
  return (
    <span className="flex shrink-0 items-center gap-1 print:hidden" role="group" aria-label="Cette suggestion vous est-elle utile ?">
      {state === "error" && <span className="text-xs text-red-700">Avis non enregistré.</span>}
      <button type="button" disabled={state === "sending"} onClick={() => void send(true)} className="rounded border border-teal-200 bg-white px-2 py-0.5 text-xs text-teal-900 hover:bg-teal-50 disabled:opacity-50">
        Utile
      </button>
      <button type="button" disabled={state === "sending"} onClick={() => void send(false)} className="rounded border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50">
        Pas utile
      </button>
    </span>
  );
}
