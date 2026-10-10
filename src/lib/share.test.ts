import { describe, expect, it } from "vitest";
import { generateShareToken, hashShareToken, isShareTokenFormat } from "./share";

describe("jetons de partage", () => {
  it("sont aléatoires, au bon format, et seul leur hachage est conservé", () => {
    const a = generateShareToken();
    const b = generateShareToken();
    expect(a.token).not.toBe(b.token);
    expect(isShareTokenFormat(a.token)).toBe(true);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hash).toBe(hashShareToken(a.token));
    expect(a.hash).not.toContain(a.token);
  });

  it("rejettent les formats invalides sans requête", () => {
    expect(isShareTokenFormat("court")).toBe(false);
    expect(isShareTokenFormat("../../etc/passwd".padEnd(43, "a"))).toBe(false);
  });
});
