// Démo autonome : tout le cycle (import, pseudonymisation, conception, calcul, ré-identification)
// s'exécute dans le navigateur. Aucun fichier n'est envoyé à un serveur.
import { createRoot } from "react-dom/client";
import { Studio } from "@/components/studio";
import { ImportError } from "@/lib/ingest/parse";
import { generateDashboard } from "@/lib/pipeline";
import type { AiMode } from "@/lib/types";

async function generateInBrowser(file: File, mode: AiMode) {
  try {
    const result = await generateDashboard({ fileName: file.name, data: await file.arrayBuffer(), mode, organizationId: "demo-navigateur" });
    return { ok: true as const, result };
  } catch (error) {
    return { ok: false as const, message: error instanceof ImportError ? error.message : "Le fichier n'a pas pu être analysé." };
  }
}

function App() {
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
      <Studio generateDashboard={generateInBrowser} demoFileUrl="ventes-demo.csv" exportable={false} />
    </main>
  );
}

createRoot(document.getElementById("app")!).render(<App />);
