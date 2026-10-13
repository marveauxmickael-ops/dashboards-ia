import { createHmac } from "node:crypto";
import { canonicalDataset } from "@/lib/merge";
import { pseudonymizationKey } from "@/lib/pipeline";
import type { RawDataset } from "@/lib/types";

/**
 * Empreinte du fichier source d'une version (US-12) : HMAC-SHA-256 de son contenu canonique, avec une clé propre
 * à l'organisation. Elle permet de reconnaître le fichier de la version en cours sans en conserver le contenu,
 * et ne permet pas de le reconstituer ni de tester un contenu deviné sans la clé.
 */
export function sourceFingerprint(raw: RawDataset, organizationId: string): string {
  return createHmac("sha256", `${pseudonymizationKey()}:empreinte:${organizationId}`).update(canonicalDataset(raw)).digest("hex");
}
