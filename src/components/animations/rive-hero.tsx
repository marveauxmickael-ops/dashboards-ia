"use client";

import { lazy, Suspense, type ReactNode } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { RIVE_ASSETS } from "@/lib/rive";

const RivePlayer = lazy(() => import("./rive-player"));

/**
 * Animation principale de la landing page : fichier Rive (hero-animation.riv) si disponible, sinon `fallback`
 * (composition CSS). L'affichage principal n'attend jamais Rive : le repli est montré pendant le chargement.
 */
export function RiveHero({ fallback, className = "" }: { fallback: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  const asset = RIVE_ASSETS.hero;
  if (!asset || reduced) return <>{fallback}</>;
  return (
    <div className={className} role="img" aria-label="Un fichier Excel devient un dashboard">
      <Suspense fallback={fallback}>
        <RivePlayer asset={asset} className="size-full" />
      </Suspense>
    </div>
  );
}
