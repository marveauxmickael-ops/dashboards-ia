import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { DashboardWorkspace } from "@/components/dashboard-workspace";
import { PrivacyPanel } from "@/components/privacy-panel";
import { SharePanel } from "@/components/share-panel";
import { VersionComparison, VersionHistory } from "@/components/version-history";
import { canEdit, requireWorkspace } from "@/lib/auth/session";
import type { DashboardResult } from "@/lib/pipeline";
import { deleteDashboard } from "../actions";
import type { ShareState } from "./share-actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" });

export default async function DashboardPage({ params, searchParams }: PageProps<"/dashboards/[id]">) {
  const { id } = await params;
  const { version } = await searchParams;
  const versionId = typeof version === "string" && UUID.test(version) ? version : null;
  if (!UUID.test(id)) notFound();
  const workspace = await requireWorkspace();
  const { supabase, organization, role } = workspace;

  // Un dashboard d'une autre organisation est invisible (RLS) : il renvoie ici une page introuvable.
  const { data: dashboard } = await supabase.from("dashboards").select("id, result, created_at, updated_at").eq("id", id).maybeSingle();
  if (!dashboard) notFound();
  const result = dashboard.result as unknown as DashboardResult;
  const refreshedAt = new Date(dashboard.updated_at ?? dashboard.created_at);

  const { data: versions } = await supabase
    .from("dashboard_versions")
    .select("id, file_name, row_count, period_start, period_end, created_at")
    .eq("dashboard_id", id)
    .order("created_at", { ascending: false })
    .limit(24);
  // Version précédente consultée (lecture seule), comparée à la version actuelle.
  const { data: selected } = versionId
    ? await supabase.from("dashboard_versions").select("id, result, created_at").eq("id", versionId).eq("dashboard_id", id).maybeSingle()
    : { data: null };
  const selectedResult = selected ? (selected.result as unknown as DashboardResult) : null;
  const { data: share } = await supabase
    .from("dashboard_shares")
    .select("id, access, enabled, created_at")
    .eq("dashboard_id", id)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <>
      <AppHeader workspace={workspace} />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600 print:hidden">
          <Link href="/dashboards" className="text-teal-800 underline">
            ← Mes dashboards
          </Link>
          <div className="flex items-center gap-3">
            <span>
              Créé le {dateFormat.format(new Date(dashboard.created_at))} · <strong className="font-medium text-slate-800">Dernière actualisation réussie</strong> le{" "}
              {dateFormat.format(refreshedAt)}
            </span>
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
        <p className="hidden text-xs text-slate-500 print:block">
          {organization.name} · créé le {dateFormat.format(new Date(dashboard.created_at))} · actualisé le {dateFormat.format(refreshedAt)} · exporté le {dateFormat.format(new Date())}. Chaque
          valeur est calculée sur les données du fichier source ; l&apos;IA n&apos;a reçu que des données pseudonymisées.
        </p>
        {selected && selectedResult ? (
          <>
            <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Vous consultez la version du {dateFormat.format(new Date(selected.created_at))} (lecture seule).{" "}
              <Link href={`/dashboards/${dashboard.id}`} className="font-medium underline">
                Revenir à la version actuelle
              </Link>
            </p>
            <VersionComparison previous={selectedResult} current={result} />
            <DashboardWorkspace key={selected.id} initial={selectedResult} exportable={false} tools={false} branding={organization.branding} />
          </>
        ) : (
          <DashboardWorkspace initial={result} dashboardId={dashboard.id} canReimport={canEdit(role)} reloadAfterReimport branding={organization.branding} />
        )}
        {canEdit(role) && <SharePanel dashboardId={dashboard.id} initial={share ? (share as ShareState) : null} />}
        <VersionHistory dashboardId={dashboard.id} versions={versions ?? []} selectedId={selected?.id ?? null} />
        <PrivacyPanel result={result} />
      </main>
    </>
  );
}
