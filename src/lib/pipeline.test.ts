import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/ingest/parse";
import { profileDataset } from "@/lib/ingest/profile";
import { buildAiContext, MIN_GROUP_SIZE } from "@/lib/privacy/ai-context";
import { Pseudonymizer } from "@/lib/privacy/pseudonymize";
import { generateDashboard } from "@/lib/pipeline";

const demoPath = path.resolve(import.meta.dirname, "../../public/demo/ventes-demo.csv");
const demoText = readFileSync(demoPath, "utf-8");
const demo = () => profileDataset(parseCsv("ventes-demo.csv", demoText));

describe("profilage du fichier de démonstration", () => {
  it("applique le bon traitement à chaque colonne", () => {
    const { profile } = demo();
    const treatment = Object.fromEntries(profile.columns.map((c) => [c.name, c.treatment]));
    expect(treatment).toEqual({
      Date: "send",
      Client: "tokenize",
      "Email contact": "drop",
      Commercial: "tokenize",
      Région: "send",
      Produit: "send",
      "Montant HT": "send",
      Coût: "send",
      Commentaire: "exclude",
    });
  });

  it("signale les anomalies sans les corriger en silence", () => {
    const { profile } = demo();
    expect(profile.duplicateRows).toBe(1);
    expect(profile.columns.find((c) => c.name === "Montant HT")?.invalid).toBe(2);
  });
});

describe("contexte envoyé à l'IA", () => {
  const { profile, rows } = demo();
  const clients = [...new Set(rows.map((r) => String(r.Client)))];
  const commerciaux = [...new Set(rows.map((r) => String(r.Commercial)))];
  const emails = [...new Set(rows.map((r) => String(r["Email contact"])))];

  for (const mode of ["standard", "strict"] as const) {
    it(`ne contient aucune valeur identifiante en clair (mode ${mode})`, () => {
      const pseudo = Pseudonymizer.forOrganization("cle-test", "org-1");
      const json = JSON.stringify(buildAiContext(profile, rows, mode, pseudo));
      for (const value of [...clients, ...commerciaux, ...emails]) expect(json).not.toContain(value);
      expect(json).not.toContain("Email contact");
      expect(json).not.toContain("Commentaire");
    });
  }

  it("contient des jetons en mode standard et aucune valeur en mode strict", () => {
    const pseudo = Pseudonymizer.forOrganization("cle-test", "org-1");
    const standard = buildAiContext(profile, rows, "standard", pseudo);
    expect(JSON.stringify(standard)).toMatch(/CLIENT_[0-9a-f]{8}/);

    const strict = buildAiContext(profile, rows, "strict", Pseudonymizer.forOrganization("cle-test", "org-1"));
    expect(strict.sample).toBeUndefined();
    expect(strict.breakdowns).toBeUndefined();
    expect(JSON.stringify(strict)).not.toMatch(/_[0-9a-f]{8}/);
  });

  it("ne transmet aucun groupe de moins de 5 lignes", () => {
    const pseudo = Pseudonymizer.forOrganization("cle-test", "org-1");
    const ctx = buildAiContext(profile, rows.slice(0, 30), "standard", pseudo);
    for (const b of ctx.breakdowns ?? []) for (const g of b.groups) expect(g.rows).toBeGreaterThanOrEqual(MIN_GROUP_SIZE);
  });
});

describe("pseudonymisation", () => {
  it("est stable, propre à chaque organisation et réversible côté serveur", () => {
    const a = Pseudonymizer.forOrganization("cle", "org-a");
    const b = Pseudonymizer.forOrganization("cle", "org-b");
    const token = a.tokenize("Client", "Dupont SARL");
    expect(token).toMatch(/^CLIENT_[0-9a-f]{8}$/);
    expect(a.tokenize("Client", "Dupont SARL")).toBe(token);
    expect(b.tokenize("Client", "Dupont SARL")).not.toBe(token);
    expect(a.reidentify(`${token} recule de 18 %`).text).toBe("Dupont SARL recule de 18 %");
    expect(a.reidentify("CLIENT_00000000 inconnu").unknownTokens).toEqual(["CLIENT_00000000"]);
  });
});

describe("cycle complet", () => {
  it("restitue un dashboard en clair dont les chiffres viennent du moteur", async () => {
    const data = new TextEncoder().encode(demoText).buffer as ArrayBuffer;
    const result = await generateDashboard({ fileName: "ventes-demo.csv", data, mode: "standard", organizationId: "org-1" });

    const total = result.kpis.find((k) => k.id === "k_total");
    const { rows } = demo();
    const expected = rows.reduce((s, r) => s + (typeof r["Montant HT"] === "number" ? r["Montant HT"] : 0), 0);
    expect(total?.value).toBeCloseTo(expected, 2);

    // Les constats sont ré-identifiés et vérifiés.
    expect(result.insights.length).toBeGreaterThan(0);
    for (const i of result.insights) {
      expect(i.text).not.toMatch(/[A-Z]+_[0-9a-f]{8}/);
      expect(i.status).toBe("verified");
    }
    // Le classement affiche les vrais noms de clients.
    const bar = result.charts.find((c) => c.type === "bar");
    expect(bar?.data[0].category).not.toMatch(/_[0-9a-f]{8}/);
    expect(result.issues).toEqual([]);
  });
});
