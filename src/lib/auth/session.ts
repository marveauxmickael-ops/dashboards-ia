import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { parseBranding, type Branding } from "@/lib/branding";
import { createClient } from "@/lib/supabase/server";

export type Role = "owner" | "admin" | "editor" | "viewer";

export const ROLE_LABEL: Record<Role, string> = { owner: "Propriétaire", admin: "Administrateur", editor: "Éditeur", viewer: "Lecteur" };

/** Cookie de l'organisation active, pour un utilisateur membre de plusieurs organisations. */
export const ACTIVE_ORG_COOKIE = "organisation-active";

export interface Workspace {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: { id: string; email: string };
  organization: { id: string; name: string; branding: Branding };
  role: Role;
  /** Toutes les organisations de l'utilisateur (sélecteur dans l'en-tête). */
  organizations: { id: string; name: string; role: Role }[];
}

/**
 * Utilisateur connecté et son organisation active. Toutes les lectures passent par la session
 * de l'utilisateur : la RLS garantit qu'il ne voit que ses propres organisations.
 */
export async function getWorkspace(): Promise<Workspace | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: memberships } = await supabase
    .from("memberships")
    .select("role, organizations(id, name, branding)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  const list = (memberships ?? []).filter((m) => m.organizations);
  if (list.length === 0) return null;

  // Organisation choisie (cookie), sinon la plus ancienne. Un cookie vers une organisation quittée est ignoré.
  const wanted = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value;
  const active = list.find((m) => m.organizations!.id === wanted) ?? list[0];

  return {
    supabase,
    user: { id: user.id, email: user.email ?? "" },
    organization: { id: active.organizations!.id, name: active.organizations!.name, branding: parseBranding(active.organizations!.branding) },
    role: active.role as Role,
    organizations: list.map((m) => ({ id: m.organizations!.id, name: m.organizations!.name, role: m.role as Role })),
  };
}

/** Pour les pages : renvoie vers la connexion si la session ou l'organisation manque. */
export async function requireWorkspace(): Promise<Workspace> {
  const workspace = await getWorkspace();
  if (!workspace) redirect("/connexion");
  return workspace;
}

/** Gestion de l'organisation (charte graphique, membres, journal) : propriétaire ou administrateur. */
export function canManage(role: Role): boolean {
  return role === "owner" || role === "admin";
}

export function canEdit(role: Role): boolean {
  return role === "owner" || role === "admin" || role === "editor";
}
