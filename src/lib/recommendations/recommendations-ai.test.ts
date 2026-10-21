import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parseCsv } from "@/lib/ingest/parse";
import { profileDataset } from "@/lib/ingest/profile";
import { Pseudonymizer } from "@/lib/privacy/pseudonymize";
import { computeShrinkage } from "@/lib/shrinkage";

// L'IA est simulée : on vérifie ce qui lui est envoyé et ce qui est gardé de sa réponse.
const sent: string[] = [];
vi.mock("@/lib/ai/gateway", async (original) => ({
  ...(await original<typeof import("@/lib/ai/gateway")>()),
  activeProvider: () => "anthropic",
  callClaude: vi.fn(async (_p: unknown, _s: unknown, _sys: string, user: string) => {
    sent.push(user);
    const signals = JSON.parse(user.slice(user.indexOf("["), user.lastIndexOf("]") + 1)) as { id: string; subject: string }[];
    return {
      provider: "anthropic",
      model: "test",
      inputTokens: 1,
      outputTokens: 1,
      output: {
        recommendations: signals.map((s, i) => ({
          id: s.id,
          title: `Agir sur ${s.subject}`,
          // Le second conseil contient un chiffre : il doit être remplacé par la règle.
          action: i === 1 ? "Réduire les commandes de 20 %." : "Commander plus souvent, en plus petites quantités.",
        })),
      },
    };
  }),
}));

const { recommend } = await import("@/lib/recommendations");

describe("recommandations rédigées par l'IA", () => {
  const journal = parseCsv("demarque.csv", readFileSync(path.resolve(import.meta.dirname, "../../../public/demo/multi/demarque-septembre-2026-bastille.csv"), "utf-8"));
  const { profile, rows } = profileDataset(journal);
  const shrinkage = computeShrinkage(profile, rows);

  it("n'envoie aucun nom d'article en clair, ré-identifie la réponse et écarte tout chiffre écrit par l'IA", async () => {
    const result = await recommend({ profile, rows, shrinkage, mode: "standard", pseudo: Pseudonymizer.forOrganization("cle-test", "org"), allowAi: true });
    expect(result.writtenBy).toBe("ai");
    for (const item of shrinkage!.items.slice(0, 3)) expect(sent[0]).not.toContain(item.item);
    expect(result.items[0].title).toBe(`Agir sur ${shrinkage!.items[0].item}`);
    expect(result.items[0].action).toBe("Commander plus souvent, en plus petites quantités.");
    // Chiffre écrit par l'IA : conseil rédigé par la règle, le « pourquoi » reste celui du moteur.
    expect(result.items[1].action).not.toContain("20");
    expect(result.items[1].why).toMatch(/€/);
  });
});
