"use client";

import { lazy, Suspense } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { RIVE_ASSETS } from "@/lib/rive";

// Chargé à la demande, seulement si un fichier Rive est déclaré (React.lazy : fonctionne aussi dans la démo navigateur).
const RivePlayer = lazy(() => import("./rive-player"));

/**
 * Analyse IA en cours : un noyau qui pulse et des anneaux qui tournent, tant que `active` est vrai.
 * Piloté par l'état réel de la génération : rien n'indique un succès avant la réponse du serveur.
 * Fichier Rive si disponible (lib/rive.ts), sinon équivalent SVG ; immobile si l'utilisateur réduit les animations.
 */
export function AIProcessing({ active, size = 72 }: { active: boolean; size?: number }) {
  const reduced = useReducedMotion();
  const rive = RIVE_ASSETS.aiProcessing;
  if (rive && !reduced) {
    return (
      <div style={{ width: size, height: size }} aria-hidden="true">
        <Suspense fallback={<ProcessingSvg moving={false} size={size} />}>
          <RivePlayer asset={rive} input={{ name: "isProcessing", value: active }} className="size-full" />
        </Suspense>
      </div>
    );
  }
  return <ProcessingSvg moving={active && !reduced} size={size} />;
}

/** Équivalent SVG / CSS de l'animation Rive : noyau qui pulse, deux anneaux qui tournent en sens inverse. */
function ProcessingSvg({ moving, size }: { moving: boolean; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden="true" className="shrink-0">
      <defs>
        <radialGradient id="noyau-ia" cx="0.35" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#a48df1" />
          <stop offset="1" stopColor="#5532b8" />
        </radialGradient>
        <linearGradient id="anneau-ia" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#245bdb" />
          <stop offset="1" stopColor="#7955e8" />
        </linearGradient>
      </defs>
      <g className={moving ? "origin-center animate-orbit" : ""} style={{ transformBox: "fill-box" }}>
        <circle cx="36" cy="36" r="31" fill="none" stroke="url(#anneau-ia)" strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="4 6" />
        <circle cx="36" cy="5" r="3" fill="#245bdb" />
      </g>
      <g className={moving ? "origin-center animate-orbit [animation-direction:reverse] [animation-duration:4.8s]" : ""} style={{ transformBox: "fill-box" }}>
        <circle cx="36" cy="36" r="22" fill="none" stroke="url(#anneau-ia)" strokeOpacity="0.5" strokeWidth="1.5" />
        <circle cx="58" cy="36" r="2.5" fill="#7955e8" />
      </g>
      <circle cx="36" cy="36" r="13" fill="url(#noyau-ia)" className={moving ? "origin-center animate-pulse-core" : ""} style={{ transformBox: "fill-box" }} />
      <text x="36" y="40" textAnchor="middle" fontSize="11" fontWeight="700" fill="#ffffff" fontFamily="var(--font-body)">
        IA
      </text>
    </svg>
  );
}
