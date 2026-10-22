import type { Metadata } from "next";
import Link from "next/link";
import { LisioLogo } from "@/components/lisio-logo";
import { ButtonLink } from "@/components/ui/button-link";
import { BROCHURE_URL, OPTIONS, PLANS, PROTECTION, PROTECTION_TITLE } from "@/lib/marketing/offer";

export const metadata: Metadata = {
  title: "Tarifs — Lisio",
  description: "Lisio pour un magasin, un réseau ou une enseigne : offres, prix et protection de vos données.",
};

function Check({ className = "text-success" }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className={`mt-0.5 shrink-0 ${className}`}>
      <path fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" d="m5 12 5 5 9-10" />
    </svg>
  );
}

function Shield() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0 text-brand-800">
      <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6zM9 12l2 2 4-4" />
    </svg>
  );
}

// Page Tarifs, publique : offres Magasin et Enseigne, options, et l'argument « Vos données protégées ».
export default function PricingPage() {
  return (
    <div className="min-h-full bg-slate-50">
      <header className="border-b border-slate-200/80 bg-slate-50/85">
        <nav aria-label="Navigation principale" className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" aria-label="Lisio, accueil">
            <LisioLogo />
          </Link>
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
        <section className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-4 pb-10 pt-12 text-center md:pt-16">
          <p className="font-mono text-xs uppercase tracking-widest text-brand-800">Tarifs</p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Pilotez votre chiffre et votre <span className="text-gradient-ai">démarque</span>
          </h1>
          <p className="max-w-2xl text-lg text-slate-600">
            Vos exports deviennent des tableaux de bord clairs, la perte de chiffre se lit en euros, et des recommandations vous disent où agir. Lecteurs illimités dans toutes les offres.
          </p>
        </section>

        <section aria-label="Offres" className="mx-auto grid max-w-4xl gap-4 px-4 md:grid-cols-2">
          {PLANS.map((plan) => (
            <article
              key={plan.id}
              className={`relative flex flex-col gap-5 rounded-[var(--radius-card)] border bg-white p-6 shadow-card ${plan.highlighted ? "border-brand-600 ring-2 ring-brand-600/30" : "border-slate-200"}`}
            >
              {plan.highlighted && (
                <span className="absolute -top-3 left-6 rounded-full bg-brand-800 px-3 py-0.5 text-xs font-semibold text-white">Pour les réseaux de magasins</span>
              )}
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold text-slate-900">{plan.name}</h2>
                <p className="text-sm text-slate-600">{plan.audience}</p>
              </div>
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-4xl font-bold tracking-tight text-slate-900">{plan.price}</span>
                <span className="text-sm text-slate-500">{plan.unit}</span>
              </p>
              <ul className="flex flex-1 flex-col gap-2 text-sm text-slate-700">
                {plan.features.map((f) => {
                  // « (bientôt) » : fonctionnalité annoncée, pas encore en place, affichée comme telle.
                  const soon = f.endsWith("(bientôt)");
                  return (
                    <li key={f} className="flex gap-2">
                      <Check className={soon ? "text-slate-400" : "text-success"} />
                      <span>
                        {soon ? f.replace(/\s*\(bientôt\)$/, "") : f}
                        {soon && <span className="ml-1.5 rounded bg-accent-50 px-1.5 py-0.5 text-[11px] font-semibold text-accent-800">bientôt</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {plan.id === "enseigne" ? (
                <a href={BROCHURE_URL} download className="inline-flex justify-center rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50">
                  Télécharger la plaquette
                </a>
              ) : (
                <ButtonLink href="/inscription" variant={plan.highlighted ? "primary" : "secondary"} className="justify-center">
                  Commencer
                </ButtonLink>
              )}
            </article>
          ))}
        </section>

        <section aria-label="Options" className="mx-auto mt-6 grid max-w-4xl gap-3 px-4 md:grid-cols-3">
          {OPTIONS.map((o) => (
            <div key={o.title} className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">{o.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{o.text}</p>
            </div>
          ))}
        </section>

        <section aria-labelledby="donnees-protegees" className="mt-14 border-y border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-14">
            <h2 id="donnees-protegees" className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {PROTECTION_TITLE}
            </h2>
            <ul className="grid gap-4 md:grid-cols-2">
              {PROTECTION.map((p) => (
                <li key={p.lead} className="flex gap-3 rounded-xl border border-slate-200 p-4">
                  <Shield />
                  <p className="text-sm leading-relaxed text-slate-700">
                    <strong className="font-semibold text-slate-900">{p.lead}</strong> : {p.text}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-14">
          <div className="flex flex-col items-start gap-5 rounded-2xl bg-slate-900 p-8 text-white sm:p-12 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-2">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Essayez Lisio 14 jours sur vos propres chiffres</h2>
              <p className="text-slate-300">Accès d&apos;essai ouvert sur demande, avec une mise en route accompagnée. Emportez la plaquette pour la partager.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <a href={BROCHURE_URL} download className="inline-flex items-center gap-2 rounded-full border border-white/40 px-5 py-3 text-base font-semibold text-white hover:bg-white/10">
                Télécharger la plaquette (PDF)
              </a>
            </div>
          </div>
          <p className="mt-6 text-xs text-slate-500">Prix hors taxes, par mois et par organisation. Les éditeurs créent et modifient les dashboards ; les lecteurs les consultent.</p>
        </section>
      </main>
    </div>
  );
}
