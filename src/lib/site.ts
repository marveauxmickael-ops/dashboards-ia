// Adresse publique de l'application, utilisée dans les liens envoyés (partage, invitation).
// Elle vient de NEXT_PUBLIC_SITE_URL (domaine de production) et non de l'adresse affichée dans le navigateur :
// un lien créé depuis une adresse de prévisualisation Vercel (protégée par un compte Vercel) bloquerait le destinataire.

export function publicOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return typeof window === "undefined" ? "" : window.location.origin;
}

/** Adresse de déploiement ou de prévisualisation Vercel (et non le domaine de production). */
export function isVercelPreviewHost(host: string): boolean {
  return /\.vercel\.app$/.test(host) && (/-git-/.test(host) || /-[a-z0-9]{9}-/.test(host));
}

/** Avertissement si les liens risquent de pointer vers une adresse protégée par Vercel. */
export function linkOriginWarning(): string | null {
  if (process.env.NEXT_PUBLIC_SITE_URL?.trim() || typeof window === "undefined") return null;
  return isVercelPreviewHost(window.location.host)
    ? "Vous êtes sur une adresse de prévisualisation Vercel : les destinataires du lien devraient se connecter à Vercel. Ouvrez l'application depuis son adresse de production avant de créer le lien."
    : null;
}

/** Abonnement vide pour useSyncExternalStore (valeur fixe pendant la vie de la page). */
export const noSubscription = () => () => undefined;
