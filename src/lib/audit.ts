import type { Workspace } from "@/lib/auth/session";
import type { Json } from "@/lib/supabase/database.types";

// Journal d'audit : qui a fait quoi, quand, dans l'organisation. Métadonnées uniquement : jamais de données
// des fichiers. L'écriture passe par la session de l'utilisateur (RLS) ; le journal est en ajout seul.

export type AuditAction =
  | "auth.login"
  | "dashboard.created"
  | "dashboard.deleted"
  | "dashboard.refreshed"
  | "dashboard.exported"
  | "share.created"
  | "share.updated"
  | "share.revoked"
  | "branding.updated"
  | "member.invited"
  | "invitation.revoked"
  | "member.removed";

export const AUDIT_LABEL: Record<string, string> = {
  "auth.login": "Connexion",
  "dashboard.created": "Dashboard créé",
  "dashboard.deleted": "Dashboard supprimé",
  "dashboard.refreshed": "Dashboard actualisé",
  "dashboard.exported": "Dashboard téléchargé",
  "share.created": "Lien de partage créé",
  "share.updated": "Lien de partage modifié",
  "share.revoked": "Lien de partage révoqué",
  "branding.updated": "Charte graphique modifiée",
  "member.invited": "Membre invité",
  "invitation.revoked": "Invitation révoquée",
  "member.joined": "Invitation acceptée",
  "member.role_changed": "Rôle modifié",
  "member.removed": "Membre retiré",
};

/** Une erreur de journalisation n'interrompt jamais l'action de l'utilisateur ; elle est tracée côté serveur. */
export async function logEvent(
  workspace: Pick<Workspace, "supabase" | "user" | "organization">,
  action: AuditAction,
  target?: { type: string; id: string },
  details: Record<string, Json> = {},
): Promise<void> {
  const { error } = await workspace.supabase.from("audit_log").insert({
    organization_id: workspace.organization.id,
    user_id: workspace.user.id,
    user_email: workspace.user.email,
    action,
    target_type: target?.type ?? null,
    target_id: target?.id ?? null,
    details,
  });
  if (error) console.error("Journal d'audit : écriture en échec", action, error.code);
}
