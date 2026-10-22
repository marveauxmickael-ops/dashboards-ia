import Link from "next/link";
import { RiveHero } from "@/components/animations/rive-hero";
import { StandaloneChart } from "@/components/dashboard-view";
import { LisioLogo } from "@/components/lisio-logo";
import { ButtonLink } from "@/components/ui/button-link";
import { IconTile } from "@/components/ui/card";
import { formatValue } from "@/lib/format";
import { landingPreview } from "@/lib/landing-preview";
import { HeroVisual } from "./hero-visual";

// Landing page (visiteurs non connectés). Uniquement des fonctionnalités réelles : aucun chiffre de performance,
// aucun témoignage ni logo client. L'aperçu est un vrai dashboard calculé sur des données fictives.


const icon = (d: string) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const STEPS = [
  {
    title: "Importez vos données",
    text: "Déposez un export Excel, CSV ou PDF. Le contrôle qualité signale doublons, cellules vides et valeurs incohérentes ; rien n'est corrigé sans votre accord.",
    icon: icon("M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4"),
    tone: "brand" as const,
  },
  {
    title: "L'IA analyse et structure",
    text: "Les données identifiantes sont pseudonymisées avant l'IA. Elle choisit les indicateurs et les axes d'analyse ; le moteur calcule chaque chiffre sur vos vraies données.",
    icon: icon("M12 3v3m0 12v3M3 12h3m12 0h3M6.3 6.3l2.1 2.1m7.2 7.2 2.1 2.1M6.3 17.7l2.1-2.1m7.2-7.2 2.1-2.1M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"),
    tone: "ai" as const,
  },
  {
    title: "Explorez et partagez",
    text: "Filtrez, posez vos questions, comparez les périodes. Partagez un lien en lecture seule ou exportez en PDF, Excel et CSV.",
    icon: icon("M18 8a3 3 0 1 0-2.8-4M6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM8.6 16.5l6.8-3M8.6 19.5l6.8 0"),
    tone: "brand" as const,
  },
];

const FEATURES = [
  "Filtres par période et par dimension, recalculés sans IA",
  "Questions en langage naturel sur vos données",
  "Analyse des variations : hausses, baisses et leurs causes chiffrées",
  "Mise à jour mensuelle : ajout des nouvelles données sans doublons",
  "Partage par lien sécurisé et exports PDF, Excel, CSV",
  "Vos couleurs et votre logo sur chaque dashboard",
];

function Check() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="mt-0.5 shrink-0 text-success">
      <path fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" d="m5 12 5 5 9-10" />
    </svg>
  );
}

