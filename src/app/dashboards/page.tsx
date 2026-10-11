import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { canEdit, requireWorkspace } from "@/lib/auth/session";
import { RenameDashboard } from "@/components/rename-dashboard";

export const metadata = { title: "Mes dashboards — Lisio" };

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" });

export default async function DashboardsPage() {
  const workspace = await requireWorkspace();
  const { supabase, organization, role } = workspace;
  const editable = canEdit(role);
  const { data: dashboards, error } = await supabase
    .from("dashboards")
    .select("id, title, file_name, row_count, ai_mode, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <>
      <AppHeader workspace={workspace} />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Mes dashboards</h1>
          <Link href="/" className="rounded-lg bg-brand-800 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-900">
            Nouveau dashboard
          </Link>
        </div>
        {error ? (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            La liste n&apos;a pas pu être chargée. Rechargez la page.
          </p>
        ) : !dashboards || dashboards.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
            Aucun dashboard pour l&apos;instant. Importez un fichier pour créer le premier : il sera enregistré ici et visible par les membres de{" "}
            {organization.name}.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2 font-medium">Dashboard</th>
                  <th className="px-4 py-2 font-medium">Fichier source</th>
                  <th className="px-4 py-2 text-right font-medium">Lignes</th>
                  <th className="px-4 py-2 font-medium">Mode IA</th>
                  <th className="px-4 py-2 font-medium">Créé le</th>
                  {editable && <th className="px-4 py-2 font-medium"><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody>
                {dashboards.map((d) => (
                  <tr key={d.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <Link href={`/dashboards/${d.id}`} className="font-medium text-brand-800 underline">
                        {d.title}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-slate-700">{d.file_name}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-700">{d.row_count.toLocaleString("fr-FR")}</td>
                    <td className="px-4 py-2 text-slate-700">{d.ai_mode === "strict" ? "Strict" : "Standard"}</td>
                    <td className="px-4 py-2 text-slate-700">{dateFormat.format(new Date(d.created_at))}</td>
                    {editable && (
                      <td className="px-4 py-2 text-right">
                        <RenameDashboard id={d.id} title={d.title} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
