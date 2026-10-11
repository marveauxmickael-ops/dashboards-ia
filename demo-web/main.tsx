// Démo autonome : tout le cycle (import, pseudonymisation, conception, calcul, ré-identification)
// s'exécute dans le navigateur. Aucun fichier n'est envoyé à un serveur.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrandSettings } from "@/components/brand-settings";
import { NO_BRANDING, type Branding } from "@/lib/branding";
import { Studio } from "@/components/studio";
import { ImportError, parseFile } from "@/lib/ingest/parse";
import type { AskQuestion, Recompute } from "@/components/dashboard-workspace";
import { saveBlob, type AnalyzeQuality, type DownloadCleaned } from "@/components/quality-panel";
import { askDashboardQuestion, generateDashboard, IncompatibleFileError, recomputeDashboard } from "@/lib/pipeline";
import { QuestionError } from "@/lib/questions";
import { analyzeQuality, applyCleaning, cleanedCsv, cleanedFileName, type CleaningPlan } from "@/lib/quality";
import type { AiMode } from "@/lib/types";

async function generateInBrowser(file: File, mode: AiMode, cleaning?: CleaningPlan) {
  try {
    const result = await generateDashboard({ fileName: file.name, data: await file.arrayBuffer(), mode, organizationId: "demo-navigateur", cleaning });
    return { ok: true as const, result };
  } catch (error) {
    return { ok: false as const, message: error instanceof ImportError ? error.message : "Le fichier n'a pas pu être analysé." };
  }
}

// Contrôle qualité et fichier corrigé, calculés dans le navigateur.
const analyzeInBrowser: AnalyzeQuality = async (file) => {
  try {
    return { ok: true, report: analyzeQuality(await parseFile(file.name, await file.arrayBuffer())) };
  } catch (error) {
    return { ok: false, message: error instanceof ImportError ? error.message : "Le fichier n'a pas pu être analysé." };
  }
};

const downloadInBrowser: DownloadCleaned = async (file, plan) => {
  try {
    const { dataset } = applyCleaning(await parseFile(file.name, await file.arrayBuffer()), plan);
    saveBlob(new Blob([cleanedCsv(dataset)], { type: "text/csv;charset=utf-8" }), cleanedFileName(file.name));
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof ImportError ? error.message : "Le fichier corrigé n'a pas pu être produit." };
  }
};

// Filtres calculés dans le navigateur, comme la génération : aucun envoi de fichier.
const recomputeInBrowser: Recompute = async ({ file, previous, filters, action }) => {
  try {
    const result = await recomputeDashboard({ previous, fileName: file.name, data: await file.arrayBuffer(), filters, mode: "standard", organizationId: "demo-navigateur", allowAi: action === "reimport" });
    return { ok: true, result };
  } catch (error) {
    return { ok: false, message: error instanceof ImportError || error instanceof IncompatibleFileError ? error.message : "Le recalcul a échoué." };
  }
};

// Questions interprétées par mots-clés dans le navigateur (aucun appel à une IA dans la démo).
const askInBrowser: AskQuestion = async ({ file, previous, question }) => {
  try {
    const answer = await askDashboardQuestion({ previous, fileName: file.name, data: await file.arrayBuffer(), question, mode: "standard", organizationId: "demo-navigateur" });
    return { ok: true, answer };
  } catch (error) {
    const known = error instanceof ImportError || error instanceof IncompatibleFileError || error instanceof QuestionError;
    return { ok: false, message: known ? (error as Error).message : "La question n'a pas pu être traitée." };
  }
};

function App() {
  const [branding, setBranding] = useState<Branding>(NO_BRANDING);
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-2 print:hidden">
        <p className="text-xs font-semibold uppercase tracking-widest text-teal-800">Démo navigateur</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Votre fichier devient un tableau de bord</h1>
        <p className="max-w-2xl text-slate-600">
          Importez un export Excel ou CSV. Les données identifiantes sont pseudonymisées avant la conception du dashboard ; chaque chiffre
          est ensuite recalculé sur vos données et affiché en clair.
        </p>
        <p className="max-w-2xl rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900">
          Tout s&apos;exécute dans votre navigateur : aucun fichier n&apos;est envoyé. La conception utilise le mode démonstration, sans appel à Claude.
        </p>
      </header>
      <details className="rounded-xl border border-slate-200 bg-white p-4 print:hidden">
        <summary className="cursor-pointer text-sm font-semibold text-slate-800">Charte graphique (logo et couleurs)</summary>
        <div className="mt-4">
          <BrandSettings
            initial={branding}
            organization="votre organisation"
            onSave={async (b) => {
              setBranding(b);
              return { ok: true };
            }}
          />
        </div>
      </details>
      <Studio generateDashboard={generateInBrowser} recompute={recomputeInBrowser} demoFileUrl="ventes-demo.csv" exportable={false} branding={branding} ask={askInBrowser} aiAvailable={false} analyzeQuality={analyzeInBrowser} downloadCleaned={downloadInBrowser} />
    </main>
  );
}

createRoot(document.getElementById("app")!).render(<App />);
