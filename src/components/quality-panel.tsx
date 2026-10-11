"use client";

import { EMPTY_PLAN, isEmptyPlan, recommendedPlan, type CleaningLog, type CleaningPlan, type EmptyPolicy, type NearDuplicatePolicy, type QualityReport } from "@/lib/quality";

export type AnalyzeQuality = (file: File) => Promise<{ ok: true; report: QualityReport } | { ok: false; message: string }>;
export type DownloadCleaned = (file: File, plan: CleaningPlan) => Promise<{ ok: true } | { ok: false; message: string }>;

/** Contrôle qualité par défaut : API du serveur (moteur, sans IA ; le fichier n'est pas conservé). */
export const analyzeOnServer: AnalyzeQuality = async (file) => {
  const body = new FormData();
  body.append("file", file);
  try {
    const response = await fetch("/api/qualite", { method: "POST", body });
    const json = await response.json();
    return response.ok ? { ok: true, report: json.report as QualityReport } : { ok: false, message: json.error ?? "Le contrôle qualité a échoué." };
  } catch {
    return { ok: false, message: "Le serveur ne répond pas. Vérifiez votre connexion et réessayez." };
  }
};

/** Fichier corrigé calculé par le serveur et téléchargé ; rien n'est conservé. */
export const downloadCleanedOnServer: DownloadCleaned = async (file, plan) => {
  const body = new FormData();
  body.append("file", file);
  body.append("plan", JSON.stringify(plan));
  try {
    const response = await fetch("/api/qualite", { method: "POST", body });
    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      return { ok: false, message: json.error ?? "Le fichier corrigé n'a pas pu être produit." };
    }
    const name = /filename\*=UTF-8''([^;]+)/.exec(response.headers.get("Content-Disposition") ?? "")?.[1];
    saveBlob(await response.blob(), name ? decodeURIComponent(name) : "fichier-corrige.csv");
    return { ok: true };
  } catch {
    return { ok: false, message: "Le serveur ne répond pas. Vérifiez votre connexion et réessayez." };
  }
};

export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const number = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
const lines = (rows: number[], total: number) => `ligne${rows.length > 1 ? "s" : ""} ${rows.join(", ")}${total > rows.length ? "…" : ""}`;

function Impact({ label, before, after }: { label: string; before: number; after: number }) {
  const delta = after - before;
  return (
    <span className="text-slate-600">
      {label} : {number(before)} → <strong className="text-slate-900">{number(after)}</strong>
      {delta !== 0 && <span className={delta < 0 ? "text-red-800" : "text-emerald-800"}> ({delta > 0 ? "+" : ""}{number(delta)})</span>}
    </span>
  );
}

const select = "rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm";

/**
 * Propositions de corrections (US-11). Rien n'est appliqué tant que l'utilisateur ne l'a pas coché ;
 * les corrections choisies sont appliquées à une copie des données au moment de la génération.
 */
