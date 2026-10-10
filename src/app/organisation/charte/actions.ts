"use server";

import { revalidatePath } from "next/cache";
import { logEvent } from "@/lib/audit";
import { canManage, requireWorkspace } from "@/lib/auth/session";
import { BrandingSchema, type Branding } from "@/lib/branding";

/** Enregistre la charte graphique de l'organisation (propriétaire ou administrateur, contrôlé aussi par la RLS). */
export async function saveBranding(input: Branding): Promise<{ ok: true } | { ok: false; message: string }> {
  const workspace = await requireWorkspace();
  const { supabase, organization, role } = workspace;
  if (!canManage(role)) return { ok: false, message: "Seuls le propriétaire et les administrateurs peuvent modifier la charte." };
  const parsed = BrandingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Charte invalide." };
  const { error } = await supabase.from("organizations").update({ branding: parsed.data }).eq("id", organization.id);
  if (error) return { ok: false, message: "La charte n'a pas pu être enregistrée." };
  await logEvent(workspace, "branding.updated", { type: "organization", id: organization.id }, { logo: !!parsed.data.logo, colors: parsed.data.colors });
  revalidatePath("/", "layout");
  return { ok: true };
}
