import type { Metadata } from "next";
import { Bricolage_Grotesque, IBM_Plex_Mono, Source_Sans_3 } from "next/font/google";
import "./globals.css";

// Polices de la charte Lisio, servies par l'application (aucun appel à Google depuis le navigateur).
const title = Bricolage_Grotesque({ variable: "--font-title", subsets: ["latin"], weight: ["600", "700", "800"] });
const body = Source_Sans_3({ variable: "--font-body", subsets: ["latin"] });
const code = IBM_Plex_Mono({ variable: "--font-code", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Lisio — vos chiffres, enfin lisibles",
  description: "Génération de tableaux de bord à partir de fichiers Excel et CSV, avec pseudonymisation avant l'IA.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${title.variable} ${body.variable} ${code.variable} h-full antialiased`}>
      <body className="min-h-full bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
