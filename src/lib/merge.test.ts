import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/ingest/parse";
import { cleanedCsv } from "@/lib/quality";
import { canonicalDataset, lineIdColumn, mergeDatasets, mergedFileName } from "./merge";

// Données fictives.
const before = parseCsv(
  "ventes.csv",
  ["N° commande,Date,Région,Montant HT", "C1,15/01/2024,Nord,100", "C2,20/01/2024,Sud,200", 'C3,05/02/2024,Nord,"150,5"'].join("\n"),
);

describe("ajout de données (US-12)", () => {
  it("n'ajoute que les lignes nouvelles et repère les lignes modifiées par leur identifiant", () => {
    // Nouvel export : recoupe février (C3 identique, au format différent), corrige C2, ajoute mars.
    const next = parseCsv("ventes-mars.csv", ["N° commande,Date,Région,Montant HT", "C2,2024-01-20,Sud,250", 'C3,2024-02-05,Nord,"150,50"', "C4,2024-03-02,Est,300"].join("\n"));
    const { dataset, summary } = mergeDatasets(before, next);
    expect(summary).toMatchObject({ alreadyPresent: 1, added: 1, modified: 1, idColumn: "N° commande", rowsBefore: 3, rowsAfter: 4 });
    expect(dataset.rows.find((r) => r["N° commande"] === "C2")?.["Montant HT"]).toBe("250");
    expect(dataset.columns).toEqual(before.columns);

    const old = mergeDatasets(before, next, "old");
    expect(old.dataset.rows.find((r) => r["N° commande"] === "C2")?.["Montant HT"]).toBe("200");
  });

  it("sans identifiant unique, deux lignes identiques n'absorbent que deux lignes", () => {
    const lines = (rows: string[]) => parseCsv("f.csv", ["Date,Produit,Quantité", ...rows].join("\n"));
    const a = lines(["2024-01-01,Stylo,2", "2024-01-01,Stylo,2"]);
    const b = lines(["2024-01-01,Stylo,2", "2024-01-01,Stylo,2", "2024-01-01,Stylo,2", "2024-01-02,Cahier,1"]);
    expect(lineIdColumn(a, b)).toBeNull();
    const { summary } = mergeDatasets(a, b);
    expect(summary).toMatchObject({ alreadyPresent: 2, added: 2, modified: 0, idColumn: null, rowsAfter: 4 });
  });

  it("le fichier fusionné téléchargé est reconnu au prochain ajout (même contenu canonique)", () => {
    const next = parseCsv("mars.csv", ["N° commande,Date,Région,Montant HT", "C4,2024-03-02,Est,300.25"].join("\n"));
    const { dataset } = mergeDatasets({ ...before, fileName: mergedFileName("ventes.csv") }, next);
    const reread = parseCsv(dataset.fileName, cleanedCsv(dataset));
    expect(canonicalDataset(reread)).toBe(canonicalDataset(dataset));
    // L'ordre des lignes ou des colonnes ne change pas l'empreinte ; une valeur différente, si.
    expect(canonicalDataset({ ...dataset, rows: [...dataset.rows].reverse(), columns: [...dataset.columns].reverse() })).toBe(canonicalDataset(dataset));
    expect(canonicalDataset({ ...dataset, rows: dataset.rows.slice(1) })).not.toBe(canonicalDataset(dataset));
  });

  it("nomme le fichier fusionné sans répéter le suffixe", () => {
    expect(mergedFileName("ventes.xlsx")).toBe("ventes-fusionne.csv");
    expect(mergedFileName("ventes-fusionne.csv")).toBe("ventes-fusionne.csv");
  });
});

describe("ajout de données sur un dashboard (US-12)", () => {
  it("deux exports qui se recoupent donnent les mêmes chiffres que le fichier complet, sans doublon", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const { generateDashboard, recomputeDashboard } = await import("@/lib/pipeline");
    const { NO_FILTERS } = await import("@/lib/filters");
    const text = readFileSync(path.resolve(import.meta.dirname, "../../public/demo/ventes-demo.csv"), "utf-8");
    // Le fichier de démo contient des doublons exacts (contrôle qualité) : une ligne identique est « déjà présente ».
    const [header, ...all] = text.trim().split(/\r?\n/);
    const lines = [...new Set(all)];
    // Premier export : deux tiers des lignes ; second export : le dernier tiers et un recouvrement.
    const cut = Math.floor((lines.length * 2) / 3);
    const first = [header, ...lines.slice(0, cut)].join("\n");
    const second = [header, ...lines.slice(cut - 50)].join("\n");
    const bytes = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

    const full = await generateDashboard({ fileName: "complet.csv", data: bytes([header, ...lines].join("\n")), mode: "standard", organizationId: "org-1" });
    const initial = await recomputeDashboard({ previous: full, source: { fileName: "janvier.csv", data: bytes(first) }, filters: NO_FILTERS, mode: "standard", organizationId: "org-1", allowAi: false });
    const { dataset, summary } = mergeDatasets(parseCsv("janvier.csv", first), parseCsv("suite.csv", second));
    expect(summary.alreadyPresent).toBeGreaterThanOrEqual(50);
    expect(summary.added).toBe(lines.length - cut);
    const merged = await recomputeDashboard({ previous: initial, source: dataset, filters: NO_FILTERS, mode: "standard", organizationId: "org-1", allowAi: false });
    expect(merged.profile.rowCount).toBe(full.profile.rowCount);
    expect(merged.kpis.map((k) => k.value)).toEqual(full.kpis.map((k) => k.value));
    expect(merged.period).toEqual(full.period);
  });
});
