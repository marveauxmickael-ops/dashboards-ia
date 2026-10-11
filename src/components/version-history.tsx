import Link from "next/link";
import { formatPeriod, formatValue } from "@/lib/format";
import type { DashboardResult } from "@/lib/pipeline";

// Historique des actualisations (US-09) : chaque import réussi est conservé et consultable.

export interface VersionRow {
  id: string;
  file_name: string;
  row_count: number;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
}

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" });

export function periodText(from: string | null | undefined, to: string | null | undefined): string {
  if (!from || !to) return "—";
  return from === to ? formatPeriod(from) : `${formatPeriod(from)} → ${formatPeriod(to)}`;
}

export function VersionHistory({ dashboardId, versions, selectedId }: { dashboardId: string; versions: VersionRow[]; selectedId: string | null }) {
  if (versions.length === 0) return null;
  return (
    <section aria-label="Historique des actualisations" className="rounded-xl border border-slate-200 bg-white p-4 print:hidden">
      <h3 className="text-base font-semibold text-slate-900">Historique des actualisations</h3>
      <p className="mt-1 text-sm text-slate-600">Chaque import réussi est conservé : consultez une version pour la comparer à la version actuelle.</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="py-1 pr-3 font-medium">Actualisé le</th>
              <th className="py-1 pr-3 font-medium">Période couverte</th>
              <th className="py-1 pr-3 font-medium">Fichier</th>
              <th className="py-1 pr-3 text-right font-medium">Lignes</th>
              <th className="py-1 font-medium" />
            </tr>
          </thead>
          <tbody>
            {versions.map((v, i) => (
              <tr key={v.id} className={`border-b border-slate-100 last:border-0 ${v.id === selectedId ? "bg-brand-50" : ""}`}>
                <td className="py-1.5 pr-3 text-slate-800">{dateFormat.format(new Date(v.created_at))}</td>
                <td className="py-1.5 pr-3 text-slate-700">{periodText(v.period_start, v.period_end)}</td>
                <td className="py-1.5 pr-3 text-slate-700">{v.file_name}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-slate-700">{v.row_count.toLocaleString("fr-FR")}</td>
                <td className="py-1.5 text-right">
                  {i === 0 ? (
                    <span className="text-xs font-medium text-emerald-800">Version actuelle</span>
                  ) : v.id === selectedId ? (
                    <Link href={`/dashboards/${dashboardId}`} className="text-xs font-medium text-brand-900 underline">
                      Revenir à la version actuelle
                    </Link>
                  ) : (
                    <Link href={`/dashboards/${dashboardId}?version=${v.id}`} className="text-xs font-medium text-brand-900 underline">
                      Consulter et comparer
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Comparaison des indicateurs entre une version précédente et la version actuelle. */
export function VersionComparison({ previous, current }: { previous: DashboardResult; current: DashboardResult }) {
  const before = new Map(previous.kpis.map((k) => [k.id, k]));
  const rows = current.kpis.filter((k) => before.has(k.id));
  if (rows.length === 0) return null;
  const pct = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 1, signDisplay: "always" });
  return (
    <section aria-label="Comparaison des versions" className="rounded-xl border border-brand-200 bg-white p-4">
      <h3 className="text-base font-semibold text-slate-900">Comparaison avec la version actuelle</h3>
      <p className="mt-1 text-sm text-slate-600">
        {periodText(previous.period?.from, previous.period?.to)} ({previous.fileName}) comparé à {periodText(current.period?.from, current.period?.to)} (
        {current.fileName}).
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="py-1 pr-3 font-medium">Indicateur</th>
              <th className="py-1 pr-3 text-right font-medium">Version consultée</th>
              <th className="py-1 pr-3 text-right font-medium">Version actuelle</th>
              <th className="py-1 pr-3 text-right font-medium">Écart</th>
              <th className="py-1 text-right font-medium">Évolution</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map((k) => {
              const old = before.get(k.id)!.value;
              const delta = old !== null && k.value !== null ? k.value - old : null;
              return (
                <tr key={k.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-1.5 pr-3 text-slate-800">{k.label}</td>
                  <td className="py-1.5 pr-3 text-right text-slate-700">{formatValue(old, k.format)}</td>
                  <td className="py-1.5 pr-3 text-right text-slate-900">{formatValue(k.value, k.format)}</td>
                  <td className={`py-1.5 pr-3 text-right ${delta === null ? "text-slate-500" : delta < 0 ? "text-red-700" : "text-emerald-700"}`}>
                    {delta === null ? "—" : `${delta >= 0 ? "+" : "−"}${formatValue(Math.abs(delta), k.format)}`}
                  </td>
                  <td className="py-1.5 text-right text-slate-700">{delta !== null && old ? pct.format(delta / Math.abs(old)) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
