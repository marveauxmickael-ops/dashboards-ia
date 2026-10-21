// Démo autonome : tout le cycle (import, pseudonymisation, conception, calcul, ré-identification)
// s'exécute dans le navigateur. Aucun fichier n'est envoyé à un serveur.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrandSettings } from "@/components/brand-settings";
import { LisioLogo } from "@/components/lisio-logo";
import { NO_BRANDING, type Branding } from "@/lib/branding";
import { Studio } from "@/components/studio";
import { ImportError, parseFile } from "@/lib/ingest/parse";
import type { AskQuestion, Recompute } from "@/components/dashboard-workspace";
import { saveBlob, type AnalyzeQuality, type DownloadCleaned } from "@/components/quality-panel";
import { askDashboardQuestion, generateDashboard, IncompatibleFileError, recomputeDashboard } from "@/lib/pipeline";
import { QuestionError } from "@/lib/questions";
import { analyzeQuality, applyCleaning, cleanedCsv, cleanedFileName, type CleaningPlan } from "@/lib/quality";
import type { AiMode } from "@/lib/types";
import { combineDatasets, CombineError } from "@/lib/combine";
import type { CombineFiles } from "@/components/combine-summary";

async function generateInBrowser(file: File, mode: AiMode, cleaning?: CleaningPlan, compareBy?: string | null) {
  try {
    const result = await generateDashboard({ fileName: file.name, data: await file.arrayBuffer(), mode, organizationId: "demo-navigateur", cleaning, compareBy });
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

// Plusieurs fichiers regroupés dans le navigateur (US-16).
const combineInBrowser: CombineFiles = async (files, options = {}) => {
  try {
    const datasets = [];
    for (const file of files) {
      try {
        datasets.push(await parseFile(file.name, await file.arrayBuffer()));
      } catch (error) {
        throw error instanceof ImportError ? new ImportError(`« ${file.name} » : ${error.message}`) : error;
      }
    }
    const { dataset, summary } = combineDatasets(datasets, options);
    return { ok: true, file: new File([cleanedCsv(dataset)], dataset.fileName, { type: "text/csv" }), summary };
  } catch (error) {
    return { ok: false, message: error instanceof ImportError || error instanceof CombineError ? error.message : "Les fichiers n'ont pas pu être regroupés." };
  }
};

// Filtres calculés dans le navigateur, comme la génération : aucun envoi de fichier.
const recomputeInBrowser: Recompute = async ({ file, previous, filters, action }) => {
  try {
    const result = await recomputeDashboard({ previous, source: { fileName: file.name, data: await file.arrayBuffer() }, filters, mode: "standard", organizationId: "demo-navigateur", allowAi: action === "reimport" });
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <LisioLogo size={32} />
          <a href="../" className="text-sm text-brand-800 underline">
            ← Retour au site
          </a>
        </div>
        <p className="mt-4 font-mono text-xs uppercase tracking-widest text-slate-500">Démo navigateur</p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Votre fichier devient un <span className="text-gradient-ai">tableau de bord</span>
        </h1>
        <p className="max-w-2xl text-slate-600">
          Importez un export Excel, CSV ou PDF. Les données identifiantes sont pseudonymisées avant la conception du dashboard ; chaque chiffre
          est ensuite recalculé sur vos données et affiché en clair.
        </p>
        <p className="max-w-2xl rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-900">
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
      <Studio generateDashboard={generateInBrowser} recompute={recomputeInBrowser} demoFileUrl="ventes-demo.csv" demoShrinkageUrls={["multi/ventes-septembre-2026-bastille.csv", "multi/demarque-septembre-2026-bastille.csv"]} exportable={false} branding={branding} ask={askInBrowser} aiAvailable={false} analyzeQuality={analyzeInBrowser} downloadCleaned={downloadInBrowser} combineFiles={combineInBrowser} />
    </main>
  );
}

createRoot(document.getElementById("app")!).render(<App />);