export function LandingPage() {
  const preview = landingPreview();
  const shares = (preview?.breakdown?.data ?? []).slice(0, 4).map((d) => Math.max(0, d.value ?? 0));

  return (
    <div className="min-h-full bg-slate-50">
      <a href="#contenu" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">
        Aller au contenu
      </a>
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-slate-50/85 backdrop-blur">
        <nav aria-label="Navigation principale" className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" aria-label="Lisio, accueil">
            <LisioLogo />
          </Link>
          <div className="hidden items-center gap-6 text-sm text-slate-700 md:flex">
            <a href="#fonctionnalites" className="hover:text-brand-800">
              Fonctionnalités
            </a>
            <a href="#comment-ca-marche" className="hover:text-brand-800">
              Comment ça marche
            </a>
            <a href="#confidentialite" className="hover:text-brand-800">
              Confidentialité
            </a>
            <Link href="/tarifs" className="hover:text-brand-800">
              Tarifs
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/connexion" className="whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-white">
              Se connecter
            </Link>
            <span className="hidden sm:block">
              <ButtonLink href="/inscription">Créer mon dashboard</ButtonLink>
            </span>
          </div>
        </nav>
      </header>

      <main id="contenu">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-12 md:grid-cols-[1.25fr_1fr] md:pt-20">
          <div className="flex flex-col gap-6">
            <p className="w-fit rounded-full bg-accent-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent-700">L&apos;intelligence de vos données</p>
            <h1 className="text-4xl font-bold leading-[1.08] tracking-tight text-slate-900 sm:text-5xl md:text-[2.6rem] lg:text-[3.1rem] xl:text-[3.25rem]">
              Vos données.
              <br />
              Des dashboards puissants.
              <br />
              <span className="text-gradient-ai">En quelques instants.</span>
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-slate-600">
              Importez vos fichiers Excel ou CSV. L&apos;IA structure vos données et génère des tableaux de bord interactifs pour vous aider à prendre de
              meilleures décisions.
            </p>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/inscription" className="px-5 py-3 text-base">
                Créer mon dashboard <span aria-hidden="true">→</span>
              </ButtonLink>
              <ButtonLink href="/tarifs" variant="secondary" className="px-5 py-3 text-base">
                Voir les tarifs
              </ButtonLink>
            </div>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
              <li className="flex items-center gap-2">
                <Check /> Excel, CSV et PDF
              </li>
              <li className="flex items-center gap-2">
                <Check /> Pseudonymisation avant l&apos;IA
              </li>
              <li className="flex items-center gap-2">
                <Check /> Chaque chiffre calculé et vérifiable
              </li>
            </ul>
          </div>
          <RiveHero className="mx-auto w-full max-w-[560px] sm:aspect-[5/4.9]" fallback={<HeroVisual months={preview?.months ?? []} total={preview?.total ?? null} shares={shares.length ? shares : [4, 3, 2, 1]} />} />
        </section>

        {/* Comment ça marche */}
        <section id="comment-ca-marche" className="border-y border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Du fichier à la décision, en trois étapes</h2>
            <ol className="mt-10 grid gap-6 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-slate-200 bg-slate-50 p-5">
                  <IconTile tone={s.tone}>{s.icon}</IconTile>
                  <h3 className="text-lg font-semibold text-slate-900">
                    <span className="text-slate-400">{String(i + 1).padStart(2, "0")}.</span> {s.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-slate-600">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Aperçu produit et fonctionnalités */}
        <section id="fonctionnalites" className="mx-auto grid max-w-6xl items-start gap-10 px-4 py-16 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="flex flex-col gap-5">
            <p className="w-fit rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-900">Dashboards interactifs</p>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Des tableaux de bord qui s&apos;adaptent à vos besoins</h2>
            <p className="text-slate-600">Analysez vos performances, repérez les tendances et partagez des chiffres que chacun peut vérifier.</p>
            <ul className="flex flex-col gap-2.5 text-sm text-slate-800">
              {FEATURES.map((f) => (
                <li key={f} className="flex gap-2">
                  <Check /> {f}
                </li>
              ))}
            </ul>
          </div>
          {preview && (
            <figure className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_-28px_rgb(24_35_56/0.35)]">
              <div className="grid md:grid-cols-[150px_1fr]">
                <div aria-hidden="true" className="hidden flex-col gap-1 bg-slate-900 p-4 text-sm text-slate-300 md:flex">
                  <span className="mb-3 font-semibold text-white">Lisio</span>
                  {["Accueil", "Dashboards", "Données", "Paramètres"].map((x, i) => (
                    <span key={x} className={`rounded-lg px-2 py-1.5 ${i === 1 ? "bg-white/10 text-white" : ""}`}>
                      {x}
                    </span>
                  ))}
                </div>
                <div className="flex min-w-0 flex-col gap-3 p-4">
                  <div className="grid gap-2 sm:grid-cols-3">
                    {preview.kpis.map((k) => (
                      <div key={k.id} className="rounded-xl border border-slate-200 p-3">
                        <p className="truncate text-xs text-slate-600">{k.label}</p>
                        <p className="text-lg font-semibold tracking-tight text-slate-900 tabular-nums">{formatValue(k.value, k.format)}</p>
                      </div>
                    ))}
                  </div>
                  {preview.trend && <StandaloneChart chart={preview.trend} />}
                </div>
              </div>
              <figcaption className="border-t border-slate-200 px-4 py-2 text-xs text-slate-500">
                Aperçu réel calculé par le moteur sur un fichier d&apos;exemple ({preview.rowCount.toLocaleString("fr-FR")} lignes de données fictives).
              </figcaption>
            </figure>
          )}
        </section>

        {/* Confidentialité */}
        <section id="confidentialite" className="border-y border-slate-200 bg-white">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 py-14 md:grid-cols-3">
            {[
              ["Pseudonymisation", "Noms, emails et identifiants sont remplacés par des jetons avant tout envoi à l'IA ; ils sont rétablis seulement à l'affichage."],
              ["Fichiers non conservés", "Le fichier importé est lu le temps du calcul puis oublié : seul le dashboard est enregistré dans votre organisation."],
              ["Hébergement en Europe", "Application et base de données hébergées à Paris. Liens de partage révocables, double authentification disponible."],
            ].map(([title, text]) => (
              <div key={title} className="flex flex-col gap-2">
                <h3 className="font-semibold text-slate-900">{title}</h3>
                <p className="text-sm leading-relaxed text-slate-600">{text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Appel à l'action final */}
        <section className="mx-auto max-w-6xl px-4 py-16">
          <div className="flex flex-col items-start gap-5 rounded-2xl bg-slate-900 p-8 text-white sm:p-12 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-2">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Prêt à rendre vos chiffres lisibles ?</h2>
              <p className="text-slate-300">Créez votre premier dashboard à partir d&apos;un simple export.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/inscription" className="px-5 py-3 text-base">
                Créer mon dashboard <span aria-hidden="true">→</span>
              </ButtonLink>
              <ButtonLink href="/tarifs" variant="secondary" className="px-5 py-3 text-base">
                Voir les tarifs
              </ButtonLink>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-slate-600">
          <LisioLogo size={22} />
          <span>Prototype : utilisez uniquement des données fictives tant que le traitement IA n&apos;est pas hébergé en Union européenne.</span>
        </div>
      </footer>
    </div>
  );
}
