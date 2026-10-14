"use client";

import { useEffect } from "react";
import { useRive, useStateMachineInput } from "@rive-app/react-canvas";
import type { RiveAsset } from "@/lib/rive";

/**
 * Lecteur Rive générique, chargé à la demande (next/dynamic) pour ne pas alourdir les pages.
 * `input` synchronise une entrée de la machine d'états avec l'état réel de l'application.
 */
export default function RivePlayer({ asset, input, className }: { asset: RiveAsset; input?: { name: string; value: boolean | number }; className?: string }) {
  const { rive, RiveComponent } = useRive({ src: asset.src, stateMachines: asset.stateMachine, autoplay: true });
  const stateInput = useStateMachineInput(rive, asset.stateMachine, input?.name ?? "");
  useEffect(() => {
    // L'API Rive se pilote en affectant la valeur de l'entrée de la machine d'états.
    // eslint-disable-next-line react-hooks/immutability
    if (stateInput && input) stateInput.value = input.value;
  }, [stateInput, input]);
  return <RiveComponent className={className} />;
}
