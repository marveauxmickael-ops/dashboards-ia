import Link from "next/link";
import { logout } from "@/app/(auth)/actions";
import { switchOrganization } from "@/app/organisation/actions";
import { ROLE_LABEL, type Workspace } from "@/lib/auth/session";
import { LisioLogo } from "./lisio-logo";
import { NavTabs } from "./nav-tabs";

/** Chemins regroupés sous l'onglet « Paramètres ». */
export const SETTINGS_PATHS = ["/organisation", "/compte"];

export function AppHeader({ workspace }: { workspace: Pick<Workspace, "organization" | "user" | "role" | "organizations"> }) {
  const { organization, user, organizations } = workspace;
  return (
    <header className="border-b border-slate-200 bg-white print:hidden">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4">
        <div className="flex min-w-0 flex-wrap items-center gap-x-6">
          <Link href="/" className="py-3" aria-label="Lisio, nouveau dashboard">
            <LisioLogo />
          </Link>
          <NavTabs
            label="Navigation principale"
            tabs={[
              { href: "/", label: "Nouveau dashboard", match: ["/"], exact: true },
              { href: "/dashboards", label: "Mes dashboards", match: ["/dashboards"] },
              { href: "/organisation", label: "Paramètres", match: SETTINGS_PATHS },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 py-2 text-sm text-slate-600">
          {organizations.length > 1 ? (
            <form action={switchOrganization} className="flex items-center gap-1">
              <label htmlFor="organisation-active" className="sr-only">
                Organisation active
              </label>
              <select id="organisation-active" name="organization" defaultValue={organization.id} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm">
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} ({ROLE_LABEL[o.role]})
                  </option>
                ))}
              </select>
              <button type="submit" className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs hover:bg-slate-50">
                Changer
              </button>
            </form>
          ) : (
            <span className="hidden sm:inline">{organization.name}</span>
          )}
          <details className="relative">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-slate-300 py-1 pl-1 pr-3 text-slate-800 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
              <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-brand-800 text-xs font-bold uppercase text-white">
                {(user.email ?? "?").slice(0, 2)}
              </span>
              Compte
            </summary>
            <div className="absolute right-0 z-20 mt-2 flex w-64 flex-col rounded-xl border border-slate-200 bg-white p-2 text-sm shadow-lg">
              <span className="truncate px-2.5 py-2 text-xs text-slate-500">{user.email}</span>
              <Link href="/compte/securite" className="rounded-lg px-2.5 py-2 text-slate-800 hover:bg-slate-50">
                Sécurité et double authentification
              </Link>
              <form action={logout} className="border-t border-slate-100 pt-1">
                <button type="submit" className="w-full rounded-lg px-2.5 py-2 text-left text-red-800 hover:bg-red-50">
                  Se déconnecter
                </button>
              </form>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
