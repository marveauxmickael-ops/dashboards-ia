"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logEvent } from "@/lib/audit";
import { canEdit, getWorkspace, requireWorkspace } from "@/lib/auth/session";
import { DASHBOARD_TITLE_MAX, normalizeTitle } from "@/lib/dashboards/title";
import { ViewSchema } from "@/lib/view";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RenameOutcome = { ok: true; title: string } | { ok: false; message: string };

/** Renomme un dashboard enregistré : seul le nom change (ni les chiffres ni la date d'actualisation). */
export async function renameDashboard(id: string, rawTitle: string): Promise<RenameOutcome> {
  const workspace = await getWorkspace();
  if (!workspace) return { ok: false, message: "Votre session a expiré. Reconnectez-vous." };
  if (!canEdit(workspace.role)) return { ok: false, message: "Votre rôle (lecteur) ne permet pas de renommer un dashboard." };
  const title = normalizeTitle(rawTitle);
  if (!title) return { ok: false, message: `Le nom doit contenir entre 1 et ${DASHBOARD_TITLE_MAX} caractères.` };
  if (!UUID.test(id)) return { ok: false, message: "Dashboard introuvable." };

  const { supabase } = workspace;
  const { data: before } = await supabase.from("dashboards").select("title").eq("id", id).maybeSingle();
  if (!before) return { ok: false, message: "Dashboard introuvable." };
  if (before.title === title) return { ok: true, title };
  // La RLS limite la modification aux éditeurs de l'organisation du dashboard.
  const { data, error } = await supabase.from("dashboards").update({ title }).eq("id", id).select("title");
  if (error || !data || data.length === 0) return { ok: false, message: "Le nom n'a pas pu être enregistré. Réessayez." };

  await logEvent(workspace, "dashboard.renamed", { type: "dashboard", id }, { "ancien nom": before.title, "nouveau nom": title });
  revalidatePath("/dashboards");
  revalidatePath(`/dashboards/${id}`);
  return { ok: true, title };
}

export type SaveViewOutcome = { ok: true } | { ok: false; message: string };

/**
 * Enregistre la personnalisation de l'affichage avec le dashboard : les lecteurs de l'organisation et le lien
 * de partage la voient telle quelle. Ni les chiffres ni la date d'actualisation ne changent.
 */
export async function saveDashboardView(id: string, rawView: unknown): Promise<SaveViewOutcome> {
  const workspace = await getWorkspace();
  if (!workspace) return { ok: false, message: "Votre session a expiré. Reconnectez-vous." };
  if (!canEdit(workspace.role)) return { ok: false, message: "Votre rôle (lecteur) ne permet pas de modifier l'affichage." };
  if (!UUID.test(id)) return { ok: false, message: "Dashboard introuvable." };
  const view = ViewSchema.safeParse(rawView);
  if (!view.success) return { ok: false, message: "Affichage invalide." };
  // La RLS limite la modification aux éditeurs de l'organisation du dashboard.
  const { data, error } = await workspace.supabase.from("dashboards").update({ display: view.data }).eq("id", id).select("id");
  if (error || !data || data.length === 0) return { ok: false, message: "L'affichage n'a pas pu être enregistré. Réessayez." };
  return { ok: true };
}

export async function deleteDashboard(form: FormData) {
  const workspace = await requireWorkspace();
  const id = form.get("id");
  // La RLS refuse de toute façon la suppression hors de l'organisation ou pour un lecteur.
  if (typeof id === "string" && canEdit(workspace.role)) {
    const { data } = await workspace.supabase.from("dashboards").delete().eq("id", id).select("title");
    if (data && data.length > 0) await logEvent(workspace, "dashboard.deleted", { type: "dashboard", id }, { title: data[0].title });
  }
  redirect("/dashboards");
}
