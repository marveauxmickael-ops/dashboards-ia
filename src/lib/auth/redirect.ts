/**
 * Chemin de retour après connexion : uniquement un chemin interne à l'application,
 * pour empêcher une redirection vers un site tiers (« //exemple.com », « https://… »).
 */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

export const PUBLIC_PATHS = ["/connexion", "/inscription", "/mot-de-passe-oublie", "/auth/confirm", "/demo/", "/partage/", "/tarifs", "/plaquette-lisio.pdf"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : `${p}/`));
}
