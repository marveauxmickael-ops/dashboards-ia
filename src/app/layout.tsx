import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// Geist pour les titres et le texte, Geist Mono pour les formules ; servies par l'application
// (aucun appel à Google depuis le navigateur).
const title = Geist({ variable: "--font-title", subsets: ["latin"], weight: ["600", "700", "800"] });
const body = Geist({ variable: "--font-body", subsets: ["latin"] });
const code = Geist_Mono({ variable: "--font-code", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Lisio — vos chiffres, enfin lisibles",
  description: "Génération de tableaux de bord à partir de fichiers Excel et CSV, avec pseudonymisation avant l'IA.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${title.variable} ${body.variable} ${code.variable} h-full antialiased`}>
      <body className="min-h-full bg-slate-50 font-sans text-slate-900">{children}</body>
    </html>
  );
}
