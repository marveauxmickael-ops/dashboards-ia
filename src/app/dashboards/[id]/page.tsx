import Link from "next/link";
import { RenameDashboard } from "@/components/rename-dashboard";
import { withTitle } from "@/lib/dashboards/title";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { activeProvider } from "@/lib/ai/gateway";
import { DashboardWorkspace } from "@/components/dashboard-workspace";
import { PrivacyPanel } from "@/components/privacy-panel";
import { CleaningNotice } from "@/components/quality-panel";
import { SharePanel } from "@/components/share-panel";
import { VersionComparison, VersionHistory } from "@/components/version-history";
import { canEdit, requireWorkspace } from "@/lib/auth/session";
import type { DashboardResult } from "@/lib/pipeline";
import { parseView } from "@/lib/view";
import { deleteDashboard, saveDashboardView } from "../actions";
import type { ShareState } from "./share-actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Tab = "dashboard" | "partage" | "historique" | "donnees";
const TABS: Tab[] = ["dashboard", "partage", "historique", "donnees"];

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" });

export default async function DashboardPage({ params, searchParams }: PageProps<"/dashboards/[id]">) {
  const { id } = await params;
  const { version, onglet } = await searchParams;
  const versionId = typeof version === "string" && UUID.test(version) ? version : null;
  if (!UUID.test(id)) notFound();
  const workspace = await requireWorkspace();
  const { supabase, organization, role } = workspace;

  // Un dashboard d'une autre organisation est invisible (RLS) : il renvoie ici une page introuvable.
  const { data: dashboard } = await supabase.from("dashboards").select("id, title, result, display, created_at, updated_at, ai_mode").eq("id", id).maybeSingle();
  if (!dashboard) notFound();
  const result = withTitle(dashboard.result as unknown as DashboardResult, dashboard.title);
  // Affichage choisi par les éditeurs : les lecteurs le voient tel quel, comme le lien de partage.
  const display = parseView(dashboard.display);
  const saveView = saveDashboardView.bind(null, dashboard.id);
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
  const selectedResult = selected ? withTitle(selected.result as unknown as DashboardResult, dashboard.title) : null;
  const { data: share } = await supabase
    .from("dashboard_shares")
    .select("id, access, enabled, created_at")
    .eq("dashboard_id", id)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Onglets : Dashboard, Partage (éditeurs), Historique, Données et confidentialité. Une version consultée s'ouvre sur le dashboard.
  const tabs: { id: Tab; label: string }[] = [
    { id: "dashboard", label: "Dashboard" },
    ...(canEdit(role) ? [{ id: "partage" as const, label: share?.enabled ? "Partage · actif" : "Partage" }] : []),
    { id: "historique", label: `Historique (${versions?.length ?? 0})` },
    { id: "donnees", label: "Données et confidentialité" },
  ];
  const requested = TABS.find((t) => t === onglet && tabs.some((x) => x.id === t));
  const tab: Tab = selected ? "dashboard" : (requested ?? "dashboard");
  const tabHref = (t: Tab) => (t === "dashboard" ? `/dashboards/${dashboard.id}` : `/dashboards/${dashboard.id}?onglet=${t}`);

  return (
    <>
      <AppHeader workspace={workspace} />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
        <div className="flex flex-col gap-3 print:hidden">
          <Link href="/dashboards" className="self-start text-sm text-brand-800 underline">
            ← Mes dashboards
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <h1 className="text-2xl font-bold tracking-tight text-brand-800 sm:text-3xl">{dashboard.title}</h1>
              <p className="text-sm text-slate-600">
                {result.fileName} · <strong className="font-medium text-slate-800">dernière actualisation réussie</strong> le {dateFormat.format(refreshedAt)} · créé le{" "}
                {dateFormat.format(new Date(dashboard.created_at))}
              </p>
            </div>
            {canEdit(role) && (
              <div className="flex flex-wrap items-start gap-2">
                <RenameDashboard id={dashboard.id} title={dashboard.title} />
                <details className="relative">
                  <summary
                    aria-label="Plus d'actions"
                    className="flex cursor-pointer list-none items-center rounded-lg border border-slate-300 px-3 py-2 text-slate-700 hover:bg-slate-50 [&::-webkit-details-marker]:hidden"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
                      <circle cx="5" cy="12" r="2" />
                      <circle cx="12" cy="12" r="2" />
                      <circle cx="19" cy="12" r="2" />
                    </svg>
                  </summary>
                  <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 text-sm shadow-lg">
                    <form action={deleteDashboard}>
                      <input type="hidden" name="id" value={dashboard.id} />
                      <button type="submit" className="w-full rounded-lg px-2.5 py-2 text-left text-red-800 hover:bg-red-50">
                        Supprimer le dashboard
                      </button>
                    </form>
                  </div>
                </details>
              </div>
            )}
          </div>
          <nav aria-label="Onglets du dashboard" className="flex gap-1 overflow-x-auto border-b border-slate-200">
            {tabs.map((t) => (
              <Link
                key={t.id}
                href={tabHref(t.id)}
                aria-current={t.id === tab ? "page" : undefined}
                className={`-mb-px whitespace-nowrap border-b-[3px] px-4 py-3 text-sm ${t.id === tab ? "border-accent-500 font-semibold text-brand-800" : "border-transparent text-slate-600 hover:text-brand-800"}`}
              >
                {t.label}
              </Link>
            ))}
          </nav>
        </div>
        <p className="hidden text-xs text-slate-500 print:block">
          {organization.name} · créé le {dateFormat.format(new Date(dashboard.created_at))} · actualisé le {dateFormat.format(refreshedAt)} · exporté le {dateFormat.format(new Date())}. Chaque
          valeur est calculée sur les données du fichier source ; l&apos;IA n&apos;a reçu que des données pseudonymisées.
        </p>
        {tab === "dashboard" &&
          (selected && selectedResult ? (
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
            <DashboardWorkspace
              initial={result}
              dashboardId={dashboard.id}
              canReimport={canEdit(role)}
              reloadAfterReimport
              branding={organization.branding}
              aiAvailable={activeProvider() !== "demo" && dashboard.ai_mode !== "strict"}
              {...(canEdit(role) ? { savedView: display, saveView } : { fixedView: display })}
            />
          ))}
        {tab === "partage" && <SharePanel dashboardId={dashboard.id} initial={share ? (share as ShareState) : null} />}
        {tab === "historique" && <VersionHistory dashboardId={dashboard.id} versions={versions ?? []} selectedId={null} />}
        {tab === "donnees" && (
          <>
            <CleaningNotice cleaning={result.cleaning} />
            <PrivacyPanel result={result} />
          </>
        )}
      </main>
    </>
  );
}
