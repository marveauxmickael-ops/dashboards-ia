import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "owner" | "admin" | "editor" | "viewer";

export interface Workspace {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: { id: string; email: string };
  organization: { id: string; name: string };
  role: Role;
}

/**
 * Utilisateur connecté et son organisation. Toutes les lectures passent par la session
 * de l'utilisateur : la RLS garantit qu'il ne voit que ses propres organisations.
 */
export async function getWorkspace(): Promise<Workspace | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Le prototype gère une organisation par utilisateur : la première (la plus ancienne).
  const { data: membership } = await supabase
    .from("memberships")
    .select("role, organizations(id, name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!membership?.organizations) return null;

  return {
    supabase,
    user: { id: user.id, email: user.email ?? "" },
    organization: membership.organizations,
    role: membership.role as Role,
  };
}

/** Pour les pages : renvoie vers la connexion si la session ou l'organisation manque. */
export async function requireWorkspace(): Promise<Workspace> {
  const workspace = await getWorkspace();
  if (!workspace) redirect("/connexion");
  return workspace;
}

export function canEdit(role: Role): boolean {
  return role === "owner" || role === "admin" || role === "editor";
}
