import { getWorkspace } from "@/lib/auth/session";
import { combineDatasets, CombineError, MAX_FILES } from "@/lib/combine";
import { ImportError, MAX_FILE_BYTES, parseFile } from "@/lib/ingest/parse";
import { cleanedCsv } from "@/lib/quality";

export const maxDuration = 60;

// Dépôt de plusieurs fichiers (US-16) : lecture, regroupement par le moteur (sans IA) et renvoi d'un seul fichier CSV
// avec le récapitulatif. Les fichiers sont lus en mémoire puis oubliés : rien n'est conservé.
export async function POST(request: Request) {
  const workspace = await getWorkspace();
  if (!workspace) return Response.json({ error: "Votre session a expiré. Reconnectez-vous." }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Requête invalide : envoyez les fichiers dans un formulaire." }, { status: 400 });
  }
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return Response.json({ error: "Aucun fichier reçu." }, { status: 400 });
  if (files.length > MAX_FILES) return Response.json({ error: `Déposez au plus ${MAX_FILES} fichiers à la fois.` }, { status: 400 });
  const tooBig = files.find((f) => f.size > MAX_FILE_BYTES);
  if (tooBig) return Response.json({ error: `« ${tooBig.name} » dépasse 20 Mo.` }, { status: 413 });

  try {
    const datasets = [];
    for (const file of files) {
      try {
        datasets.push(await parseFile(file.name, await file.arrayBuffer()));
      } catch (error) {
        if (error instanceof ImportError) throw new ImportError(`« ${file.name} » : ${error.message}`);
        throw error;
      }
    }
    const { dataset, summary } = combineDatasets(datasets);
    return Response.json({ summary, fileName: dataset.fileName, csv: cleanedCsv(dataset) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ImportError || error instanceof CombineError) return Response.json({ error: error.message }, { status: 400 });
    console.error("Regroupement de fichiers en échec", error instanceof Error ? error.message : error);
    return Response.json({ error: "Les fichiers n'ont pas pu être regroupés. Réessayez." }, { status: 500 });
  }
}
