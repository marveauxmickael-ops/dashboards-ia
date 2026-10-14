import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { generateDashboard } from "@/lib/pipeline";
import { ImportError, parseFile } from "./parse";

// Fichiers .xls de test (données fictives) : vrai format Excel 97-2003 (BIFF8) et « faux .xls » HTML.
// Dates écrites comme dans un vrai fichier Excel : numéro de série et format date (indépendant du fuseau horaire).
const serial = (y: number, m: number, d: number) => (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000;

function biff8(rows: unknown[][]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  for (let r = 1; r < rows.length; r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: 0 })];
    if (cell) cell.z = "dd/mm/yyyy";
  }
  XLSX.utils.book_append_sheet(wb, ws, "Ventes");
  return XLSX.write(wb, { type: "array", bookType: "biff8" }) as ArrayBuffer;
}

const rows = [
  ["Date", "Client", "Région", "Montant HT", "Coût"],
  [serial(2026, 1, 15), "Garage du Centre", "Nord", 1250.5, 700],
  [serial(2026, 2, 3), "Librairie Le Phare", "Sud", 980, 410.25],
  [serial(2026, 2, 28), "Clinique Azur", "Nord", 2100, 1300],
];

describe("import .xls (Excel 97-2003)", () => {
  it("lit un vrai fichier .xls : en-têtes, montants et dates", async () => {
    const ds = await parseFile("ventes.xls", biff8(rows));
    expect(ds.columns).toEqual(["Date", "Client", "Région", "Montant HT", "Coût"]);
    expect(ds.rows).toHaveLength(3);
    expect(ds.rows[0]).toEqual({ Date: "2026-01-15", Client: "Garage du Centre", Région: "Nord", "Montant HT": 1250.5, Coût: 700 });
    expect(ds.rows[2].Date).toBe("2026-02-28");
  });

  it("lit les dates enregistrées comme dans Excel (numéro de série et format date)", async () => {
    const ws = XLSX.utils.aoa_to_sheet([["Date", "Montant HT"], [46037, 100], [46081, 200]]);
    for (const ref of ["A2", "A3"]) {
      ws[ref].z = "dd/mm/yyyy";
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Feuil1");
    const ds = await parseFile("serie.xls", XLSX.write(wb, { type: "array", bookType: "biff8" }) as ArrayBuffer);
    // 46037 = 15/01/2026 et 46081 = 28/02/2026 dans le calendrier Excel.
    expect(ds.rows.map((r) => r.Date)).toEqual(["2026-01-15", "2026-02-28"]);
  });

  it("lit un « .xls » qui est en réalité une page HTML (export de logiciel)", async () => {
    const html = `<html><body><table><tr><th>Client</th><th>Montant HT</th></tr><tr><td>Garage du Centre</td><td>1250,5</td></tr><tr><td>Clinique Azur</td><td>2100</td></tr></table></body></html>`;
    const ds = await parseFile("export.xls", new TextEncoder().encode(html).buffer as ArrayBuffer);
    expect(ds.columns).toEqual(["Client", "Montant HT"]);
    expect(ds.rows).toHaveLength(2);
    expect(ds.rows[0].Client).toBe("Garage du Centre");
  });

  it("produit un dashboard identique à partir du .xls", async () => {
    const result = await generateDashboard({ fileName: "ventes.xls", data: biff8(rows), mode: "standard", organizationId: "org-1" });
    expect(result.profile.rowCount).toBe(3);
    expect(result.period).toEqual({ from: "2026-01", to: "2026-02" });
    expect(result.kpis.find((k) => k.format === "currency")?.value).toBe(4330.5);
  });

  it("refuse un fichier illisible avec un message clair", async () => {
    await expect(parseFile("casse.xls", new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 1, 2, 3]).buffer)).rejects.toBeInstanceOf(ImportError);
  });
});