export function QualityPanel({
  report,
  plan,
  onChange,
  onDownload,
  downloading = false,
}: {
  report: QualityReport;
  plan: CleaningPlan;
  onChange: (plan: CleaningPlan) => void;
  onDownload?: () => void;
  downloading?: boolean;
}) {
  const selected = countSelected(plan);
  const measure = report.mainMeasure;

  if (report.issueCount === 0) {
    return (
      <section aria-label="Contrôle qualité" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 print:hidden">
        <h3 className="font-semibold">Contrôle qualité du fichier</h3>
        <p className="mt-1">
          {report.rowCount.toLocaleString("fr-FR")} lignes vérifiées : aucun doublon, aucune cellule vide ni valeur incohérente dans les colonnes analysées.
        </p>
      </section>
    );
  }

  const setMerge = (column: string, to: string, from: string[], on: boolean) => {
    const others = plan.merges.filter((m) => !(m.column === column && m.from.concat(m.to).some((v) => from.includes(v))));
    onChange({ ...plan, merges: on ? [...others, { column, to, from: from.filter((v) => v !== to) }] : others });
  };

  return (
    <section aria-label="Contrôle qualité" className="flex flex-col gap-4 rounded-xl border border-amber-200 bg-amber-50/40 p-4 text-sm print:hidden">
      <div>
        <h3 className="text-base font-semibold text-slate-900">Contrôle qualité du fichier</h3>
        <p className="mt-1 text-slate-600">
          {report.rowCount.toLocaleString("fr-FR")} lignes vérifiées par le moteur, sans IA. Cochez les corrections à appliquer : rien n&apos;est modifié sans votre
          accord, et votre fichier d&apos;origine reste intact (les corrections portent sur une copie, qui n&apos;est pas conservée).
        </p>
      </div>

      {report.duplicates.extraRows > 0 && (
        <fieldset className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3">
          <legend className="px-1 font-semibold text-slate-900">Doublons</legend>
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={plan.removeDuplicates} onChange={(e) => onChange({ ...plan, removeDuplicates: e.target.checked })} />
            <span className="flex flex-col">
              <span className="font-medium text-slate-900">
                Supprimer {report.duplicates.extraRows > 1 ? `les ${number(report.duplicates.extraRows)} lignes strictement identiques` : "la ligne strictement identique"} à une autre
              </span>
              {measure && report.duplicates.impact && <Impact label={measure} before={report.duplicates.impact.before} after={report.duplicates.impact.after} />}
            </span>
          </label>
          <details>
            <summary className="cursor-pointer text-slate-600">Voir les lignes concernées</summary>
            <ul className="mt-1 list-disc pl-5 text-slate-700">
              {report.duplicates.groups.map((g, i) => (
                <li key={i}>
                  {lines(g.rows, g.rows.length)} : {g.preview.map(([k, v]) => `${k} ${v || "—"}`).join(" · ")}
                </li>
              ))}
            </ul>
          </details>
        </fieldset>
      )}

      {report.nearDuplicates.map((near) => (
        <fieldset key={near.column} className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3">
          <legend className="px-1 font-semibold text-slate-900">Quasi-doublons · {near.column}</legend>
          <p className="text-slate-700">
            {number(near.groupCount)} numéro{near.groupCount > 1 ? "s" : ""} {near.groupCount > 1 ? "apparaissent" : "apparaît"} sur plusieurs lignes différentes. Une
            commande peut avoir plusieurs lignes (une par produit) : ne retirez des lignes que s&apos;il s&apos;agit de saisies en double.
          </p>
          <label className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            Traitement
            <select
              className={select}
              value={plan.nearDuplicates[near.column] ?? "keep"}
              onChange={(e) => onChange({ ...plan, nearDuplicates: { ...plan.nearDuplicates, [near.column]: e.target.value as NearDuplicatePolicy } })}
            >
              <option value="keep">Conserver toutes les lignes</option>
              <option value="keep_first">Une ligne par numéro : garder la première</option>
              <option value="keep_last">Une ligne par numéro : garder la dernière (correction la plus récente)</option>
            </select>
          </label>
          {(() => {
            // Les doublons exacts sont retirés d'abord : l'effet affiché en tient compte.
            const impact = plan.removeDuplicates ? near.impactAfterDuplicates : near.impact;
            const policy = plan.nearDuplicates[near.column] ?? "keep";
            return measure && impact && policy !== "keep" ? <Impact label={measure} before={impact.before} after={policy === "keep_first" ? impact.keepFirst : impact.keepLast} /> : null;
          })()}
          <details>
            <summary className="cursor-pointer text-slate-600">Voir les numéros concernés</summary>
            <ul className="mt-1 list-disc pl-5 text-slate-700">
              {near.groups.map((g) => (
                <li key={g.value}>
                  « {g.value} » ({lines(g.rows, g.rows.length)}) : {g.differences.map((d) => `${d.column} ${d.values.map((v) => v || "vide").join(" / ")}`).join(" · ") || "lignes différentes"}
                </li>
              ))}
            </ul>
          </details>
        </fieldset>
      ))}

      {report.empties.length > 0 && (
        <fieldset className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3">
          <legend className="px-1 font-semibold text-slate-900">Cellules vides</legend>
          <p className="text-slate-600">Par défaut, les cellules vides sont ignorées dans les calculs et signalées sous les indicateurs.</p>
          <ul className="flex flex-col gap-2">
            {report.empties.map((e) => (
              <li key={e.column} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <span>
                  <strong className="text-slate-900">{e.column}</strong> : {number(e.count)} vide{e.count > 1 ? "s" : ""}{" "}
                  <span className="text-slate-500">({lines(e.rows, e.count)})</span>
                </span>
                <select
                  className={select}
                  aria-label={`Cellules vides de ${e.column}`}
                  value={plan.empty[e.column] ?? "ignore"}
                  onChange={(ev) => {
                    const next = ev.target.value as EmptyPolicy;
                    // Un 0 change les moyennes et les minimums : demandé explicitement.
                    if (next === "fill_zero" && !window.confirm(`Remplacer les ${e.count} cellule(s) vide(s) de « ${e.column} » par 0 ? Les moyennes et les minimums en seront modifiés.`)) return;
                    onChange({ ...plan, empty: { ...plan.empty, [e.column]: next } });
                  }}
                >
                  <option value="ignore">Ignorer (par défaut)</option>
                  <option value="exclude_rows">Exclure ces lignes</option>
                  {e.kind === "category" && <option value="fill_unknown">Remplacer par « Non renseigné »</option>}
                  {e.kind === "number" && <option value="fill_zero">Remplacer par 0 (après confirmation)</option>}
                </select>
              </li>
            ))}
          </ul>
        </fieldset>
      )}

      {report.variants.length > 0 && (
        <fieldset className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3">
          <legend className="px-1 font-semibold text-slate-900">Variantes d&apos;une même catégorie</legend>
          <ul className="flex flex-col gap-2">
            {report.variants.flatMap((v) =>
              v.groups.map((g) => {
                const values = g.from.map((f) => f.value);
                const current = plan.merges.find((m) => m.column === v.column && values.includes(m.to));
                return (
                  <li key={`${v.column}:${g.to}`} className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
                    <label className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" checked={!!current} onChange={(e) => setMerge(v.column, current?.to ?? g.to, values, e.target.checked)} />
                      <span>
                        <strong className="text-slate-900">{v.column}</strong> : fusionner {g.from.map((f) => `« ${f.value} » (${number(f.count)})`).join(", ")} en
                      </span>
                    </label>
                    <select className={select} aria-label={`Valeur retenue pour ${v.column}`} value={current?.to ?? g.to} onChange={(e) => setMerge(v.column, e.target.value, values, true)}>
                      {values.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </li>
                );
              }),
            )}
          </ul>
        </fieldset>
      )}

      {report.invalid.length > 0 && (
        <fieldset className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3">
          <legend className="px-1 font-semibold text-slate-900">Valeurs incohérentes</legend>
          <p className="text-slate-600">Par défaut, ces valeurs sont ignorées dans les calculs. Corrigez-les dans votre fichier ou excluez les lignes.</p>
          {report.invalid.map((inv) => (
            <div key={inv.column} className="flex flex-col gap-1">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <span>
                  <strong className="text-slate-900">{inv.column}</strong> : {number(inv.count)} valeur{inv.count > 1 ? "s" : ""} {inv.kind === "number" ? "non numérique" : "qui ne sont pas des dates"}
                  {inv.count > 1 && inv.kind === "number" ? "s" : ""}
                </span>
                <select
                  className={select}
                  aria-label={`Valeurs incohérentes de ${inv.column}`}
                  value={plan.invalid[inv.column] ?? "ignore"}
                  onChange={(e) => onChange({ ...plan, invalid: { ...plan.invalid, [inv.column]: e.target.value as "ignore" | "exclude_rows" } })}
                >
                  <option value="ignore">Ignorer la valeur (par défaut)</option>
                  <option value="exclude_rows">Exclure ces lignes</option>
                </select>
              </div>
              <ul className="list-disc pl-5 text-slate-700">
                {inv.items.map((item) => (
                  <li key={item.row}>
                    Ligne {item.row} : « {item.value} »
                  </li>
                ))}
                {inv.count > inv.items.length && <li>… et {number(inv.count - inv.items.length)} autre(s)</li>}
              </ul>
            </div>
          ))}
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => onChange(withRecommended(plan, report))} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-50">
          Cocher les corrections recommandées
        </button>
        <button type="button" disabled={isEmptyPlan(plan)} onClick={() => onChange(EMPTY_PLAN)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50">
          Tout décocher
        </button>
        {onDownload && (
          <button type="button" disabled={isEmptyPlan(plan) || downloading} onClick={onDownload} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50">
            {downloading ? "Préparation…" : "Télécharger le fichier corrigé (CSV)"}
          </button>
        )}
        <span className="text-slate-700">
          {selected === 0 ? "Aucune correction sélectionnée : le fichier sera utilisé tel quel." : `${selected} correction${selected > 1 ? "s" : ""} sélectionnée${selected > 1 ? "s" : ""}, appliquée${selected > 1 ? "s" : ""} à la génération.`}
        </span>
      </div>
    </section>
  );
}

/** Ajoute les corrections recommandées aux choix déjà faits, sans les écraser. */
function withRecommended(plan: CleaningPlan, report: QualityReport): CleaningPlan {
  const recommended = recommendedPlan(report);
  const covered = (m: CleaningPlan["merges"][number]) => plan.merges.some((p) => p.column === m.column && m.from.concat(m.to).includes(p.to));
  return { ...plan, removeDuplicates: plan.removeDuplicates || recommended.removeDuplicates, merges: [...plan.merges, ...recommended.merges.filter((m) => !covered(m))] };
}

function countSelected(plan: CleaningPlan): number {
  return (
    (plan.removeDuplicates ? 1 : 0) +
    plan.merges.length +
    Object.values(plan.nearDuplicates).filter((p) => p !== "keep").length +
    Object.values(plan.empty).filter((p) => p !== "ignore").length +
    Object.values(plan.invalid).filter((p) => p !== "ignore").length
  );
}

/** Rappel des corrections appliquées, sur le dashboard et dans le PDF. */
export function CleaningNotice({ cleaning, compact = false }: { cleaning?: { log: CleaningLog }; compact?: boolean }) {
  if (!cleaning || cleaning.log.lines.length === 0) return null;
  const { log } = cleaning;
  return (
    <section aria-label="Corrections appliquées" className={`rounded-xl border border-slate-200 bg-white text-sm text-slate-700 ${compact ? "p-2" : "p-3"}`}>
      <h3 className="font-semibold text-slate-900">
        Corrections appliquées au fichier (contrôle qualité) · {log.rowsBefore.toLocaleString("fr-FR")} → {log.rowsAfter.toLocaleString("fr-FR")} lignes
      </h3>
      <ul className="mt-1 list-disc pl-5">
        {log.lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </section>
  );
}
