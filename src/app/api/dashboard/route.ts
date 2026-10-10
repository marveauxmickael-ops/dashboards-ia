import { AiError } from "@/lib/ai/gateway";
import { ImportError, MAX_FILE_BYTES } from "@/lib/ingest/parse";
import { generateDashboard } from "@/lib/pipeline";

// La région d'exécution (Paris) est fixée pour tout le projet dans vercel.json.
export const maxDuration = 120;

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Requête invalide : envoyez le fichier dans un formulaire." }, { status: 400 });
  }

  const file = form.get("file");
  const mode = form.get("mode") === "strict" ? "strict" : "standard";
  if (!(file instanceof File)) return Response.json({ error: "Aucun fichier reçu." }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) return Response.json({ error: "Le fichier dépasse 20 Mo." }, { status: 413 });

  try {
    const result = await generateDashboard({
      fileName: file.name,
      data: await file.arrayBuffer(),
      mode,
      // Prototype sans authentification : une organisation unique. Remplacé par l'organisation de la session (Supabase).
      organizationId: "prototype",
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof ImportError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof AiError) return Response.json({ error: error.message }, { status: 502 });
    console.error("Génération du dashboard en échec", error instanceof Error ? error.message : error);
    return Response.json({ error: "Une erreur inattendue est survenue. Réessayez." }, { status: 500 });
  }
}
