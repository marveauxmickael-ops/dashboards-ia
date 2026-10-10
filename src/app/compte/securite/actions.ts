"use server";

import { logEvent } from "@/lib/audit";
import { requireWorkspace } from "@/lib/auth/session";

type Outcome<T = object> = ({ ok: true } & T) | { ok: false; message: string };

/** Démarre l'activation : nouveau facteur TOTP (QR code et clé), à confirmer par un premier code. */
export async function startEnrollment(): Promise<Outcome<{ factorId: string; qr: string; secret: string }>> {
  const { supabase } = await requireWorkspace();
  // Une activation abandonnée laisse un facteur non vérifié : il est remplacé.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Application ${new Date().toISOString().slice(0, 10)}` });
  if (error || !data) return { ok: false, message: "L'activation n'a pas pu démarrer. Réessayez." };
  return { ok: true, factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

export async function confirmEnrollment(factorId: string, code: string): Promise<Outcome> {
  const workspace = await requireWorkspace();
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return { ok: false, message: "Saisissez les 6 chiffres affichés par l'application." };
  const { error } = await workspace.supabase.auth.mfa.challengeAndVerify({ factorId, code: clean });
  if (error) return { ok: false, message: "Code incorrect ou expiré. Saisissez le code actuellement affiché." };
  await logEvent(workspace, "mfa.enabled");
  return { ok: true };
}

/** Désactivation : possible seulement depuis une session déjà vérifiée par le second facteur (aal2). */
export async function disableMfa(): Promise<Outcome> {
  const workspace = await requireWorkspace();
  const { data: factors } = await workspace.supabase.auth.mfa.listFactors();
  for (const f of factors?.totp ?? []) {
    const { error } = await workspace.supabase.auth.mfa.unenroll({ factorId: f.id });
    if (error) return { ok: false, message: "La double authentification n'a pas pu être désactivée." };
  }
  await logEvent(workspace, "mfa.disabled");
  return { ok: true };
}
