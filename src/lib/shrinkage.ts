import { inScope } from "@/lib/ingest/scopes";
import { lossColumn } from "@/lib/losses";
import type { DatasetProfile, TypedRow } from "@/lib/types";

// La démarque « en perte de chiffre » (US-18) : dans un journal de démarque, le moteur additionne les seules pertes
// (périmé, casse, dons, vol…) et les présente comme de l'argent perdu, en positif : chiffre perdu au prix de vente,
// marchandise perdue au prix d'achat, part du CA si les ventes sont reliées, motifs, et articles à surveiller.
// Calcul déterministe, sans IA ; les corrections d'inventaire et de comptage ne sont jamais comptées.

const SALE_VALUE = /valeur.*vente|montant.*vente|vente.*valeur|\bpv\b|prix de vente/i;
const COST_VALUE = /valeur.*achat|montant.*achat|achat.*valeur|co[uû]t|prix d'?achat|\bpa\b|revient/i;
const ITEM_LABEL = /libell[ée]\s+article|d[ée]signation|libell[ée]\s+produit|^produit$|^article$/i;
const AISLE_LABEL = /libell[ée]\s+rayon|^rayon$/i;
const SALES_HEADER = /vente|chiffre|\bca\b|revenu/i;
const MAX_ITEMS = 10;

