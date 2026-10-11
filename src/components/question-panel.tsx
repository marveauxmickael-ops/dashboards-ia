"use client";

import { useState } from "react";
import type { Branding } from "@/lib/branding";
import { formatValue } from "@/lib/format";
import type { QuestionAnswer } from "@/lib/questions";
import { StandaloneChart } from "./dashboard-view";

export type Ask = (question: string) => Promise<{ ok: true; answer: QuestionAnswer } | { ok: false; message: string }>;

const EXAMPLES = ["Quel est le chiffre d'affaires par région ?", "Comment évolue la marge mois par mois ?", "Quels sont les 5 meilleurs clients ?", "Combien de ventes en juillet ?"];

/** Questions en langage naturel (US-07) : la réponse est calculée par le moteur sur le fichier source. */
export function QuestionPanel({ ask, branding, aiAvailable }: { ask: Ask; branding?: Branding; aiAvailable: boolean }) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<QuestionAnswer[]>([]);

  async function submit(q: string) {
    if (q.trim().length < 3) return;
    setBusy(true);
    setError(null);
    const outcome = await ask(q);
    setBusy(false);
    if (!outcome.ok) return setError(outcome.message);
    setAnswers((list) => [outcome.answer, ...list].slice(0, 10));
    setQuestion("");
  }

  return (
    <section aria-label="Poser une question" className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 print:hidden">
      <div>
        <h3 className="text-base font-semibold text-slate-900">Poser une question sur vos données</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          {aiAvailable
            ? "L'IA traduit la question (noms remplacés par des jetons) ; le moteur calcule la réponse sur vos données. Aucun chiffre ne vient de l'IA."
            : "Interprétation par mots-clés, sans IA ; le moteur calcule la réponse sur vos données."}
        </p>
      </div>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(question);
        }}
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={500}
          placeholder="Ex. : quel est le chiffre d'affaires du commercial Paul Martin en juillet ?"
          aria-label="Votre question"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button type="submit" disabled={busy || question.trim().length < 3} className="rounded-lg bg-brand-800 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-900 disabled:opacity-50">
          {busy ? "Calcul…" : "Demander"}
        </button>
      </form>
      {answers.length === 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" disabled={busy} onClick={() => void submit(ex)} className="rounded-full border border-slate-200 px-2.5 py-1 text-slate-700 hover:bg-slate-50">
              {ex}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      )}
      {answers.map((a, i) => (
        <article key={`${a.question}-${i}`} className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50/60 p-3">
          <p className="text-sm font-medium text-slate-900">{a.question}</p>
          <p className="text-sm text-slate-800">{a.answer}</p>
          {a.value && a.value.value !== null && (
            <p className="text-2xl font-semibold tabular-nums text-slate-900">{formatValue(a.value.value, a.value.format)}</p>
          )}
          {a.chart && <StandaloneChart chart={a.chart} branding={branding} />}
          {a.notes.map((n, j) => (
            <p key={j} className="text-xs text-amber-800">
              {n}
            </p>
          ))}
          <details className="text-xs text-slate-500">
            <summary className="cursor-pointer">Comment la question a été comprise</summary>
            <p className="mt-1">{a.interpretedBy === "ai" ? "Interprétée par l'IA" : "Interprétée par mots-clés, sans IA"} ; calcul par le moteur.</p>
            {a.sentToAi && <p className="mt-1">Envoyé à l&apos;IA : « {a.sentToAi} »</p>}
            {a.query && <pre className="mt-1 overflow-x-auto rounded bg-white p-2 font-mono text-[11px] text-slate-700">{JSON.stringify(a.query, null, 2)}</pre>}
          </details>
        </article>
      ))}
    </section>
  );
}
