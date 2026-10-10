// Remplace node:crypto dans la démo navigateur : même API createHmac, via @noble/hashes.
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

type Bytes = Uint8Array;
const toBytes = (v: string | Bytes): Bytes => (typeof v === "string" ? utf8ToBytes(v) : v);

export function createHmac(_algorithm: "sha256", key: string | Bytes) {
  const chunks: Bytes[] = [];
  return {
    update(data: string | Bytes) {
      chunks.push(toBytes(data));
      return this;
    },
    // Même surcharge que node:crypto : chaîne hexadécimale ou octets.
    digest(encoding?: "hex"): string & Bytes {
      const total = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
      let offset = 0;
      for (const c of chunks) {
        total.set(c, offset);
        offset += c.length;
      }
      const mac = hmac(sha256, toBytes(key), total);
      return (encoding === "hex" ? bytesToHex(mac) : mac) as string & Bytes;
    },
  };
}
