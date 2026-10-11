// Copie la démo navigateur (demo-web/dist) dans site/demo : npm run build:site
import { cpSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const target = path.join(root, "site/demo");
mkdirSync(target, { recursive: true });
for (const file of ["index.html", "ventes-demo.csv"]) cpSync(path.join(root, "demo-web/dist", file), path.join(target, file));
console.log("Démo copiée dans site/demo");
