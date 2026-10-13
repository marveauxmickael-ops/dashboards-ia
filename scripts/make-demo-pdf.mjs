// Génère public/demo/ventes-demo.pdf (export « imprimé » du fichier de démonstration) : node scripts/make-demo-pdf.mjs
// Sert aux tests de l'import PDF et d'exemple aux utilisateurs. Données fictives.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const root = path.resolve(import.meta.dirname, "..");
const csv = readFileSync(path.join(root, "public/demo/ventes-demo.csv"), "utf-8").replace(/^﻿/, "");
const { data } = Papa.parse(csv, { header: true, skipEmptyLines: "greedy" });
const rows = data.slice(0, 160);

const columns = [
  { key: "Date", width: 70 },
  { key: "Client", width: 175 },
  { key: "Commercial", width: 100 },
  { key: "Région", width: 105 },
  { key: "Produit", width: 125 },
  { key: "Montant HT", width: 85, right: true },
  { key: "Coût", width: 85, right: true },
];

const pdf = await PDFDocument.create();
const font = await pdf.embedFont(StandardFonts.Helvetica);
const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
const size = 9, lineHeight = 15, left = 36, pageW = 842, pageH = 595, top = pageH - 50, bottom = 50;

let page, y, pageNumber = 0;
const drawRow = (cells, f) => {
  let x = left;
  columns.forEach((c, i) => {
    const text = String(cells[i] ?? "");
    const w = f.widthOfTextAtSize(text, size);
    page.drawText(text, { x: c.right ? x + c.width - 8 - w : x, y, size, font: f, color: rgb(0.08, 0.13, 0.17) });
    x += c.width;
  });
  y -= lineHeight;
};
const newPage = () => {
  page = pdf.addPage([pageW, pageH]);
  pageNumber++;
  page.drawText("Export des ventes — données fictives", { x: left, y: pageH - 30, size: 12, font: bold });
  y = top;
  drawRow(columns.map((c) => c.key), bold);
};

newPage();
let total = 0;
for (const r of rows) {
  if (y < bottom + lineHeight) {
    page.drawText(`Page ${pageNumber}`, { x: pageW - 80, y: 24, size: 8, font });
    newPage();
  }
  const n = Number(String(r["Montant HT"]).replace(/\s/g, "").replace(",", "."));
  if (Number.isFinite(n)) total += n;
  drawRow(columns.map((c) => r[c.key]), font);
}
drawRow(["Total", "", "", "", "", total.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ /g, " "), ""], bold);
page.drawText(`Page ${pageNumber}`, { x: pageW - 80, y: 24, size: 8, font });

writeFileSync(path.join(root, "public/demo/ventes-demo.pdf"), await pdf.save());
console.log(`ventes-demo.pdf : ${rows.length} lignes, ${pageNumber} pages`);
