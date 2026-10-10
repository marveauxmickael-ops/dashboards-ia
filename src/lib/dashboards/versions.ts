import type { Workspace } from "@/lib/auth/session";
import type { DashboardResult } from "@/lib/pipeline";
import type { Json } from "@/lib/supabase/database.types";

/**
 * Enregistre une version du dashboard (US-09) : une par création et par actualisation réussie.
 * L'historique est en ajout seul (RLS) et permet de consulter et comparer les périodes précédentes.
 */
export async function saveVersion(workspace: Workspace, dashboardId: string, result: DashboardResult, createdAt?: string): Promise<void> {
  const { error } = await workspace.supabase.from("dashboard_versions").insert({
    dashboard_id: dashboardId,
    organization_id: workspace.organization.id,
    created_by: workspace.user.id,
    file_name: result.fileName,
    row_count: result.profile.rowCount,
    period_start: result.period?.from ?? null,
    period_end: result.period?.to ?? null,
    result: result as unknown as Json,
    ...(createdAt ? { created_at: createdAt } : {}),
  });
  if (error) console.error("Enregistrement de la version en échec", error.code);
}
