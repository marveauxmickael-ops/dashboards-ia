import type { DashboardResult } from "@/lib/pipeline";
import { applyView, parseView, type ViewState } from "@/lib/view";
import { withTitle } from "./title";
import { isShareTokenFormat, type ShareAccess } from "@/lib/share";
import { createClient } from "@/lib/supabase/server";

export interface SharedDashboard {
  title: string;
  organization: string;
  branding?: unknown;
  access: ShareAccess;
  refreshed_at: string;
  /** Affichage choisi par les éditeurs, déjà appliqué à `result`. */
  view: ViewState;
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
  const { display, ...shared } = data as unknown as Omit<SharedDashboard, "view"> & { display?: unknown };
  // La fonction retire du résultat ce qui ne concerne pas le lecteur (contexte IA, structure, éléments écartés) :
  // on rétablit des valeurs vides pour que l'affichage ne dépende pas de ces champs.
  const result = withTitle({ ...shared.result, issues: shared.result.issues ?? [] }, shared.title);
  // L'affichage choisi par l'éditeur est appliqué ici, sur le serveur : ce qu'il a masqué (indicateurs, graphiques,
  // catégories, sections) n'est jamais envoyé au navigateur du lecteur, ni inclus dans ses téléchargements.
  const view = parseView(display);
  return { ...shared, view, result: applyView(result, view) };
}
