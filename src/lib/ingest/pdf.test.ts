import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { ImportError, parseFile } from "@/lib/ingest/parse";
import { profileDataset } from "@/lib/ingest/profile";
import { generateDashboard } from "@/lib/pipeline";

const demoPdf = () => {
  const b = readFileSync(path.resolve(import.meta.dirname, "../../../public/demo/ventes-demo.pdf"));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

async function pdfWith(lines: string[]): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  lines.forEach((t, i) => page.drawText(t, { x: 40, y: 800 - i * 16, size: 10, font }));
  const bytes = await doc.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

describe("import PDF", () => {
  it("reconstruit le tableau sur plusieurs pages, sans les en-têtes répétés, pieds de page ni totaux", async () => {
    const ds = await parseFile("ventes-demo.pdf", demoPdf());
    expect(ds.columns).toEqual(["Date", "Client", "Commercial", "Région", "Produit", "Montant HT", "Coût"]);
    expect(ds.rows).toHaveLength(160);
    expect(ds.rows[0]).toEqual({
      Date: "03/01/2026",
      Client: "Clinique Vétérinaire Azur",
      Commercial: "Léa Martin",
      Région: "Île-de-France",
      Produit: "Logiciel de caisse",
      "Montant HT": "1 463,49",
      Coût: "596,09",
    });
    expect(ds.rows.some((r) => String(r.Date).startsWith("Total"))).toBe(false);
    expect(ds.notes?.join(" ")).toContain("1 ligne(s) de total ignorée(s)");
    expect(ds.notes?.join(" ")).toContain("En-têtes répétés sur 4 page(s)");
  });

  it("type les montants et les dates comme pour un CSV, et signale l'extraction", async () => {
    const { profile } = profileDataset(await parseFile("ventes-demo.pdf", demoPdf()));
    const type = Object.fromEntries(profile.columns.map((c) => [c.name, c.type]));
    expect(type).toMatchObject({ Date: "date", "Montant HT": "number", Coût: "number", Région: "category" });
    expect(profile.warnings[0]).toMatch(/^Tableau extrait du PDF \(5 pages, 160 lignes, 7 colonnes\)/);
  });

  it("produit un dashboard calculé sur les lignes extraites", async () => {
    const result = await generateDashboard({ fileName: "ventes-demo.pdf", data: demoPdf(), mode: "standard", organizationId: "org-1" });
    expect(result.profile.rowCount).toBe(160);
    expect(result.kpis.length).toBeGreaterThan(0);
  });

  it("place les cellules vides et les montants alignés à droite dans la bonne colonne", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595, 842]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const right = (t: string, xEnd: number, y: number) => page.drawText(t, { x: xEnd - font.widthOfTextAtSize(t, 10), y, size: 10, font });
    const rows = [["Région", "Vendeur", "Montant"], ["Nord", "Alice Martin", "1 200,00"], ["Sud", "", "15 300,50"], ["Ouest", "Bruno Petit", ""]];
    rows.forEach(([a, b, c], i) => {
      const y = 800 - i * 16;
      page.drawText(a, { x: 40, y, size: 10, font });
      if (b) page.drawText(b, { x: 160, y, size: 10, font });
      if (c) right(c, 400, y);
    });
    const bytes = await doc.save();
    const ds = await parseFile("t.pdf", bytes.buffer.slice(0) as ArrayBuffer);
    expect(ds.columns).toEqual(["Région", "Vendeur", "Montant"]);
    expect(ds.rows).toEqual([
      { "Région": "Nord", Vendeur: "Alice Martin", Montant: "1 200,00" },
      { "Région": "Sud", Vendeur: null, Montant: "15 300,50" },
      { "Région": "Ouest", Vendeur: "Bruno Petit", Montant: null },
    ]);
  });

  it("refuse clairement un PDF sans tableau ou sans texte", async () => {
    await expect(parseFile("note.pdf", await pdfWith(["Compte rendu de réunion", "Rien de tabulaire ici."]))).rejects.toThrow(ImportError);
    const empty = await PDFDocument.create();
    empty.addPage();
    const bytes = await empty.save();
    await expect(parseFile("scan.pdf", bytes.buffer.slice(0) as ArrayBuffer)).rejects.toThrow(/document scanné/);
    await expect(parseFile("casse.pdf", new TextEncoder().encode("pas un pdf").buffer as ArrayBuffer)).rejects.toThrow(/illisible/);
  });
});
