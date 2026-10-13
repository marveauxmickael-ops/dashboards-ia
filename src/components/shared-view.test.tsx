import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { generateDashboard, type DashboardResult } from "@/lib/pipeline";
import { DashboardWorkspace } from "./dashboard-workspace";

// Lien partagé : la fonction shared_dashboard retire aiContext, spec, filterOptions et issues du résultat.
// L'affichage doit fonctionner sans ces champs (régression : « This page couldn't load »).
describe("dashboard partagé", () => {
  it("s'affiche sans les champs retirés par la fonction de partage", async () => {
    const b = readFileSync(path.resolve(import.meta.dirname, "../../public/demo/ventes-demo.csv"));
    const full = await generateDashboard({ fileName: "ventes.csv", data: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, mode: "standard", organizationId: "org-1" });
    const shared = { ...full } as Partial<DashboardResult>;
    for (const key of ["aiContext", "spec", "filterOptions", "issues"] as const) delete shared[key];
    const html = renderToString(<DashboardWorkspace initial={shared as DashboardResult} exportable={false} tools={false} />);
    expect(html).toContain("dashboard-print-root");
    expect(html).toContain(full.title.replace("'", "&#x27;"));
  });
});
