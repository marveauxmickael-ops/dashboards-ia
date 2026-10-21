"use client";

import { useSyncExternalStore } from "react";

// Bloc réduit ou déplié (recommandations, démarque) : choix de chaque personne, quel que soit son rôle, mémorisé dans
// son navigateur pour tous ses dashboards. Il ne modifie pas l'affichage enregistré avec le dashboard.
const listeners = new Set<() => void>();
const fallback = new Map<string, boolean>();

function read(key: string): boolean {
  if (fallback.has(key)) return fallback.get(key)!;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCollapsed(key: string): [boolean, (value: boolean) => void] {
  const collapsed = useSyncExternalStore(subscribe, () => read(key), () => false);
  const set = (value: boolean) => {
    try {
      if (value) window.localStorage.setItem(key, "1");
      else window.localStorage.removeItem(key);
      fallback.delete(key);
    } catch {
      // Stockage indisponible : le choix vaut pour la page en cours.
      fallback.set(key, value);
    }
    listeners.forEach((l) => l());
  };
  return [collapsed, set];
}
