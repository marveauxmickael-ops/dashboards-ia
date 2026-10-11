"use client";

import { linkOriginWarning, noSubscription, publicOrigin } from "@/lib/site";
import { useState, useSyncExternalStore } from "react";
import { createShareLink, revokeShare, updateShare, type ShareState } from "@/app/dashboards/[id]/share-actions";
import { SHARE_ACCESS_LABEL, type ShareAccess } from "@/lib/share";

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" });

/** Partage par lien sécurisé (US-01) : activer, désactiver, choisir le niveau d'accès, révoquer. */
export function SharePanel({ dashboardId, initial }: { dashboardId: string; initial: ShareState | null }) {
  const [share, setShare] = useState(initial);
  const [link, setLink] = useState<string | null>(null);
  const [access, setAccess] = useState<ShareAccess>(initial?.access ?? "view");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Lu côté navigateur seulement (pas de différence entre rendu serveur et hydratation).
  const originWarning = useSyncExternalStore(noSubscription, linkOriginWarning, () => null);

  async function run(action: () => ReturnType<typeof updateShare>) {
    setBusy(true);
    setError(null);
    const outcome = await action();
    setBusy(false);
    if (!outcome.ok) return setError(outcome.message);
    setShare(outcome.share);
    if (outcome.share) setAccess(outcome.share.access);
    setLink(outcome.token ? `${publicOrigin()}/partage/${outcome.token}` : null);
    setCopied(false);
  }

  const button = "rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50";

  return (
    <section aria-label="Partage" className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 print:hidden">
      <div>
        <h3 className="text-base font-semibold text-slate-900">Partager par lien sécurisé</h3>
        <p className="mt-1 text-sm text-slate-600">
          Les personnes qui ont le lien consultent les résultats sur Lisio, sans créer de compte. Elles n&apos;ont jamais accès au fichier source, qui n&apos;est
          pas conservé, ni aux données envoyées à l&apos;IA.
        </p>
      </div>

      {originWarning && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{originWarning}</p>}
      <label className="flex flex-col gap-1 text-sm text-slate-700 sm:flex-row sm:items-center sm:gap-2">
        Niveau d&apos;accès
        <select
          value={access}
          disabled={busy}
          onChange={(e) => {
            const next = e.target.value as ShareAccess;
            setAccess(next);
            if (share) void run(() => updateShare(share.id, { access: next }));
          }}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
        >
          {(Object.keys(SHARE_ACCESS_LABEL) as ShareAccess[]).map((a) => (
            <option key={a} value={a}>
              {SHARE_ACCESS_LABEL[a]}
            </option>
          ))}
        </select>
      </label>

      {share ? (
        <div className="flex flex-col gap-2 text-sm">
          <p className={share.enabled ? "text-emerald-800" : "text-amber-800"}>
            {share.enabled ? "Partage actif" : "Partage désactivé : le lien ne donne plus accès"} · lien créé le {dateFormat.format(new Date(share.created_at))}
          </p>
          {link && (
            <div className="flex flex-col gap-1 rounded-lg bg-brand-50 p-2">
              <span className="text-xs text-brand-900">Copiez le lien maintenant : pour des raisons de sécurité, il ne sera plus affiché.</span>
              <div className="flex gap-2">
                <input readOnly value={link} className="min-w-0 flex-1 rounded border border-brand-200 bg-white px-2 py-1 font-mono text-xs" onFocus={(e) => e.target.select()} />
                <button
                  type="button"
                  className={button}
                  onClick={() => {
                    void navigator.clipboard.writeText(link).then(() => setCopied(true));
                  }}
                >
                  {copied ? "Copié" : "Copier"}
                </button>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} className={button} onClick={() => void run(() => updateShare(share.id, { enabled: !share.enabled }))}>
              {share.enabled ? "Désactiver le partage" : "Réactiver le partage"}
            </button>
            <button type="button" disabled={busy} className={button} onClick={() => void run(() => createShareLink(dashboardId, access))}>
              Générer un nouveau lien
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-50 disabled:opacity-50"
              onClick={() => {
                if (window.confirm("Révoquer définitivement ce lien ? Plus personne ne pourra l'utiliser.")) void run(() => revokeShare(share.id));
              }}
            >
              Révoquer le lien
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => createShareLink(dashboardId, access))}
            className="rounded-lg bg-brand-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-900 disabled:opacity-50"
          >
            Activer le partage
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      )}
    </section>
  );
}
