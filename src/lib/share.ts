import { createHash, randomBytes } from "node:crypto";

// Liens de partage (US-01) : jeton aléatoire de 256 bits. Seul son hachage SHA-256 est enregistré ;
// le lien complet n'est affiché qu'une fois, à sa création.

export type ShareAccess = "view" | "view_export";

export const SHARE_ACCESS_LABEL: Record<ShareAccess, string> = {
  view: "Consultation seule",
  view_export: "Consultation et téléchargement (Excel, CSV)",
};

export function generateShareToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashShareToken(token) };
}

export function hashShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Forme d'un jeton valide (43 caractères base64url) : on rejette le reste sans interroger la base. */
export function isShareTokenFormat(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}
