import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateDashboard } from "@/lib/pipeline";
import { parseFile } from "@/lib/ingest/parse";
import { profileDataset } from "@/lib/ingest/profile";
import { Pseudonymizer } from "@/lib/privacy/pseudonymize";
import { answerQuestion, interpretWithRules, pseudonymizeQuestion, runQuery } from "./index";

const demo = readFileSync(path.resolve(import.meta.dirname, "../../../public/demo/ventes-demo.csv"), "utf-8");
const bytes = () => new TextEncoder().encode(demo).buffer as ArrayBuffer;

async function setup() {
  const result = await generateDashboard({ fileName: "ventes-demo.csv", data: bytes(), mode: "standard", organizationId: "org-1" });
  const { profile, rows } = profileDataset(await parseFile("ventes-demo.csv", bytes()));
  return { spec: result.spec!, profile, rows, result };
}

describe("questions en langage naturel", () => {
  it("interprète une question par mots-clés : mesure, regroupement, classement", async () => {
    const { spec, profile, rows } = await setup();
    const q = interpretWithRules("Quels sont les 3 meilleurs clients en montant ?", spec, profile, rows);
    // Sans indicateur cité, le classement porte sur l'indicateur principal du dashboard.
    expect(interpretWithRules("Quels sont les 5 meilleurs clients ?", spec, profile, rows).measure).toBe(q.measure);
    expect(q.group_by).toBe("Client");
    expect(q.limit).toBe(3);
    expect(q.sort).toBe("desc");
    expect(spec.measures.find((m) => m.id === q.measure)?.label).toMatch(/Montant/);
  });

  it("calcule la réponse avec le moteur : total identique au KPI du dashboard", async () => {
    const { spec, profile, rows, result } = await setup();
    const q = interpretWithRules("Quel est le montant HT total ?", spec, profile, rows);
    const out = runQuery(q, spec, profile, rows, (t) => t);
    const kpi = result.kpis.find((k) => k.formula === "Somme(Montant HT)")!;
    expect(out.value?.value).toBe(kpi.value);
    expect(out.answer).toContain("Montant HT");
  });

  it("répond sur une évolution mensuelle, chiffres issus du calcul", async () => {
    const { spec, profile, rows } = await setup();
    const answer = await answerQuestion({ question: "Comment évolue la marge mois par mois ?", spec, profile, rows, mode: "standard", pseudo: Pseudonymizer.forOrganization("k", "o") });
    expect(answer.chart?.chronological).toBe(true);
    expect(answer.chart!.data.length).toBeGreaterThan(3);
    expect(answer.interpretedBy).toBe("rules");
  });

  it("pseudonymise les noms cités avant tout envoi à l'IA", async () => {
    const { profile, rows } = await setup();
    const client = rows.map((r) => r["Client"]).find((v): v is string => typeof v === "string")!;
    const pseudo = Pseudonymizer.forOrganization("k", "o");
    const sent = pseudonymizeQuestion(`Quel est le chiffre d'affaires de ${client.toLowerCase()} ?`, profile, rows, pseudo);
    expect(sent).not.toContain(client.toLowerCase());
    expect(sent).toMatch(/CLIENT_[0-9a-f]{8}/);
    expect(pseudo.reidentify(sent).text).toContain(client);
  });

  it("filtre sur un nom cité et une période", async () => {
    const { spec, profile, rows } = await setup();
    const client = rows.map((r) => r["Client"]).find((v): v is string => typeof v === "string")!;
    const q = interpretWithRules(`Combien de ventes pour ${client} ?`, spec, profile, rows);
    const out = runQuery(q, spec, profile, rows, (t) => t);
    expect(out.value?.value).toBe(rows.filter((r) => r["Client"] === client).length);
  });
});
