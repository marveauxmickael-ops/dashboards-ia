"use client";

import { useState } from "react";
import { confirmEnrollment, disableMfa, startEnrollment } from "@/app/compte/securite/actions";

/** Activation de la double authentification par application (TOTP) : QR code, puis premier code de confirmation. */
export function MfaSettings({ enabled: initiallyEnabled }: { enabled: boolean }) {
  const [enabled, setEnabled] = useState(initiallyEnabled);
  const [enrollment, setEnrollment] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const button = "rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50";

  async function start() {
    setBusy(true);
    setMessage(null);
    const outcome = await startEnrollment();
    setBusy(false);
    if (!outcome.ok) return setMessage({ tone: "error", text: outcome.message });
    setEnrollment({ factorId: outcome.factorId, qr: outcome.qr, secret: outcome.secret });
  }

  async function confirm() {
    if (!enrollment) return;
    setBusy(true);
    const outcome = await confirmEnrollment(enrollment.factorId, code);
    setBusy(false);
    if (!outcome.ok) return setMessage({ tone: "error", text: outcome.message });
    setEnabled(true);
    setEnrollment(null);
    setCode("");
    setMessage({ tone: "success", text: "Double authentification activée : un code vous sera demandé à chaque connexion." });
  }

  async function disable() {
    if (!window.confirm("Désactiver la double authentification ? Votre compte ne sera plus protégé que par le mot de passe.")) return;
    setBusy(true);
    const outcome = await disableMfa();
    setBusy(false);
    if (!outcome.ok) return setMessage({ tone: "error", text: outcome.message });
    setEnabled(false);
    setMessage({ tone: "success", text: "Double authentification désactivée." });
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Double authentification</h2>
        <p className="mt-1 text-sm text-slate-600">
          En plus du mot de passe, un code à 6 chiffres généré par une application (Google Authenticator, Microsoft Authenticator, 1Password…) est
          demandé à chaque connexion.
        </p>
      </div>
      <p className={`text-sm font-medium ${enabled ? "text-emerald-800" : "text-amber-800"}`}>{enabled ? "Activée" : "Non activée"}</p>

      {!enabled && !enrollment && (
        <button type="button" disabled={busy} onClick={() => void start()} className={`${button} w-fit bg-brand-800 text-white hover:bg-brand-900`}>
          Activer la double authentification
        </button>
      )}

      {enrollment && (
        <div className="flex flex-col gap-3">
          <ol className="list-decimal pl-5 text-sm text-slate-700">
            <li>Scannez ce QR code avec votre application d&apos;authentification.</li>
            <li>Saisissez le code à 6 chiffres qu&apos;elle affiche.</li>
          </ol>
          {/* eslint-disable-next-line @next/next/no-img-element -- QR code fourni en data URL par Supabase */}
          <img src={enrollment.qr} alt="QR code d'activation" className="size-44 rounded border border-slate-200 bg-white p-2" />
          <p className="text-xs text-slate-600">
            Impossible de scanner ? Clé à saisir manuellement : <code className="break-all font-mono">{enrollment.secret}</code>
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              Code
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-32 rounded-lg border border-slate-300 px-3 py-1.5 font-mono tracking-widest"
              />
            </label>
            <button type="button" disabled={busy} onClick={() => void confirm()} className={`${button} bg-brand-800 text-white hover:bg-brand-900`}>
              Confirmer
            </button>
            <button type="button" disabled={busy} onClick={() => setEnrollment(null)} className="text-sm text-slate-600 underline">
              Annuler
            </button>
          </div>
        </div>
      )}

      {enabled && (
        <button type="button" disabled={busy} onClick={() => void disable()} className={`${button} w-fit border border-red-200 text-red-800 hover:bg-red-50`}>
          Désactiver
        </button>
      )}

      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} className={`text-sm ${message.tone === "error" ? "text-red-800" : "text-emerald-800"}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}
