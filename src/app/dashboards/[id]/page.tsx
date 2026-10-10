import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { DashboardView } from "@/components/dashboard-view";
import { PrivacyPanel } from "@/components/privacy-panel";
import { canEdit, requireWorkspace } from "@/lib/auth/session";
import type { DashboardResult } from "@/lib/pipeline";
import { deleteDashboard } from "../actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" });

export default async function DashboardPage({ params }: PageProps<"/dashboards/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { supabase, organization, user, role } = await requireWorkspace();

  // Un dashboard d'une autre organisation est invisible (RLS) : il renvoie ici une page introuvable.
  const { data: dashboard } = await supabase.from("dashboards").select("id, result, created_at").eq("id", id).maybeSingle();
  if (!dashboard) notFound();
  const result = dashboard.result as unknown as DashboardResult;

  return (
    <>
      <AppHeader organization={organization.name} email={user.email} />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <Link href="/dashboards" className="text-teal-800 underline">
            ← Mes dashboards
          </Link>
          <div className="flex items-center gap-3">
            <span>Créé le {dateFormat.format(new Date(dashboard.created_at))}</span>
            {canEdit(role) && (
              <form action={deleteDashboard}>
                <input type="hidden" name="id" value={dashboard.id} />
                <button type="submit" className="rounded-lg border border-red-200 px-3 py-1.5 text-red-800 hover:bg-red-50">
                  Supprimer
                </button>
              </form>
            )}
          </div>
        </div>
        <DashboardView result={result} />
        <PrivacyPanel result={result} />
      </main>
    </>
  );
}
