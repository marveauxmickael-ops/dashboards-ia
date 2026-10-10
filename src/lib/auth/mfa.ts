import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * true si l'utilisateur a activé la double authentification mais que la session n'est pas encore vérifiée
 * par le second facteur (aal1 → aal2). Lecture du jeton de session, sans appel réseau supplémentaire.
 */
export async function needsSecondFactor(supabase: Client): Promise<boolean> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return false;
  return data.nextLevel === "aal2" && data.currentLevel !== "aal2";
}

export const MFA_PATH = "/connexion/verification";
