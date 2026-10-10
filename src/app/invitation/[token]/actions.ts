"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACTIVE_ORG_COOKIE } from "@/lib/auth/session";
import { isSecretTokenFormat } from "@/lib/share";
import { createClient } from "@/lib/supabase/server";

/** Accepte l'invitation (vérifiée par la base : jeton, expiration, adresse) et ouvre l'organisation rejointe. */
export async function acceptInvitation(form: FormData): Promise<void> {
  const token = String(form.get("token") ?? "");
  if (!isSecretTokenFormat(token)) redirect("/");
  const supabase = await createClient();
  const { data: organizationId, error } = await supabase.rpc("accept_invitation", { invite_token: token });
  if (error || !organizationId) redirect(`/invitation/${token}?erreur=1`);
  (await cookies()).set(ACTIVE_ORG_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect("/dashboards");
}
