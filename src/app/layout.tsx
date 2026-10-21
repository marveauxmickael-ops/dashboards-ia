import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// Geist pour les titres et le texte, Geist Mono pour les formules ; servies par l'application
// (aucun appel à Google depuis le navigateur).
const title = Geist({ variable: "--font-title", subsets: ["latin"], weight: ["600", "700", "800"] });
const body = Geist({ variable: "--font-body", subsets: ["latin"] });
const code = Geist_Mono({ variable: "--font-code", subsets: ["latin"], weight: ["400", "500"] });

const description = "Vos fichiers Excel, CSV et PDF deviennent des tableaux de bord clairs, commentés et partageables, en quelques instants. Données pseudonymisées avant l'IA, chiffres vérifiés, hébergé en France.";

// Aperçu lors du partage d'un lien (LinkedIn, Facebook, WhatsApp, X…) : titre, description et image avec le logo
// (opengraph-image.png et twitter-image.png, 1200 × 630, dans ce dossier). Les adresses des images sont rendues
// absolues à partir du domaine de production.
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://dashboards-ia-creetacrea.vercel.app"),
  title: "Lisio — vos chiffres, enfin lisibles",
  description,
  openGraph: {
    type: "website",
    locale: "fr_FR",
    siteName: "Lisio",
    title: "Lisio — vos chiffres, enfin lisibles",
    description,
  },
  twitter: {
    card: "summary_large_image",
    title: "Lisio — vos chiffres, enfin lisibles",
    description,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${title.variable} ${body.variable} ${code.variable} h-full antialiased`}>
      <body className="min-h-full bg-slate-50 font-sans text-slate-900">{children}</body>
    </html>
  );
}
