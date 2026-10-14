import { AppHeader } from "@/components/app-header";
import { activeProvider } from "@/lib/ai/gateway";
import { Studio } from "@/components/studio";
import { requireWorkspace } from "@/lib/auth/session";
import { saveDashboardView } from "./dashboards/actions";

export default async function Home() {
  const workspace = await requireWorkspace();
  const { organization } = workspace;
  return (
    <>
      <AppHeader workspace={workspace} />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10">
        <header className="flex flex-col gap-2 print:hidden">
          <p className="w-fit rounded-full bg-accent-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent-700">IA · Données · Dashboards</p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Votre fichier devient un <span className="text-gradient-ai">tableau de bord</span>
          </h1>
          <p className="max-w-2xl text-slate-600">
            Importez un export Excel, CSV ou PDF. Les données identifiantes sont pseudonymisées avant que l&apos;IA ne conçoive le dashboard ;
            chaque chiffre est ensuite recalculé sur vos données et affiché en clair. Le fichier n&apos;est pas conservé : seul le dashboard est
            enregistré dans votre organisation.
          </p>
          <p className="max-w-2xl rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Prototype : utilisez uniquement des données fictives. Le traitement IA n&apos;est pas encore hébergé en Union européenne.
          </p>
        </header>
        <Studio branding={organization.branding} aiAvailable={activeProvider() !== "demo"} saveView={saveDashboardView} />
      </main>
    </>
  );
}
