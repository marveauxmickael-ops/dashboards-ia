import { Studio } from "@/components/studio";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-teal-800">Prototype</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Votre fichier devient un tableau de bord</h1>
        <p className="max-w-2xl text-slate-600">
          Importez un export Excel ou CSV. Les données identifiantes sont pseudonymisées avant que l&apos;IA ne conçoive le dashboard ;
          chaque chiffre est ensuite recalculé sur vos données et affiché en clair.
        </p>
        <p className="max-w-2xl rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Prototype : utilisez uniquement des données fictives. Le traitement IA n&apos;est pas encore hébergé en Union européenne.
        </p>
      </header>
      <Studio />
    </main>
  );
}
