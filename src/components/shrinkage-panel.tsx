import { formatValue } from "@/lib/format";
import type { ShrinkageReport } from "@/lib/shrinkage";

const pct = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 1 });
const euros = (v: number | null) => formatValue(v, "currency");

/** Barres horizontales simples : part de chaque ligne dans la perte totale. */
function Bars({ title, rows }: { title: string; rows: { label: string; lost: number; share: number }[] }) {
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((r) => r.lost));
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h4>
      <ul className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <li key={r.label} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-sm">
            <span className="truncate text-slate-800" title={r.label}>
              {r.label}
            </span>
            <span aria-hidden="true" className="h-2 rounded-full bg-slate-100">
              <span className="block h-full rounded-full bg-red-400" style={{ width: `${Math.max(3, (r.lost / max) * 100)}%` }} />
            </span>
            <span className="text-right tabular-nums text-slate-900">
              {euros(r.lost)} <span className="text-xs text-slate-500">· {pct.format(r.share)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Démarque en perte de chiffre (US-18) : ce que la démarque a coûté, en euros et en positif, d'où elle vient
 * (motifs, rayons) et les articles à surveiller. Pertes uniquement : inventaire et comptage ne sont pas comptés.
 */
export function ShrinkagePanel({ report, compact }: { report: ShrinkageReport; compact: boolean }) {
  const main = report.lostSales ?? report.lostCost;
  return (
    <section aria-label="Démarque" className={`flex flex-col rounded-[var(--radius-card)] border border-red-200 bg-white shadow-card print:break-inside-avoid print:shadow-none ${compact ? "gap-3 p-3" : "gap-4 p-4"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className={`font-semibold uppercase tracking-wide text-red-800 ${compact ? "text-xs" : "text-sm"}`}>Démarque : le chiffre perdu</h3>
        <p className="text-xs text-slate-500">
          {report.lossTypes.join(", ")} · {report.lines.toLocaleString("fr-FR")} mouvement(s) · inventaire et comptage non comptés
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-red-50 p-3">
          <p className="text-sm font-medium text-red-900">{report.lostSales !== null ? "Chiffre perdu" : "Marchandise perdue"}</p>
          <p className="mt-1 text-[1.7rem] font-semibold leading-tight tracking-tight tabular-nums text-red-900">{euros(main)}</p>
          <p className="mt-1 text-xs text-red-900/80">{report.lostSales !== null ? `Au prix de vente (« ${report.saleColumn} »)` : `Au prix d'achat (« ${report.costColumn} »)`}</p>
        </div>
        {report.lostSales !== null && report.lostCost !== null && (
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-sm font-medium text-slate-700">Marchandise payée et perdue</p>
            <p className="mt-1 text-[1.7rem] font-semibold leading-tight tracking-tight tabular-nums text-slate-900">{euros(report.lostCost)}</p>
            <p className="mt-1 text-xs text-slate-500">Au prix d&apos;achat (« {report.costColumn} »)</p>
          </div>
        )}
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-sm font-medium text-slate-700">Part du chiffre d&apos;affaires</p>
          {report.sales ? (
            <>
              <p className="mt-1 text-[1.7rem] font-semibold leading-tight tracking-tight tabular-nums text-slate-900">{pct.format(report.sales.share)}</p>
              <p className="mt-1 text-xs text-slate-500">
                Sur {euros(report.sales.value)} de « {report.sales.column} »
              </p>
            </>
          ) : (
            <p className="mt-2 text-xs text-slate-500">Déposez l&apos;export des ventes avec le journal de démarque pour la calculer.</p>
          )}
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-4 ${report.byAisle.length > 0 ? "md:grid-cols-2" : ""}`}>
        <Bars title="Par motif" rows={report.byType.map((t) => ({ label: t.type, lost: t.lost, share: t.share }))} />
        <Bars title="Par rayon" rows={report.byAisle.map((a) => ({ label: a.aisle, lost: a.lost, share: a.share }))} />
      </div>

      {report.items.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">À surveiller : les {report.items.length} articles qui font perdre le plus</h4>
          <ol className="flex flex-col divide-y divide-slate-100 rounded-lg border border-slate-200">
            {report.items.map((it, i) => (
              <li key={it.item} className="flex flex-col gap-0.5 px-3 py-2 text-sm sm:flex-row sm:items-center sm:gap-3">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="w-5 shrink-0 font-mono text-xs tabular-nums text-slate-500">{i + 1}</span>
                  <span className="min-w-0 break-words font-medium text-slate-900">{it.item}</span>
                </span>
                <span className="pl-7 text-xs text-slate-600 sm:ml-auto sm:pl-0 sm:text-right">
                  {it.aisle && `${it.aisle} · `}
                  {it.mainTypeShare >= 0.995 ? it.mainType : `${pct.format(it.mainTypeShare)} ${it.mainType.toLowerCase()}`}
                </span>
                <span className="pl-7 font-semibold tabular-nums text-red-900 sm:w-24 sm:pl-0 sm:text-right">{euros(it.lost)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      <p className="text-xs text-slate-500">
        Calculé par le moteur sur les lignes de démarque, sans IA. Une perte enregistrée en négatif (sortie de stock) est affichée en positif.
      </p>
    </section>
  );
}
