// Noms de colonnes lisibles à l'écran : « Libellé rayon » devient « Rayon ». Les calculs et les formules gardent
// le nom exact de la colonne du fichier ; seul l'affichage (titres, filtres, en-têtes) est simplifié.
const LABEL_PREFIX = /^(libell[ée]s?|lib\.|intitul[ée]s?)\s+(du |de la |de l'|de l’|des |de |d'|d’)?/i;

export function displayName(column: string): string {
  const name = column.replace(LABEL_PREFIX, "").trim();
  if (!name) return column;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Même nom, au milieu d'une phrase (« Par rayon ») : minuscule initiale, sauf pour un sigle (EAN, PDV). */
export function displayNameInSentence(column: string): string {
  const name = displayName(column);
  return /^.[a-zà-ÿ]/.test(name) ? name.charAt(0).toLowerCase() + name.slice(1) : name;
}
