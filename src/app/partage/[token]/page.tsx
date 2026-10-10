import type { Metadata } from "next";
import { DashboardWorkspace } from "@/components/dashboard-workspace";
import { parseBranding } from "@/lib/branding";
import { loadSharedDashboard } from "@/lib/dashboards/shared";

export const metadata: Metadata = { title: "Dashboard partagé", robots: { index: false, follow: false } };

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" });
const link = "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50";

// Consultation d'un dashboard partagé (US-01), sans compte. Un lien invalide, désactivé ou révoqué
// affiche le même message, pour ne rien révéler de l'existence du dashboard.
export default async function SharedDashboardPage({ params }: PageProps<"/partage/[token]">) {
  const { token } = await params;
  const shared = await loadSharedDashboard(token);

  if (!shared) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-col gap-3 px-4 py-20">
        <h1 className="text-2xl font-semibold text-slate-900">Lien indisponible</h1>
        <p className="text-slate-600">Ce lien de partage n&apos;existe pas, a été désactivé ou révoqué. Demandez un nouveau lien à la personne qui vous l&apos;a envoyé.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Partagé par <strong className="font-medium text-slate-800">{shared.organization}</strong> · données actualisées le{" "}
          {dateFormat.format(new Date(shared.refreshed_at))} · consultation seule
        </p>
        {shared.access === "view_export" && (
          <div className="flex flex-wrap gap-2 print:hidden">
            <a href={`/api/partage/${token}/export?format=xlsx`} className={link} download>
              Excel
            </a>
            <a href={`/api/partage/${token}/export?format=csv`} className={link} download>
              CSV
            </a>
          </div>
        )}
      </div>
      <DashboardWorkspace initial={shared.result} exportable={false} tools={false} branding={parseBranding(shared.branding)} />
    </main>
  );
}
