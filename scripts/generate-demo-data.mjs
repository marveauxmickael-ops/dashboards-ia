// Génère un fichier de ventes entièrement fictif pour les démonstrations.
// Usage : node scripts/generate-demo-data.mjs
import { mkdirSync, writeFileSync } from "node:fs";

let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (list) => list[Math.floor(rand() * list.length)];

const clients = [
  "Boulangerie des Halles", "Atelier Lumière", "Garage du Centre", "Pharmacie Saint-Michel", "Hôtel Les Tilleuls",
  "Cabinet Dupont Conseil", "Fromagerie Bellevue", "Imprimerie Arc-en-Ciel", "Menuiserie Moreau", "Librairie Le Phare",
  "Transports Rivière", "Clinique Vétérinaire Azur", "Restaurant La Table Ronde", "Agence Horizon", "Brasserie du Port",
  "Opticien Clair Regard", "Pépinière Verte Vallée", "Salon Éclat", "Ferronnerie Durand", "Épicerie Fine Saveurs",
];
const commerciaux = ["Camille Lefèvre", "Hugo Bernard", "Léa Martin", "Nathan Petit", "Inès Robert"];
const regions = ["Île-de-France", "Ouest", "Sud-Est", "Nord-Est", "Sud-Ouest"];
const produits = [
  { nom: "Logiciel de caisse", prix: [900, 2400], marge: 0.55 },
  { nom: "Maintenance annuelle", prix: [300, 900], marge: 0.7 },
  { nom: "Formation", prix: [450, 1500], marge: 0.45 },
  { nom: "Matériel", prix: [600, 3200], marge: 0.25 },
];
const commentaires = ["", "", "", "Client satisfait, à relancer en fin d'année", "Retard de livraison signalé par le client", "Remise accordée suite à négociation"];

const fr = (n) => n.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const rows = [];
for (let i = 0; i < 640; i++) {
  const month = Math.floor(rand() * 12); // octobre 2025 → septembre 2026
  const year = month < 3 ? 2025 : 2026;
  const m = ((month + 9) % 12) + 1;
  const day = 1 + Math.floor(rand() * 28);
  const client = pick(clients);
  const produit = pick(produits);
  // Saisonnalité : creux en août, pic en décembre.
  const season = m === 8 ? 0.6 : m === 12 ? 1.35 : 1;
  const montant = (produit.prix[0] + rand() * (produit.prix[1] - produit.prix[0])) * season;
  const cout = montant * (1 - produit.marge) * (0.9 + rand() * 0.2);
  const slug = client.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]+/g, "");
  rows.push([
    `${String(day).padStart(2, "0")}/${String(m).padStart(2, "0")}/${year}`,
    client,
    `contact@${slug}.example`,
    pick(commerciaux),
    pick(regions),
    produit.nom,
    i === 57 || i === 311 ? "N/A" : fr(montant),
    fr(cout),
    pick(commentaires),
  ]);
}
rows.push([...rows[10]]); // un doublon volontaire pour la détection d'anomalies

const header = ["Date", "Client", "Email contact", "Commercial", "Région", "Produit", "Montant HT", "Coût", "Commentaire"];
const csv = [header, ...rows].map((r) => r.map((v) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(";")).join("\n");
mkdirSync(new URL("../public/demo/", import.meta.url), { recursive: true });
writeFileSync(new URL("../public/demo/ventes-demo.csv", import.meta.url), csv + "\n");
console.log(`${rows.length} lignes écrites dans public/demo/ventes-demo.csv`);
