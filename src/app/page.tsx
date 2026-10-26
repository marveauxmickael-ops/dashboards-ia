import { AppHeader } from "@/components/app-header";
import { activeProvider } from "@/lib/ai/gateway";
import { Studio } from "@/components/studio";
import { getWorkspace } from "@/lib/auth/session";
import { LandingPage } from "@/components/landing/landing-page";
import { saveDashboardView } from "./dashboards/actions";

export default async function Home() {
  // Visiteur non connecté : landing page ; utilisateur connecté : création d'un dashboard, comme avant.
  const workspace = await getWorkspace();
  if (!workspace) return <LandingPage />;
  const { organization } = workspace;
  return (
    <>
      <AppHeader workspace={workspace} />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10">
        <header className="flex flex-col items-center gap-3 text-center print:hidden">
          <p className="w-fit rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-900">Nouveau dashboard</p>
          <h1 className="max-w-3xl text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Voyons ce que la démarque vous a coûté <span className="text-gradient-ai">ce mois-ci</span>
          </h1>
          <p className="max-w-2xl text-slate-600">
            Déposez vos extractions de caisse. En deux minutes, vous savez quel rayon, quel article et quel motif vous font perdre du chiffre.
          </p>
          <p className="max-w-2xl text-xs text-amber-900">
            Prototype : utilisez uniquement des données fictives. Le traitement IA n&apos;est pas encore hébergé en Union européenne.
          </p>
        </header>
        <Studio branding={organization.branding} aiAvailable={activeProvider() !== "demo"} saveView={saveDashboardView} />
      </main>
    </>
  );
}
