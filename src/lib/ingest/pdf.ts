import type { Row } from "@/lib/types";
import { parseDate, parseNumber } from "./values";

// Import PDF : le tableau est reconstruit à partir de la position du texte sur chaque page, par le moteur,
// sans IA et sans service externe. Fonctionne pour les PDF produits par un logiciel (export, impression
// d'un tableur) ; un document scanné n'a pas de texte et est refusé avec un message clair.

export class PdfTableError extends Error {}

interface Piece {
  text: string;
  x0: number;
  x1: number;
  y: number;
  h: number;
}

interface Cell {
  text: string;
  x0: number;
  x1: number;
}

type Line = Cell[];

const TOTAL_RE = /^(sous-?total|total|totaux)\b/i;

/** Lignes de texte d'un PDF : morceaux regroupés par hauteur, puis en cellules selon l'espacement. */
async function readLines(data: ArrayBuffer): Promise<{ lines: Line[]; pages: number }> {
  const { getDocumentProxy } = await import("unpdf");
  let doc;
  try {
    doc = await getDocumentProxy(new Uint8Array(data.slice(0)));
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "PasswordException") throw new PdfTableError("Le PDF est protégé par un mot de passe. Retirez la protection puis importez-le à nouveau.");
    throw new PdfTableError("Le PDF est illisible ou endommagé.");
  }

  const lines: Line[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const pieces: Piece[] = [];
    for (const item of content.items) {
      if (!("str" in item) || item.str.trim() === "") continue;
      const x0 = item.transform[4];
      pieces.push({ text: item.str, x0, x1: x0 + item.width, y: item.transform[5], h: item.height || Math.abs(item.transform[3]) || 10 });
    }
    // Du haut vers le bas, puis de gauche à droite.
    pieces.sort((a, b) => b.y - a.y || a.x0 - b.x0);
    const rows: Piece[][] = [];
    for (const piece of pieces) {
      const current = rows.at(-1);
      if (current && Math.abs(current[0].y - piece.y) <= Math.max(2, piece.h * 0.4)) current.push(piece);
      else rows.push([piece]);
    }
    for (const row of rows) {
      row.sort((a, b) => a.x0 - b.x0);
      const cells: Cell[] = [];
      for (const piece of row) {
        const last = cells.at(-1);
        // Espacement d'un mot (environ un tiers de la hauteur) : même cellule ; au-delà, nouvelle colonne.
        if (last && piece.x0 - last.x1 <= Math.max(2, piece.h * 0.45)) {
          last.text += (piece.x0 - last.x1 > 0.5 ? " " : "") + piece.text;
          last.x1 = Math.max(last.x1, piece.x1);
        } else {
          cells.push({ text: piece.text, x0: piece.x0, x1: piece.x1 });
        }
      }
      lines.push(cells.map((c) => ({ ...c, text: c.text.replace(/\s+/g, " ").trim() })).filter((c) => c.text !== ""));
    }
  }
  return { lines, pages: doc.numPages };
}

const looksLikeValue = (text: string) => parseNumber(text) !== null || parseDate(text) !== null;

/** Nombre de cellules le plus fréquent (au moins 2) : le nombre de colonnes du tableau principal. */
function columnCount(lines: Line[]): number {
  const counts = new Map<number, number>();
  for (const l of lines) if (l.length >= 2) counts.set(l.length, (counts.get(l.length) ?? 0) + 1);
  let best = 0, bestCount = 0;
  for (const [n, c] of counts) if (c > bestCount || (c === bestCount && n > best)) [best, bestCount] = [n, c];
  return best;
}

/** Reconstruit le tableau principal d'un PDF : en-têtes, lignes, et ce qui a été écarté. */
export async function extractPdfTable(data: ArrayBuffer): Promise<{ columns: string[]; rows: Row[]; notes: string[] }> {
  const { lines, pages } = await readLines(data);
  if (lines.every((l) => l.length === 0)) {
    throw new PdfTableError("Ce PDF ne contient pas de texte (document scanné ou image). Importez plutôt l'export Excel ou CSV d'origine.");
  }
  const width = columnCount(lines);
  const headerIndex = lines.findIndex((l) => l.length === width && l.every((c) => !looksLikeValue(c.text)));
  if (width < 2 || headerIndex === -1) {
    throw new PdfTableError("Aucun tableau lisible dans ce PDF : il faut une ligne d'en-têtes suivie de lignes de données. Importez plutôt l'export Excel ou CSV.");
  }

  const header = lines[headerIndex];
  const names: string[] = [];
  for (const c of header) {
    let name = c.text, i = 2;
    while (names.includes(name)) name = `${c.text} ${i++}`;
    names.push(name);
  }
  const headerKey = header.map((c) => c.text.toLowerCase()).join("\u0000");
  // Chaque colonne s'étend du début de son en-tête au début de l'en-tête suivant (montants alignés à droite compris).
  const spans = header.map((c, i) => [i === 0 ? -Infinity : c.x0, i === header.length - 1 ? Infinity : header[i + 1].x0] as const);
  const columnOf = (cell: Cell) => {
    let best = 0, bestOverlap = -Infinity;
    spans.forEach(([a, b], i) => {
      const overlap = Math.min(cell.x1, b) - Math.max(cell.x0, a);
      if (overlap > bestOverlap) [best, bestOverlap] = [i, overlap];
    });
    return best;
  };

  const rows: Row[] = [];
  let totals = 0, outside = 0, repeatedHeaders = 0;
  for (const line of lines.slice(headerIndex + 1)) {
    if (line.length === 0) continue;
    if (line.map((c) => c.text.toLowerCase()).join("\u0000") === headerKey) {
      repeatedHeaders++;
      continue;
    }
    if (TOTAL_RE.test(line[0].text)) {
      totals++;
      continue;
    }
    const values: (string | null)[] = names.map(() => null);
    for (const cell of line) {
      const i = columnOf(cell);
      values[i] = values[i] === null ? cell.text : `${values[i]} ${cell.text}`;
    }
    // Titres, pieds de page (« Page 2 ») et notes : trop peu de cellules pour une ligne du tableau.
    if (values.filter((v) => v !== null).length < Math.max(2, Math.ceil(width / 2))) {
      outside++;
      continue;
    }
    const row: Row = {};
    names.forEach((n, i) => (row[n] = values[i]));
    rows.push(row);
  }

  const notes = [`Tableau extrait du PDF (${pages} page${pages > 1 ? "s" : ""}, ${rows.length.toLocaleString("fr-FR")} lignes, ${names.length} colonnes) : vérifiez les premières lignes et les totaux.`];
  if (totals > 0) notes.push(`${totals} ligne(s) de total ignorée(s), pour ne pas compter deux fois les montants.`);
  if (outside > 0) notes.push(`${outside} ligne(s) hors tableau ignorée(s) (titres, pieds de page, notes).`);
  if (repeatedHeaders > 0) notes.push(`En-têtes répétés sur ${repeatedHeaders} page(s) suivante(s), ignorés.`);
  return { columns: names, rows, notes };
}
