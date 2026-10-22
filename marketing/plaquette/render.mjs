// Génère la plaquette PDF (public/plaquette-lisio.pdf, retirée du site en attendant la nouvelle présentation) à partir de plaquette.html : node marketing/plaquette/render.mjs
import { chromium } from "playwright";
import path from "node:path";

const dir = import.meta.dirname;
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`file://${path.join(dir, "plaquette.html")}`);
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: path.join(dir, "../../public/plaquette-lisio.pdf"), format: "A4", printBackground: true, preferCSSPageSize: true });
await page.setViewportSize({ width: 794, height: 1123 });
for (const [i, name] of [[0, "page-1"], [1, "page-2"]]) {
  await page.locator("section.page").nth(i).screenshot({ path: path.join(dir, `apercu-${name}.png`) });
}
await browser.close();
console.log("Plaquette générée : public/plaquette-lisio.pdf");
