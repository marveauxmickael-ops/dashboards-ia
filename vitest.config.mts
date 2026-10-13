import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    env: {
      // Les tests n'appellent jamais Claude : le concepteur de démonstration est utilisé.
      AI_PROVIDER: "demo",
      ANTHROPIC_API_KEY: "",
    },
  },
});
