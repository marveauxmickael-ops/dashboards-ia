import type { DashboardResult } from "@/lib/pipeline";
import { withTitle } from "./title";
import { isShareTokenFormat, type ShareAccess } from "@/lib/share";
import { createClient } from "@/lib/supabase/server";

export interface SharedDashboard {
  title: string;
  organization: string;
  branding?: unknown;
  access: ShareAccess;
  refreshed_at: string;
  result: DashboardResult;
}

/**
 * Dashboard partagé, lu par la fonction `shared_dashboard` : elle vérifie le hachage du jeton, l'activation,
 * la révocation et l'expiration, et ne renvoie que les résultats calculés. null si le lien n'est pas valide.
 */
export async function loadSharedDashboard(token: string): Promise<SharedDashboard | null> {
  if (!isShareTokenFormat(token)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("shared_dashboard", { share_token: token });
  if (error || !data) return null;
  const shared = data as unknown as SharedDashboard;
  // La fonction retire du résultat ce qui ne concerne pas le lecteur (contexte IA, structure, éléments écartés) :
  // on rétablit des valeurs vides pour que l'affichage ne dépende pas de ces champs.
  return { ...shared, result: withTitle({ ...shared.result, issues: shared.result.issues ?? [] }, shared.title) };
}
