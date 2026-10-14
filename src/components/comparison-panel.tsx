import { comparisonTitle, gapToAverage, type Comparison } from "@/lib/engine/comparison";
import { formatValue } from "@/lib/format";

/** Au-delà, les indicateurs suivants restent consultables sur les cartes : le tableau doit se lire d'un coup d'œil. */
const MAX_COLUMNS = 4;

const signed = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1, signDisplay: "exceptZero" });

/** Écart à la moyenne, lisible : « +12 % », « −1,8 pt ». */
function gapLabel(gap: { gap: number; unit: "points" | "percent" }): string {
  return gap.unit === "points" ? `${signed.format(gap.gap * 100)} pt` : `${signed.format(gap.gap * 100)} %`;
}

/**
 * Comparaison (US-17) : classement des magasins, rayons, produits… sur les indicateurs clés, avec l'écart à la moyenne.
 * Le premier indicateur classe les lignes ; la barre montre sa part de la valeur la plus forte.
 */
export function ComparisonPanel({ comparison, hiddenKpis, accent, compact }: { comparison: Comparison; hiddenKpis: Set<string>; accent: string; compact: boolean }) {
  const columns = comparison.kpis.map((k, i) => ({ ...k, index: i })).filter((k) => !hiddenKpis.has(k.id));
  if (columns.length === 0) return null;
  const shown = columns.slice(0, MAX_COLUMNS);
  const lead = shown[0];
  const max = Math.max(...comparison.rows.map((r) => Math.abs(r.values[lead.index] ?? 0)), 0);
  // Classement selon le premier indicateur affiché (il peut différer du premier indicateur du dashboard).
  const rows = [...comparison.rows].sort((a, b) => (b.values[lead.index] ?? -Infinity) - (a.values[lead.index] ?? -Infinity) || a.value.localeCompare(b.value, "fr"));
  const best = rows[0];
  const worst = rows.at(-1)!;
  const title = comparisonTitle(comparison.column);

  return (
    <section aria-label={title} className={`flex flex-col rounded-[var(--radius-card)] border border-slate-200 bg-white shadow-card print:break-inside-avoid print:shadow-none ${compact ? "gap-2 p-3" : "gap-3 p-4"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className={`font-semibold uppercase tracking-wide ${compact ? "text-xs" : "text-sm"}`} style={{ color: accent }}>
          {title}
        </h3>
        <p className="text-xs text-slate-500">
          {rows.length} valeurs de « {comparison.column} » · classées par {lead.label}
        </p>
      </div>
      {!compact && best.values[lead.index] !== null && (
        <p className="text-sm text-slate-700">
          <strong className="font-semibold text-slate-900">{best.value}</strong> arrive en tête ({formatValue(best.values[lead.index], lead.format)}),{" "}
          <strong className="font-semibold text-slate-900">{worst.value}</strong> ferme la marche ({formatValue(worst.values[lead.index], lead.format)}).
        </p>
      )}
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th scope="col" className="w-10 py-2 pr-2 font-medium">
                Rang
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                {comparison.column}
              </th>
              {shown.map((k) => (
                <th key={k.id} scope="col" className="py-2 pl-3 text-right font-medium">
                  {k.label}
                  <span className="block font-normal text-slate-400">écart à la moyenne</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.value} className="border-b border-slate-100 align-top last:border-b-0">
                <td className="py-2 pr-2 font-mono text-xs tabular-nums text-slate-500">{i + 1}</td>
                <th scope="row" className="py-2 pr-3 text-left font-medium text-slate-900">
                  <span className="block break-words">{r.value}</span>
                  {max > 0 && r.values[lead.index] !== null && (
                    <span aria-hidden="true" className="mt-1 block h-1.5 rounded-full bg-slate-100">
                      <span className="block h-full rounded-full" style={{ width: `${Math.max(2, (Math.abs(r.values[lead.index]!) / max) * 100)}%`, backgroundColor: accent }} />
                    </span>
                  )}
                </th>
                {shown.map((k) => {
                  const value = r.values[k.index];
                  const gap = gapToAverage(value, k.average, k.format);
                  const tone = !gap || Math.abs(gap.gap) < 0.005 ? "text-slate-500" : gap.gap > 0 ? "text-success-strong" : "text-amber-800";
                  return (
                    <td key={k.id} className="py-2 pl-3 text-right tabular-nums">
                      <span className="block font-medium text-slate-900">{formatValue(value, k.format)}</span>
                      <span className={`block text-xs ${tone}`}>{gap ? gapLabel(gap) : "—"}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-300 text-slate-600">
              <td />
              <th scope="row" className="py-2 pr-3 text-left text-xs font-medium">
                Moyenne des {rows.length}
              </th>
              {shown.map((k) => (
                <td key={k.id} className="py-2 pl-3 text-right text-xs tabular-nums">
                  {formatValue(k.average, k.format)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        Chaque chiffre est recalculé par le moteur sur les seules lignes de la valeur concernée ; la moyenne est celle des {rows.length} valeurs
        comparées. Écart en points pour un pourcentage, en % de la moyenne sinon.
        {columns.length > MAX_COLUMNS && ` ${columns.length - MAX_COLUMNS} autre(s) indicateur(s) non repris ici : masquez-en pour choisir ceux à comparer.`}
      </p>
    </section>
  );
}
