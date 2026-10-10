"use server";

import { redirect } from "next/navigation";
import { logEvent } from "@/lib/audit";
import { canEdit, requireWorkspace } from "@/lib/auth/session";

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
