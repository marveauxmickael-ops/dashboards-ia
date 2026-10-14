import type { ColumnProfile, ColumnType, DatasetProfile, RawDataset, TypedRow } from "@/lib/types";
import { EMAIL_RE, IBAN_RE, PHONE_RE, parseDate, parseNumber } from "./values";

// Part minimale de valeurs conformes pour retenir un type.
const TYPE_THRESHOLD = 0.9;

// En-têtes évoquant des données sensibles au sens de l'article 9 du RGPD : exclues par défaut.
const SENSITIVE_HEADER = /sant[ée]|maladie|m[ée]dical|handicap|religion|confession|syndic|politi|origine|ethni|orientation|sexualit|biom[ée]tri|g[ée]n[ée]tique|casier|condamnation/i;
// Identifiants directs : supprimés avant l'IA.
const DIRECT_ID_HEADER = /e-?mail|courriel|t[ée]l[ée]phone|phone|portable|mobile|iban|bic|adresse|address|s[ée]curit[ée] sociale|\bnir\b|ssn|passeport|password|mot de passe/i;
// Champs de saisie libre : peuvent contenir n'importe quelle donnée personnelle.
const FREE_TEXT_HEADER = /comment|remarque|\bnotes?\b|observation|description|descriptif|motif|message/i;
// Personnes ou entités identifiables : remplacées par des jetons.
const PERSON_HEADER = /\bnom\b|name|pr[ée]nom|client|contact|commercial|vendeur|salari[ée]|employ[ée]|collaborateur|fournisseur|soci[ée]t[ée]|entreprise|raison sociale|\bid\b|identifiant|siret|siren/i;
// Classifications qui mentionnent une personne sans l'identifier (« Segment client », « Type de contact ») : transmises.
const CLASSIFICATION_HEADER = /segment|type|cat[ée]gor|canal|statut|r[ée]gion|secteur|taille|famille|gamme|niveau/i;
// Codes et identifiants numériques (EAN, code article, n° de commande) : des étiquettes, jamais des quantités.
const CODE_HEADER = /(^|[\s_(-])(code|ean|gtin|sku|r[ée]f[ée]rence|ref|n[°o]|num[ée]ro|matricule)(?=$|[\s_).:-])/i;
// Colonnes de libellé, qui nomment un code voisin (« Libellé rayon » pour « Rayon »).
const LABEL_PREFIX = /^(libell[ée]s?|lib\.?|intitul[ée]|d[ée]signation|nom)\s+/i;
const CODE_PREFIX = /^(code|n[°o]|num[ée]ro|id)\s+(de\s+|du\s+|d')?/i;
export const PERCENT_HEADER = /taux|%|pourcent|ratio/i;

// Clé de rapprochement code ↔ libellé : sans accents, préfixes, suffixe « (2) » des en-têtes en double ni espaces ;
// « ss » abrège « sous » (« Sous famille » ↔ « Libellé ssfamille »).
const pairKey = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(LABEL_PREFIX, "")
    .replace(CODE_PREFIX, "")
    .replace(/\s*\(\d+\)$/, "")
    .replace(/[^a-z0-9]/g, "")
    .replace(/^ss(?!ous)/, "sous");

// Quantité et prix unitaires : un prix unitaire ne s'additionne pas ; la valeur d'une ligne vaut quantité × prix.
const QUANTITY_HEADER = /^(qt[ée]s?|quantit[ée]s?)(\s|$|\.|\()/i;
const UNIT_PRICE_HEADER = /^(prix|p\.?\s?u\.?)(\s|$|\.|\()/i;
// Valeurs par unité ou par colis : jamais additionnées.
const PER_UNIT_HEADER = /^(pcb|colisage)(\s|$)/i;

/**
 * Fichier avec une quantité et des prix unitaires (ex. régularisations de stock) : ajoute, ligne par ligne,
 * « Valeur <prix> » = quantité × prix. Calcul du moteur, sans IA ; le fichier d'origine n'est pas modifié.
 */
function withUnitValues(ds: RawDataset): { ds: RawDataset; derived: Map<string, string> } {
  const derived = new Map<string, string>();
  const quantity = ds.columns.find((c) => QUANTITY_HEADER.test(c));
  if (!quantity) return { ds, derived };
  const prices = ds.columns.filter((c) => UNIT_PRICE_HEADER.test(c));
  if (prices.length === 0) return { ds, derived };
  for (const price of prices) {
    const name = `Valeur ${price.charAt(0).toLowerCase()}${price.slice(1)}`;
    if (!ds.columns.includes(name)) derived.set(name, price);
  }
  if (derived.size === 0) return { ds, derived };
  const rows = ds.rows.map((r) => {
    const out = { ...r };
    const q = parseNumber(r[quantity]);
    for (const [name, price] of derived) {
      const p = parseNumber(r[price]);
      out[name] = q === null || p === null ? null : Math.round(q * p * 100) / 100;
    }
    return out;
  });
  const columns = [...ds.columns, ...derived.keys()];
  const note = `Valeurs calculées ligne par ligne : ${[...derived].map(([name, price]) => `« ${name} » = ${quantity} × ${price}`).join(" ; ")}. Les prix unitaires ne sont pas additionnés.`;
  return { ds: { ...ds, columns, rows, notes: [...(ds.notes ?? []), note] }, derived };
}

/**
 * Codes doublés d'un libellé (« Rayon » et « Libellé rayon ») : seul le libellé est utilisé.
 * Codes numériques isolés (EAN, code site) : traités comme des catégories, jamais additionnés.
 */
function reclassifyCodes(columns: ColumnProfile[]): ColumnProfile[] {
  const labelled = new Map(columns.filter((c) => LABEL_PREFIX.test(c.name)).map((c) => [pairKey(c.name), c.name]));
  return columns.map((c) => {
    if (c.role === "ignored" || LABEL_PREFIX.test(c.name)) return c;
    const label = labelled.get(pairKey(c.name));
    if (label && (c.type === "number" || c.type === "category")) {
      return { ...c, role: "ignored", treatment: "exclude", reason: `Code associé à « ${label} » : le libellé est utilisé à sa place.` };
    }
    if (c.type === "number" && CODE_HEADER.test(c.name)) {
      return { ...c, type: "category", role: "dimension", invalid: 0, reason: "Code ou identifiant : traité comme une catégorie, jamais additionné." };
    }
    return c;
  });
}

export function profileDataset(input: RawDataset): { profile: DatasetProfile; rows: TypedRow[] } {
  const { ds, derived } = withUnitValues(input);
  const unitPrices = new Map([...derived].map(([name, price]) => [price, name]));
  const columns = reclassifyCodes(ds.columns.map((name) => profileColumn(name, ds.rows.map((r) => r[name])))).map((c) => {
    if (c.role !== "measure") return c;
    const value = unitPrices.get(c.name);
    if (value) return { ...c, role: "ignored" as const, reason: `Prix unitaire : jamais additionné ; utilisé pour calculer « ${value} ».` };
    if (PER_UNIT_HEADER.test(c.name)) return { ...c, role: "ignored" as const, reason: "Quantité par colis : jamais additionnée." };
    return c;
  });
  const rows: TypedRow[] = ds.rows.map((r) => {
    const out: TypedRow = {};
    for (const c of columns) out[c.name] = typeValue(r[c.name], c.type);
    return out;
  });

  const seen = new Set<string>();
  let duplicateRows = 0;
  for (const r of ds.rows) {
    const key = JSON.stringify(ds.columns.map((c) => r[c]));
    if (seen.has(key)) duplicateRows++;
    else seen.add(key);
  }

  const warnings: string[] = [...(ds.notes ?? [])];
  if (duplicateRows > 0) {
    warnings.push(`${duplicateRows} ligne(s) strictement identique(s) à une autre. Elles sont conservées : le contrôle qualité permet de les supprimer.`);
  }
  for (const c of columns) {
    if (c.invalid > 0) warnings.push(`Colonne « ${c.name} » : ${c.invalid} valeur(s) non conforme(s) au type ${labelType(c.type)}, ignorée(s) dans les calculs.`);
    if (c.treatment === "block") warnings.push(`Colonne « ${c.name} » : donnée potentiellement sensible (RGPD art. 9), exclue de l'analyse.`);
  }
  if (!columns.some((c) => c.role === "measure")) warnings.push("Aucune colonne numérique détectée : seuls des comptages seront possibles.");

  return { profile: { rowCount: ds.rows.length, duplicateRows, columns, warnings }, rows };
}

function profileColumn(name: string, values: (string | number | null)[]): ColumnProfile {
  const present = values.filter((v): v is string | number => v !== null);
  const missing = values.length - present.length;
  const distinct = new Set(present.map(String)).size;
  const ratio = (test: (v: string | number) => boolean) =>
    present.length === 0 ? 0 : present.filter(test).length / present.length;

  let type: ColumnType;
  let conforming: number;
  const asString = (v: string | number) => String(v).trim();
  const dateRatio = ratio((v) => parseDate(v) !== null);
  const numberRatio = ratio((v) => parseNumber(v) !== null);
  if (present.length > 0 && ratio((v) => EMAIL_RE.test(asString(v))) >= 0.5) {
    type = "email";
    conforming = 1;
  } else if (present.length > 0 && ratio((v) => IBAN_RE.test(asString(v).toUpperCase())) >= 0.5) {
    type = "iban";
    conforming = 1;
  } else if (present.length > 0 && ratio((v) => PHONE_RE.test(asString(v))) >= 0.5) {
    type = "phone";
    conforming = 1;
  } else if (dateRatio >= TYPE_THRESHOLD) {
    type = "date";
    conforming = dateRatio;
  } else if (numberRatio >= TYPE_THRESHOLD && !PERSON_HEADER.test(name)) {
    type = "number";
    conforming = numberRatio;
  } else {
    const avgLength = present.reduce<number>((s, v) => s + String(v).length, 0) / Math.max(present.length, 1);
    type = FREE_TEXT_HEADER.test(name) || avgLength > 40 || (distinct > 50 && distinct / Math.max(present.length, 1) > 0.9 && !PERSON_HEADER.test(name)) ? "text" : "category";
    conforming = 1;
  }
  const invalid = Math.round((1 - conforming) * present.length);

  let treatment: ColumnProfile["treatment"];
  let reason: string;
  if (SENSITIVE_HEADER.test(name)) {
    treatment = "block";
    reason = "Donnée sensible probable (RGPD art. 9) : exclue par défaut.";
  } else if (type === "email" || type === "phone" || type === "iban" || DIRECT_ID_HEADER.test(name)) {
    treatment = "drop";
    reason = "Identifiant direct : jamais transmis à l'IA.";
  } else if (type === "text") {
    treatment = "exclude";
    reason = "Texte libre : peut contenir des données personnelles, exclu de l'IA.";
  } else if (type === "category" && PERSON_HEADER.test(name) && !CLASSIFICATION_HEADER.test(name)) {
    treatment = "tokenize";
    reason = "Personne ou entité identifiable : remplacée par des jetons avant l'IA.";
  } else {
    treatment = "send";
    reason = type === "category" ? "Catégorie non identifiante." : "Valeur analytique non identifiante.";
  }

  const role: ColumnProfile["role"] =
    treatment === "block" || treatment === "drop" || treatment === "exclude"
      ? "ignored"
      : type === "date"
        ? "date"
        : type === "number"
          ? "measure"
          : "dimension";

  // Pourcentage : en fraction (0,37) si la plupart des valeurs sont entre -1,5 et 1,5, sinon en points (37).
  let percentScale: ColumnProfile["percentScale"];
  if (type === "number" && PERCENT_HEADER.test(name)) {
    const nums = present.map((v) => parseNumber(v)).filter((n): n is number => n !== null);
    percentScale = nums.filter((n) => Math.abs(n) <= 1.5).length >= nums.length * 0.8 ? "fraction" : "points";
  }
  return { name, type, role, treatment, missing, distinct, invalid, reason, ...(percentScale ? { percentScale } : {}) };
}

function typeValue(v: string | number | null, type: ColumnType): string | number | null {
  if (v === null) return null;
  if (type === "number") return parseNumber(v);
  if (type === "date") return parseDate(v);
  return String(v);
}

function labelType(type: ColumnType): string {
  return { date: "date", number: "nombre", email: "email", phone: "téléphone", iban: "IBAN", category: "catégorie", text: "texte" }[type];
}
