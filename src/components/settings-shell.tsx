import type { ReactNode } from "react";
import { canManage, type Workspace } from "@/lib/auth/session";
import { SideTabs } from "./nav-tabs";

/** Onglet « Paramètres » : menu latéral (organisation, compte) et contenu de la rubrique. */
export function SettingsShell({ workspace, children }: { workspace: Pick<Workspace, "role" | "organization">; children: ReactNode }) {
  const manager = canManage(workspace.role);
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-slate-500">{workspace.organization.name}</p>
        <h1 className="text-3xl font-bold tracking-tight text-brand-800">Paramètres</h1>
      </div>
      <div className="flex flex-wrap items-start gap-6">
        <div className="w-full sm:w-60 sm:shrink-0">
          <SideTabs
            label="Rubriques des paramètres"
            groups={[
              {
                title: "Organisation",
                tabs: [
                  { href: "/organisation", label: "Membres et invitations", match: ["/organisation"], exact: true },
                  ...(manager
                    ? [
                        { href: "/organisation/charte", label: "Charte graphique", match: ["/organisation/charte"] },
                        { href: "/organisation/journal", label: "Journal d'audit", match: ["/organisation/journal"] },
                      ]
                    : []),
                ],
              },
              { title: "Mon compte", tabs: [{ href: "/compte/securite", label: "Sécurité et double authentification", match: ["/compte/securite"] }] },
            ]}
          />
        </div>
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">{children}</div>
      </div>
    </main>
  );
}
