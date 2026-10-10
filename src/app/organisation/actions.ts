"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logEvent } from "@/lib/audit";
import { ACTIVE_ORG_COOKIE, canManage, requireWorkspace, type Role } from "@/lib/auth/session";
import { generateSecretToken } from "@/lib/share";

type Outcome = { ok: true; token?: string } | { ok: false; message: string };

const INVITABLE: Role[] = ["admin", "editor", "viewer"];
// Messages des fonctions de la base, déjà rédigés pour l'utilisateur ; les autres erreurs restent génériques.
const KNOWN = [
  "action réservée au propriétaire et aux administrateurs",
  "seul un propriétaire peut modifier le rôle de propriétaire",
  "l'organisation doit garder au moins un propriétaire",
  "membre introuvable",
  "rôle inconnu",
];

function readable(message: string | undefined, fallback: string): string {
  const known = KNOWN.find((k) => message?.includes(k));
  return known ? known.charAt(0).toUpperCase() + known.slice(1) + "." : fallback;
}

const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 };

/** Change l'organisation active (utilisateur membre de plusieurs organisations). */
export async function switchOrganization(form: FormData) {
  const workspace = await requireWorkspace();
  const id = String(form.get("organization") ?? "");
  if (workspace.organizations.some((o) => o.id === id)) (await cookies()).set(ACTIVE_ORG_COOKIE, id, cookieOptions);
  redirect("/");
}

/** Invitation par lien : le lien (jeton) n'est affiché qu'une fois ; seul son hachage est enregistré. */
export async function inviteMember(email: string, role: Role): Promise<Outcome> {
  const workspace = await requireWorkspace();
  if (!canManage(workspace.role)) return { ok: false, message: "Seuls le propriétaire et les administrateurs peuvent inviter." };
  const parsed = z.string().trim().toLowerCase().email().max(254).safeParse(email);
  if (!parsed.success) return { ok: false, message: "Adresse email invalide." };
  if (!INVITABLE.includes(role)) return { ok: false, message: "Rôle invalide." };
  const { token, hash } = generateSecretToken();
  const { data, error } = await workspace.supabase
    .from("invitations")
    .insert({ organization_id: workspace.organization.id, email: parsed.data, role, token_hash: hash, invited_by: workspace.user.id })
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: "L'invitation n'a pas pu être créée." };
  await logEvent(workspace, "member.invited", { type: "invitation", id: data.id }, { email: parsed.data, role });
  revalidatePath("/organisation");
  return { ok: true, token };
}

export async function revokeInvitation(id: string): Promise<Outcome> {
  const workspace = await requireWorkspace();
  if (!canManage(workspace.role)) return { ok: false, message: "Action non autorisée." };
  const { data, error } = await workspace.supabase.from("invitations").update({ revoked_at: new Date().toISOString() }).eq("id", id).is("accepted_at", null).select("id");
  if (error || !data?.length) return { ok: false, message: "L'invitation n'a pas pu être révoquée." };
  await logEvent(workspace, "invitation.revoked", { type: "invitation", id });
  revalidatePath("/organisation");
  return { ok: true };
}

export async function changeRole(userId: string, role: Role): Promise<Outcome> {
  const workspace = await requireWorkspace();
  const { error } = await workspace.supabase.rpc("set_member_role", { org: workspace.organization.id, member: userId, new_role: role });
  if (error) return { ok: false, message: readable(error.message, "Le rôle n'a pas pu être modifié.") };
  revalidatePath("/organisation");
  return { ok: true };
}

/** Retrait d'un membre, ou départ volontaire si `userId` est l'utilisateur connecté. */
export async function removeMember(userId: string): Promise<Outcome> {
  const workspace = await requireWorkspace();
  const { data, error } = await workspace.supabase.from("memberships").delete().eq("organization_id", workspace.organization.id).eq("user_id", userId).select("user_id");
  if (error) return { ok: false, message: readable(error.message, "Le membre n'a pas pu être retiré.") };
  if (!data?.length) return { ok: false, message: "Action non autorisée." };
  if (userId === workspace.user.id) {
    (await cookies()).delete(ACTIVE_ORG_COOKIE);
    redirect("/");
  }
  revalidatePath("/organisation");
  return { ok: true };
}
