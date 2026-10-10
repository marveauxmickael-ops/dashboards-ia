import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { AUDIT_LABEL } from "@/lib/audit";
import { canManage, requireWorkspace } from "@/lib/auth/session";

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "medium", timeZone: "Europe/Paris" });

function detailsText(details: unknown): string {
  if (!details || typeof details !== "object") return "";
  return Object.entries(details as Record<string, unknown>)
    .map(([k, v]) => `${k} : ${Array.isArray(v) ? v.join(", ") : String(v)}`)
    .join(" · ");
}

// Journal d'audit (propriétaire et administrateurs) : 300 derniers événements, en lecture seule.
export default async function AuditPage({ searchParams }: PageProps<"/organisation/journal">) {
  const workspace = await requireWorkspace();
  if (!canManage(workspace.role)) redirect("/organisation");
  const { action } = await searchParams;
  let query = workspace.supabase
    .from("audit_log")
    .select("id, created_at, user_email, action, target_type, target_id, details")
    .eq("organization_id", workspace.organization.id)
    .order("created_at", { ascending: false })
    .limit(300);
  if (typeof action === "string" && action in AUDIT_LABEL) query = query.eq("action", action);
  const { data: events } = await query;

  return (
    <>
      <AppHeader workspace={workspace} />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Journal d&apos;audit</h1>
          <p className="mt-1 max-w-2xl text-slate-600">
            Qui a fait quoi et quand dans {workspace.organization.name}. Le journal ne contient aucune donnée des fichiers et ne peut être ni modifié ni
            effacé depuis l&apos;application.
          </p>
        </header>
        <form className="flex flex-wrap items-end gap-2 text-sm">
          <label className="flex flex-col gap-1 text-slate-700">
            Type d&apos;événement
            <select name="action" defaultValue={typeof action === "string" ? action : ""} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5">
              <option value="">Tous</option>
              {Object.entries(AUDIT_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-50">
            Filtrer
          </button>
        </form>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Utilisateur</th>
                <th className="px-3 py-2 font-medium">Événement</th>
                <th className="px-3 py-2 font-medium">Détails</th>
              </tr>
            </thead>
            <tbody>
              {(events ?? []).map((e) => (
                <tr key={e.id} className="border-b border-slate-100 align-top last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600">{dateFormat.format(new Date(e.created_at))}</td>
                  <td className="px-3 py-2 text-slate-800">{e.user_email ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-800">{AUDIT_LABEL[e.action] ?? e.action}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{detailsText(e.details)}</td>
                </tr>
              ))}
              {(events ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                    Aucun événement.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
