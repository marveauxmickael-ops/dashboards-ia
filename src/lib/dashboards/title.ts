// Nom d'un dashboard enregistré, choisi par l'utilisateur (le titre proposé à la création n'est qu'un point de départ).

export const DASHBOARD_TITLE_MAX = 120;

/** Nom nettoyé (espaces et caractères de contrôle retirés), ou null s'il est vide ou trop long. */
export function normalizeTitle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const title = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return title.length > 0 && title.length <= DASHBOARD_TITLE_MAX ? title : null;
}

/**
 * Le nom enregistré prime sur le titre du résultat calculé : il est repris à l'écran, dans le PDF,
 * les exports et le lien partagé, et n'est pas écrasé par une actualisation.
 */
export function withTitle<T extends { title: string }>(result: T, title: string | null | undefined): T {
  return title ? { ...result, title } : result;
}
