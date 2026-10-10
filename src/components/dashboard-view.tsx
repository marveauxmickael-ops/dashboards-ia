"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
import type { ComputedChart, InsightStatus } from "@/lib/engine/compute";
import { formatPeriod, formatValue } from "@/lib/format";
import type { DashboardResult } from "@/lib/pipeline";

const PALETTE = ["#0d5c70", "#3b8ea5", "#7fb7c7", "#c08a3e", "#8c6bb1", "#5f8f5a", "#b5545c"];

const STATUS: Record<InsightStatus, { label: string; className: string }> = {
  verified: { label: "Chiffres vérifiés", className: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  mismatch: { label: "À vérifier", className: "bg-red-50 text-red-800 ring-red-200" },
  unverified: { label: "Chiffres non sourcés", className: "bg-amber-50 text-amber-800 ring-amber-200" },
  qualitative: { label: "Sans chiffre", className: "bg-slate-100 text-slate-700 ring-slate-200" },
};

export function DashboardView({ result }: { result: DashboardResult }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{result.title}</h2>
        <p className="text-sm text-slate-500">
          {result.fileName} · {result.profile.rowCount.toLocaleString("fr-FR")} lignes
        </p>
      </div>

      <section aria-label="Indicateurs clés" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {result.kpis.map((k) => (
          <article key={k.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-medium text-slate-600">{k.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{formatValue(k.value, k.format)}</p>
            <p className="mt-2 text-xs text-slate-500">{k.description}</p>
            <details className="mt-2 text-xs text-slate-500">
              <summary className="cursor-pointer text-teal-800">Voir le calcul</summary>
              <code className="mt-1 block rounded bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-700">{k.formula}</code>
            </details>
          </article>
        ))}
      </section>

      {result.insights.length > 0 && (
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

      <section aria-label="Graphiques" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {result.charts.map((c) => (
          <ChartCard key={c.id} chart={c} />
        ))}
      </section>

      {result.issues.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
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

function ChartCard({ chart }: { chart: ComputedChart }) {
  const data = chart.data.map((d) => ({ ...d, label: chart.chronological ? formatPeriod(d.category) : d.category }));
  const fmt = (v: unknown) => formatValue(typeof v === "number" ? v : null, chart.format);
  const compact = (v: number) =>
    new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 }).format(chart.format === "percent" ? v * 100 : v);

  return (
    <article className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-base font-semibold text-slate-900">{chart.title}</h3>
      <p className="mb-3 text-xs text-slate-500">
        {chart.formula}
        {chart.othersCount > 0 && ` · ${chart.othersCount} autre(s) catégorie(s) non affichée(s)`}
      </p>
      {data.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-500">Pas assez de données pour ce graphique.</p>
      ) : chart.type === "table" ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {data.map((d) => (
                <tr key={d.category} className="border-b border-slate-100 last:border-0">
                  <td className="py-1.5 pr-4 text-slate-700">{d.label}</td>
                  <td className="py-1.5 text-right tabular-nums text-slate-900">{fmt(d.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            {chart.type === "line" ? (
              <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} />
                <YAxis tickFormatter={compact} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} width={48} />
                <Tooltip formatter={(v) => [fmt(v), chart.measureLabel]} />
                <Line type="monotone" dataKey="value" stroke={PALETTE[0]} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            ) : chart.type === "pie" ? (
              <PieChart>
                <Tooltip formatter={(v) => [fmt(v), chart.measureLabel]} />
                <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Pie data={data} dataKey="value" nameKey="label" innerRadius="45%" outerRadius="75%" paddingAngle={2}>
                  {data.map((d, i) => (
                    <Cell key={d.category} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Pie>
              </PieChart>
            ) : (
              <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tickFormatter={compact} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} />
                <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 11, fill: "#334155" }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v) => [fmt(v), chart.measureLabel]} />
                <Bar dataKey="value" fill={PALETTE[0]} radius={[0, 4, 4, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </article>
  );
}
