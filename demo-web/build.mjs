// Construit la démo navigateur en une page HTML autonome : node demo-web/build.mjs
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "demo-web/dist");
mkdirSync(out, { recursive: true });

const result = await build({
  entryPoints: [path.join(root, "demo-web/main.tsx")],
  bundle: true,
  minify: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  jsx: "automatic",
  write: false,
  alias: {
    "@": path.join(root, "src"),
    "node:crypto": path.join(root, "demo-web/crypto-shim.ts"),
    "@anthropic-ai/sdk/helpers/beta/zod": path.join(root, "demo-web/anthropic-stub.ts"),
    "@anthropic-ai/sdk": path.join(root, "demo-web/anthropic-stub.ts"),
  },
  define: {
    "process.env.NODE_ENV": '"production"',
    "process.env.AI_PROVIDER": '"demo"',
    "process.env.ANTHROPIC_API_KEY": '""',
    "process.env.CLAUDE_MODEL": "undefined",
    "process.env.PSEUDONYMIZATION_KEY": '"demo-navigateur"',
    global: "globalThis",
  },
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");

execFileSync("npx", ["@tailwindcss/cli", "-i", "demo-web/styles.css", "-o", "demo-web/dist/styles.css", "--minify"], { cwd: root, stdio: "inherit" });
const css = readFileSync(path.join(out, "styles.css"), "utf-8");

writeFileSync(
  path.join(out, "index.html"),
  `<meta charset="utf-8">\n<title>Dashboards IA</title>\n<meta name="description" content="Démo navigateur du prototype de génération de dashboards">\n<style>${css}</style>\n<div id="app"></div>\n<script>${js}</script>\n`,
);
copyFileSync(path.join(root, "public/demo/ventes-demo.csv"), path.join(out, "ventes-demo.csv"));
console.log(`index.html : ${(readFileSync(path.join(out, "index.html")).length / 1024).toFixed(0)} Ko`);
