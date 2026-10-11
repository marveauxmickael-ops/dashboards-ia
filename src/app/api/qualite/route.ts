import { getWorkspace } from "@/lib/auth/session";
import { ImportError, MAX_FILE_BYTES, parseFile } from "@/lib/ingest/parse";
import { analyzeQuality, applyCleaning, cleanedCsv, cleanedFileName, CleaningPlanSchema } from "@/lib/quality";

export const maxDuration = 60;

// Contrôle qualité du fichier (US-11), avant la génération :
// - sans `plan` : rapport (doublons, cellules vides, valeurs incohérentes) et propositions de corrections ;
// - avec `plan` : fichier corrigé en CSV, à télécharger.
// Calculé par le moteur, sans IA. Le fichier est lu en mémoire puis oublié : il n'est jamais conservé.
export async function POST(request: Request) {
  const workspace = await getWorkspace();
  if (!workspace) return Response.json({ error: "Votre session a expiré. Reconnectez-vous." }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Requête invalide : envoyez le fichier dans un formulaire." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Aucun fichier reçu." }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) return Response.json({ error: "Le fichier dépasse 20 Mo." }, { status: 413 });

  const planField = form.get("plan");
  let plan = null;
  if (typeof planField === "string") {
    try {
      const parsed = CleaningPlanSchema.safeParse(JSON.parse(planField));
      if (!parsed.success) return Response.json({ error: "Corrections invalides." }, { status: 400 });
      plan = parsed.data;
    } catch {
      return Response.json({ error: "Corrections invalides." }, { status: 400 });
    }
  }

  try {
    const raw = await parseFile(file.name, await file.arrayBuffer());
    if (!plan) return Response.json({ report: analyzeQuality(raw) });
    const { dataset } = applyCleaning(raw, plan);
    return new Response(cleanedCsv(dataset), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(cleanedFileName(file.name))}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof ImportError) return Response.json({ error: error.message }, { status: 400 });
    console.error("Contrôle qualité en échec", error instanceof Error ? error.message : error);
    return Response.json({ error: "Le fichier n'a pas pu être analysé. Réessayez." }, { status: 500 });
  }
}
