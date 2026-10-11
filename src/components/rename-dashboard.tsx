"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { renameDashboard } from "@/app/dashboards/actions";
import { DASHBOARD_TITLE_MAX } from "@/lib/dashboards/title";

/** Renommage d'un dashboard enregistré, sur place (liste ou page du dashboard). */
export function RenameDashboard({ id, title, label = "Renommer" }: { id: string; title: string; label?: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const outcome = await renameDashboard(id, value);
    setBusy(false);
    if (!outcome.ok) return setError(outcome.message);
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(title);
          setEditing(true);
        }}
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
        aria-label={`Renommer « ${title} »`}
      >
        {label}
      </button>
    );
  }

  return (
    <form
      className="flex flex-col gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          autoFocus
          value={value}
          maxLength={DASHBOARD_TITLE_MAX}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
          }}
          aria-label="Nouveau nom du dashboard"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm sm:w-72"
        />
        <button type="submit" disabled={busy || value.trim() === ""} className="rounded-lg bg-teal-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-50">
          {busy ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button type="button" disabled={busy} onClick={() => setEditing(false)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50">
          Annuler
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      )}
    </form>
  );
}
