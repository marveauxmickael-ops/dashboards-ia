"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logEvent } from "@/lib/audit";
import { safeNextPath } from "@/lib/auth/redirect";
import { MFA_PATH, needsSecondFactor } from "@/lib/auth/mfa";
import { getWorkspace } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/** `fields` renvoie les saisies non sensibles pour les réafficher après une erreur (jamais le mot de passe). */
export type AuthState = { error?: string; info?: string; fields?: Record<string, string> };

function kept(form: FormData, ...names: string[]): Record<string, string> {
  return Object.fromEntries(names.map((n) => [n, String(form.get(n) ?? "")]));
}

// Supabase ne normalise pas l'email : une majuscule ou un espace suffit à faire échouer la connexion.
const email = z.string().trim().toLowerCase().email("Adresse email invalide.");
// 12 caractères minimum, sans règle de composition (recommandations ANSSI et CNIL).
const newPassword = z.string().min(12, "Le mot de passe doit contenir au moins 12 caractères.").max(128, "128 caractères maximum.");

async function siteUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
}

const GENERIC_LOGIN_ERROR = "Email ou mot de passe incorrect.";

export async function login(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = z.object({ email, password: z.string().min(1, "Saisissez votre mot de passe.") }).safeParse({
    email: form.get("email"),
    password: form.get("password"),
  });
  const fields = kept(form, "email");
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: "Votre adresse email n'est pas encore confirmée. Ouvrez le lien reçu à l'inscription (pensez aux spams).", fields };
    }
    if (error.status === 429) return { error: "Trop de tentatives. Patientez quelques minutes avant de réessayer.", fields };
    // Même message que l'email existe ou non : on ne révèle pas quels comptes existent.
    return { error: GENERIC_LOGIN_ERROR, fields };
  }
  const next = safeNextPath(form.get("next")?.toString());
  if (await needsSecondFactor(supabase)) redirect(`${MFA_PATH}?next=${encodeURIComponent(next)}`);
  const workspace = await getWorkspace();
  if (workspace) await logEvent(workspace, "auth.login");
  redirect(next);
}

export async function signup(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = z
    .object({
      email,
      password: newPassword,
      organization: z.string().trim().min(1, "Indiquez le nom de votre organisation.").max(120, "120 caractères maximum."),
      consent: z.literal("on", { message: "Acceptez les conditions et la politique de confidentialité pour continuer." }),
    })
    .safeParse({
      email: form.get("email"),
      password: form.get("password"),
      organization: form.get("organization"),
      consent: form.get("consent"),
    });
  const fields = kept(form, "email", "organization");
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields };

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // Lu par le déclencheur handle_new_user pour créer l'organisation.
      data: { organization_name: parsed.data.organization, terms_accepted_at: new Date().toISOString() },
      emailRedirectTo: `${await siteUrl()}/auth/confirm`,
    },
  });
  if (error) {
    if (error.code === "weak_password") return { error: "Ce mot de passe figure dans des fuites connues ou est trop faible. Choisissez-en un autre.", fields };
    if (error.status === 429) return { error: "Trop de tentatives. Patientez quelques minutes avant de réessayer.", fields };
    return { error: "L'inscription a échoué. Vérifiez vos informations et réessayez.", fields };
  }
  // Réponse identique que l'adresse soit déjà utilisée ou non.
  return { info: "Un email de confirmation vient de vous être envoyé. Ouvrez le lien qu'il contient pour activer votre compte." };
}

export async function requestPasswordReset(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = email.safeParse(form.get("email"));
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields: kept(form, "email") };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${await siteUrl()}/auth/confirm?next=/reinitialiser`,
  });
  // Même réponse que le compte existe ou non.
  return { info: "Si un compte existe pour cette adresse, un lien de réinitialisation valable une heure vient d'être envoyé." };
}

export async function updatePassword(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = newPassword.safeParse(form.get("password"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (form.get("password") !== form.get("confirmation")) return { error: "Les deux mots de passe ne correspondent pas." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Le lien a expiré. Refaites une demande de réinitialisation." };

  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) {
    if (error.code === "same_password") return { error: "Choisissez un mot de passe différent de l'ancien." };
    if (error.code === "weak_password") return { error: "Ce mot de passe figure dans des fuites connues ou est trop faible. Choisissez-en un autre." };
    return { error: "Le mot de passe n'a pas pu être modifié. Réessayez." };
  }
  // Toutes les autres sessions sont fermées après un changement de mot de passe.
  await supabase.auth.signOut({ scope: "others" });
  redirect("/");
}

/** Second facteur (TOTP) après le mot de passe : la session passe au niveau aal2. */
export async function verifySecondFactor(_prev: AuthState, form: FormData): Promise<AuthState> {
  const code = String(form.get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return { error: "Saisissez les 6 chiffres affichés par votre application." };
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp.find((f) => f.status === "verified");
  if (!factor) redirect("/");
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) {
    if (error.status === 429) return { error: "Trop de tentatives. Patientez quelques minutes avant de réessayer." };
    return { error: "Code incorrect ou expiré. Saisissez le code actuellement affiché." };
  }
  const workspace = await getWorkspace();
  if (workspace) await logEvent(workspace, "auth.login", undefined, { second_factor: true });
  redirect(safeNextPath(form.get("next")?.toString()));
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/connexion");
}
