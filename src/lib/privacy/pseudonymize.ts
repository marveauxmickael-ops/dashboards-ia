import { createHmac } from "node:crypto";

// Pseudonymisation réversible côté serveur uniquement :
// - à l'aller, chaque valeur identifiante devient un jeton HMAC-SHA256 (ex. CLIENT_a3f91c02) ;
// - au retour, les jetons présents dans la réponse de l'IA sont remplacés par les valeurs en clair.
// La clé et la table de correspondance ne quittent jamais le backend.

const TOKEN_RE = /\b[A-Z][A-Z0-9_]{0,15}_[0-9a-f]{8,12}\b/g;

export class Pseudonymizer {
  private readonly key: Buffer;
  private readonly toClear = new Map<string, string>();
  private readonly toToken = new Map<string, string>();

  private constructor(key: Buffer) {
    this.key = key;
  }

  /** Clé dérivée par organisation : deux clients n'obtiennent jamais les mêmes jetons. */
  static forOrganization(secret: string, organizationId: string): Pseudonymizer {
    if (!secret) throw new Error("PSEUDONYMIZATION_KEY manquante : la pseudonymisation est impossible.");
    return new Pseudonymizer(createHmac("sha256", secret).update(`org:${organizationId}`).digest());
  }

  /** Remplace une valeur par un jeton stable, préfixé par le nom de la colonne. */
  tokenize(column: string, value: string): string {
    const cacheKey = `${column}\u0000${value}`;
    const cached = this.toToken.get(cacheKey);
    if (cached) return cached;

    const prefix = tokenPrefix(column);
    const digest = createHmac("sha256", this.key).update(cacheKey).digest("hex");
    let token = `${prefix}_${digest.slice(0, 8)}`;
    // Collision (improbable) : on allonge le jeton plutôt que de confondre deux valeurs.
    if (this.toClear.has(token) && this.toClear.get(token) !== value) token = `${prefix}_${digest.slice(0, 12)}`;

    this.toClear.set(token, value);
    this.toToken.set(cacheKey, token);
    return token;
  }

  /** Remplace les jetons connus par les valeurs en clair ; signale les jetons inconnus. */
  reidentify(text: string): { text: string; unknownTokens: string[] } {
    const unknownTokens: string[] = [];
    const out = text.replace(TOKEN_RE, (token) => {
      const clear = this.toClear.get(token);
      if (clear === undefined) {
        unknownTokens.push(token);
        return token;
      }
      return clear;
    });
    return { text: out, unknownTokens };
  }

  isKnownToken(value: string): boolean {
    return this.toClear.has(value);
  }

  get size(): number {
    return this.toClear.size;
  }
}

export function tokenPrefix(column: string): string {
  const p = column
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 12)
    .replace(/_+$/, "");
  return /^[A-Z]/.test(p) ? p : `V${p}`.slice(0, 12) || "VAL";
}
