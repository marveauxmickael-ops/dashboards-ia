import type { Metadata } from "next";
import { DashboardWorkspace } from "@/components/dashboard-workspace";
import { parseBranding } from "@/lib/branding";
import { loadSharedDashboard } from "@/lib/dashboards/shared";

// Aperçu du lien sur les réseaux et messageries : logo Lisio (image du dossier racine) et texte générique, jamais
// le nom du dashboard ni ses chiffres, que le service d'aperçu récupérerait sans authentification.
// Une page qui définit son propre openGraph n'hérite plus de l'image du dossier racine : elle est reprise ici.
const shareImage = { url: "/opengraph-image.png", width: 1200, height: 630, alt: "Lisio : vos fichiers Excel, CSV et PDF deviennent des tableaux de bord clairs et partageables" };

export const metadata: Metadata = {
  title: "Dashboard partagé",
  robots: { index: false, follow: false },
  openGraph: { type: "website", locale: "fr_FR", siteName: "Lisio", title: "Un tableau de bord a été partagé avec vous", description: "Consultez-le avec Lisio : vos chiffres, enfin lisibles.", images: [shareImage] },
  twitter: { card: "summary_large_image", images: [shareImage], title: "Un tableau de bord a été partagé avec vous", description: "Consultez-le avec Lisio : vos chiffres, enfin lisibles." },
};

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
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-10">
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
      <DashboardWorkspace initial={shared.result} exportable={false} tools={false} branding={parseBranding(shared.branding)} fixedView={shared.view} />
    </main>
  );
}
