import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { BrandSettings } from "@/components/brand-settings";
import { canManage, requireWorkspace } from "@/lib/auth/session";
import { saveBranding } from "./actions";

export default async function BrandPage() {
  const { organization, user, role } = await requireWorkspace();
  if (!canManage(role)) redirect("/");
  return (
    <>
      <AppHeader organization={organization.name} email={user.email} manage />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Charte graphique</h1>
          <p className="max-w-2xl text-slate-600">
            Importez le logo de {organization.name} et choisissez vos couleurs : ils s&apos;appliquent à tous les dashboards de l&apos;organisation, à
            l&apos;écran, dans les PDF, les exports Excel et les liens partagés.
          </p>
        </header>
        <BrandSettings initial={organization.branding} onSave={saveBranding} organization={organization.name} />
      </main>
    </>
  );
}
