"use server";

import { canEdit, requireWorkspace } from "@/lib/auth/session";
import { generateShareToken, type ShareAccess } from "@/lib/share";

export interface ShareState {
  id: string;
  access: ShareAccess;
  enabled: boolean;
  created_at: string;
}

type Outcome = { ok: true; share: ShareState | null; token?: string } | { ok: false; message: string };

const ACCESS = new Set<ShareAccess>(["view", "view_export"]);
const SELECT = "id, access, enabled, created_at";

async function editor() {
  const workspace = await requireWorkspace();
  return canEdit(workspace.role) ? workspace : null;
}

/** Crée un nouveau lien ; l'éventuel lien précédent est révoqué (un seul lien actif par dashboard). */
export async function createShareLink(dashboardId: string, access: ShareAccess): Promise<Outcome> {
  const workspace = await editor();
  if (!workspace || !ACCESS.has(access)) return { ok: false, message: "Action non autorisée." };
  const { supabase, organization, user } = workspace;
  await supabase.from("dashboard_shares").update({ enabled: false, revoked_at: new Date().toISOString() }).eq("dashboard_id", dashboardId).is("revoked_at", null);
  const { token, hash } = generateShareToken();
  const { data, error } = await supabase
    .from("dashboard_shares")
    .insert({ dashboard_id: dashboardId, organization_id: organization.id, created_by: user.id, token_hash: hash, access })
    .select(SELECT)
    .single();
  if (error || !data) return { ok: false, message: "Le lien n'a pas pu être créé." };
  return { ok: true, share: data as ShareState, token };
}

export async function updateShare(shareId: string, changes: { enabled?: boolean; access?: ShareAccess }): Promise<Outcome> {
  const workspace = await editor();
  if (!workspace || (changes.access && !ACCESS.has(changes.access))) return { ok: false, message: "Action non autorisée." };
  const { data, error } = await workspace.supabase.from("dashboard_shares").update(changes).eq("id", shareId).is("revoked_at", null).select(SELECT).maybeSingle();
  if (error || !data) return { ok: false, message: "Le lien n'a pas pu être modifié." };
  return { ok: true, share: data as ShareState };
}

/** Révocation définitive : le lien ne fonctionnera plus jamais, même réactivé. */
export async function revokeShare(shareId: string): Promise<Outcome> {
  const workspace = await editor();
  if (!workspace) return { ok: false, message: "Action non autorisée." };
  const { error } = await workspace.supabase.from("dashboard_shares").update({ enabled: false, revoked_at: new Date().toISOString() }).eq("id", shareId);
  if (error) return { ok: false, message: "Le lien n'a pas pu être révoqué." };
  return { ok: true, share: null };
}
