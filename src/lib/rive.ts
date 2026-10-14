// Animations Rive (motion design « Data in motion »). Chaque fichier .riv est produit dans l'éditeur Rive puis déposé
// dans public/animations ; tant que son chemin vaut null ici, l'équivalent CSS / SVG léger est affiché à la place.
// Les animations ne portent aucune donnée : elles reflètent seulement un état réel de l'application.

export interface RiveAsset {
  src: string;
  /** Machine d'états définie dans l'éditeur Rive. */
  stateMachine: string;
}

export const RIVE_ASSETS: Record<"hero" | "aiProcessing" | "uiInteractions" | "dashboardCreation", RiveAsset | null> = {
  // Landing page : fichier qui arrive, analyse, cartes KPI et graphiques qui se composent (boucle sur l'état final).
  hero: null, // { src: "/animations/hero-animation.riv", stateMachine: "Hero" }
  // Import : noyau et anneaux ; entrée booléenne « isProcessing » pilotée par l'état réel de la génération.
  aiProcessing: null, // { src: "/animations/ai-processing.riv", stateMachine: "AIProcessing" }
  // Micro-interactions : boutons, filtres, validations.
  uiInteractions: null, // { src: "/animations/ui-interactions.riv", stateMachine: "UI" }
  // Premier dashboard : cartes qui apparaissent par étapes ; entrée numérique « step ».
  dashboardCreation: null, // { src: "/animations/dashboard-creation.riv", stateMachine: "DashboardCreation" }
};
