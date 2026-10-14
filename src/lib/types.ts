// Types partagés entre l'import, la pseudonymisation, le moteur de calcul et l'interface.

export type CellValue = string | number | null;
export type Row = Record<string, CellValue>;

/** Jeu de données brut, tel que lu dans le fichier importé (valeurs en clair). */
export interface RawDataset {
  fileName: string;
  columns: string[];
  rows: Row[];
  /** Remarques de lecture (ex. extraction d'un tableau PDF), reprises dans les points d'attention. */
  notes?: string[];
}

export type ColumnType = "date" | "number" | "email" | "phone" | "iban" | "category" | "text";

/**
 * Traitement appliqué à la colonne avant l'appel à l'IA :
 * - send : envoyée telle quelle (dates, montants, catégories non identifiantes) ;
 * - tokenize : valeurs remplacées par des jetons HMAC (clients, commerciaux…) ;
 * - drop : supprimée (identifiants directs : email, téléphone, IBAN) ;
 * - block : donnée sensible au sens du RGPD, exclue et signalée ;
 * - exclude : texte libre, exclu tant que la détection d'entités n'est pas en place.
 */
export type AiTreatment = "send" | "tokenize" | "drop" | "block" | "exclude";

export type ColumnRole = "date" | "measure" | "dimension" | "ignored";

export interface ColumnProfile {
  name: string;
  type: ColumnType;
  role: ColumnRole;
  treatment: AiTreatment;
  missing: number;
  distinct: number;
  /** Valeurs non conformes au type détecté (ex. texte dans une colonne numérique). */
  invalid: number;
  /** Raison lisible du traitement appliqué, affichée à l'utilisateur. */
  reason: string;
  /** Colonne de pourcentage : valeurs en fraction (0,37) ou en points (37). */
  percentScale?: "fraction" | "points";
}

export interface DatasetProfile {
  rowCount: number;
  /**
   * Fichiers reliés (US-15) : portée des colonnes propres à un fichier. Une cellule hors de sa portée est vide
   * par construction : ni valeur manquante, ni anomalie.
   */
  scopes?: import("@/lib/ingest/scopes").ColumnScopes | null;
  duplicateRows: number;
  columns: ColumnProfile[];
  warnings: string[];
}

/** Ligne typée : dates en ISO (AAAA-MM-JJ), nombres en number. */
export type TypedRow = Record<string, string | number | null>;

export type AiMode = "standard" | "strict";