export interface ShrinkageReport {
  /** Colonne de motif et motifs comptés comme pertes. */
  typeColumn: string;
  lossTypes: string[];
  /** Chiffre perdu au prix de vente (positif). */
  lostSales: number | null;
  /** Marchandise perdue au prix d'achat (positif). */
  lostCost: number | null;
  /** Colonnes utilisées, rappelées sous les chiffres. */
  saleColumn: string | null;
  costColumn: string | null;
  /** Chiffre d'affaires des ventes reliées et part qu'il représente (fichiers reliés uniquement). */
  sales: { column: string; value: number; share: number } | null;
  byType: { type: string; lost: number; share: number }[];
  /** Rayons qui font perdre le plus. */
  byAisle: { aisle: string; lost: number; share: number }[];
  /** Articles qui font perdre le plus, avec leur rayon et leur motif principal. */
  items: { item: string; aisle: string | null; lost: number; share: number; mainType: string; mainTypeShare: number }[];
  itemColumn: string | null;
  lines: number;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function computeShrinkage(profile: DatasetProfile, rows: TypedRow[]): ShrinkageReport | null {
  const dims = profile.columns.filter((c) => c.role === "dimension" && c.distinct >= 1 && c.distinct <= 100);
  const dimensions = dims.map((c) => ({ column: c.name, values: [...new Set(rows.map((r) => r[c.name]).filter((v) => v !== null).map(String))] }));
  const preset = lossColumn(dimensions);
  if (!preset) return null;
  const losses = new Set(preset.losses);
  const lossRows = rows.filter((r) => r[preset.column] !== null && losses.has(String(r[preset.column])));

  // Montants du journal de démarque : ceux qui ne valent que sur ses lignes quand les fichiers sont reliés.
  const ownMeasures = profile.columns
    .filter((c) => c.role === "measure")
    .map((c) => c.name)
    .filter((c) => lossRows.some((r) => r[c] !== null && inScope(profile.scopes, r, c)));
  const saleColumn = ownMeasures.find((c) => /valeur/i.test(c) && SALE_VALUE.test(c)) ?? ownMeasures.find((c) => SALE_VALUE.test(c)) ?? null;
  const costColumn = ownMeasures.find((c) => /valeur/i.test(c) && COST_VALUE.test(c)) ?? ownMeasures.find((c) => COST_VALUE.test(c) && c !== saleColumn) ?? null;
  const valueColumn = saleColumn ?? costColumn;
  if (!valueColumn) return null;

  // Une perte est enregistrée en négatif (sortie de stock) ou en positif selon les logiciels : on la présente en positif.
  const total = lossRows.reduce((n, r) => n + num(r[valueColumn]), 0);
  const sign = total < 0 ? -1 : 1;
  const lostOf = (list: TypedRow[], column: string | null) => (column ? Math.round(sign * list.reduce((n, r) => n + num(r[column]), 0) * 100) / 100 : null);
  const lostSales = lostOf(lossRows, saleColumn);
  const lostCost = lostOf(lossRows, costColumn);
  const reference = lostOf(lossRows, valueColumn) ?? 0;
  const share = (v: number) => (reference === 0 ? 0 : v / reference);

  const byType = preset.losses
    .map((type) => {
      const lost = lostOf(lossRows.filter((r) => String(r[preset.column]) === type), valueColumn) ?? 0;
      return { type, lost, share: share(lost) };
    })
    .filter((t) => t.lost !== 0)
    .sort((a, b) => b.lost - a.lost);

  // Article et rayon repérés par leur nom, quel que soit leur rôle : un libellé d'article aux milliers de valeurs
  // est classé « texte » (hors graphiques), mais il reste la bonne clé du classement des pertes.
  const labelled = (re: RegExp) => profile.columns.find((c) => re.test(c.name) && c.type !== "number" && c.type !== "date")?.name ?? null;
  const itemColumn = labelled(ITEM_LABEL);
  const aisleColumn = labelled(AISLE_LABEL);
  const items: ShrinkageReport["items"] = [];
  if (itemColumn) {
    const groups = new Map<string, TypedRow[]>();
    for (const r of lossRows) {
      const k = r[itemColumn];
      if (k === null) continue;
      groups.set(String(k), [...(groups.get(String(k)) ?? []), r]);
    }
    const ranked = [...groups].map(([item, list]) => ({ item, list, lost: lostOf(list, valueColumn) ?? 0 })).sort((a, b) => b.lost - a.lost).slice(0, MAX_ITEMS);
    for (const { item, list, lost } of ranked) {
      if (lost <= 0) continue;
      const perType = preset.losses.map((t) => ({ t, v: lostOf(list.filter((r) => String(r[preset.column]) === t), valueColumn) ?? 0 })).sort((a, b) => b.v - a.v);
      const aisle = aisleColumn ? list.map((r) => r[aisleColumn]).find((v) => v !== null) : null;
      items.push({ item, aisle: aisle === null || aisle === undefined ? null : String(aisle), lost, share: share(lost), mainType: perType[0].t, mainTypeShare: lost === 0 ? 0 : perType[0].v / lost });
    }
  }

  const byAisle: ShrinkageReport["byAisle"] = [];
  if (aisleColumn) {
    const groups = new Map<string, TypedRow[]>();
    for (const r of lossRows) {
      const k = r[aisleColumn];
      if (k !== null) groups.set(String(k), [...(groups.get(String(k)) ?? []), r]);
    }
    for (const [aisle, list] of groups) {
      const lost = lostOf(list, valueColumn) ?? 0;
      if (lost > 0) byAisle.push({ aisle, lost, share: share(lost) });
    }
    byAisle.sort((a, b) => b.lost - a.lost).splice(8);
  }

  // Fichiers reliés : CA des lignes de ventes (montant HT de préférence), pour exprimer la perte en part du CA.
  let sales: ShrinkageReport["sales"] = null;
  const scopes = profile.scopes;
  if (scopes && reference > 0) {
    const mainSource = scopes.sources[0];
    const salesColumns = profile.columns
      .filter((c) => c.role === "measure" && scopes.applies[c.name]?.length === 1 && scopes.applies[c.name][0] === mainSource && SALES_HEADER.test(c.name))
      .map((c) => c.name);
    const column = salesColumns.find((c) => /\bht\b/i.test(c)) ?? salesColumns[0];
    if (column) {
      const value = Math.round(rows.filter((r) => String(r[scopes.column]) === mainSource).reduce((n, r) => n + num(r[column]), 0) * 100) / 100;
      if (value > 0) sales = { column, value, share: reference / value };
    }
  }

  return { typeColumn: preset.column, lossTypes: preset.losses, lostSales, lostCost, saleColumn, costColumn, sales, byType, byAisle, items, itemColumn, lines: lossRows.length };
}
