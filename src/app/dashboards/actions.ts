"use server";

import { redirect } from "next/navigation";
import { canEdit, requireWorkspace } from "@/lib/auth/session";

export async function deleteDashboard(form: FormData) {
  const { supabase, role } = await requireWorkspace();
  const id = form.get("id");
  // La RLS refuse de toute façon la suppression hors de l'organisation ou pour un lecteur.
  if (typeof id === "string" && canEdit(role)) await supabase.from("dashboards").delete().eq("id", id);
  redirect("/dashboards");
}
