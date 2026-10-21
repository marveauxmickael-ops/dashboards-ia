// Copie la démo navigateur (demo-web/dist) dans site/demo : npm run build:site
import { cpSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const target = path.join(root, "site/demo");
mkdirSync(target, { recursive: true });
for (const file of ["index.html", "ventes-demo.csv"]) cpSync(path.join(root, "demo-web/dist", file), path.join(target, file));
// Exemple « ventes + démarque » : fichiers fictifs.
mkdirSync(path.join(target, "multi"), { recursive: true });
for (const file of ["ventes-septembre-2026-bastille.csv", "demarque-septembre-2026-bastille.csv"]) cpSync(path.join(root, "public/demo/multi", file), path.join(target, "multi", file));
console.log("Démo copiée dans site/demo");
