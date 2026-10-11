import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { SettingsShell } from "@/components/settings-shell";
import { BrandSettings } from "@/components/brand-settings";
import { canManage, requireWorkspace } from "@/lib/auth/session";
import { saveBranding } from "./actions";

export default async function BrandPage() {
  const workspace = await requireWorkspace();
  const { organization, role } = workspace;
  if (!canManage(role)) redirect("/");
  return (
    <>
      <AppHeader workspace={workspace} />
      <SettingsShell workspace={workspace}>
        <header className="flex flex-col gap-2">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Charte graphique</h2>
          <p className="max-w-2xl text-slate-600">
            Importez le logo de {organization.name} et choisissez vos couleurs : ils s&apos;appliquent à tous les dashboards de l&apos;organisation, à
            l&apos;écran, dans les PDF, les exports Excel et les liens partagés.
          </p>
        </header>
        <BrandSettings initial={organization.branding} onSave={saveBranding} organization={organization.name} />
      </SettingsShell>
    </>
  );
}
