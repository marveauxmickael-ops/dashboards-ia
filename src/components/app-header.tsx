import Link from "next/link";
import { logout } from "@/app/(auth)/actions";
import { switchOrganization } from "@/app/organisation/actions";
import { canManage, ROLE_LABEL, type Workspace } from "@/lib/auth/session";

export function AppHeader({ workspace }: { workspace: Pick<Workspace, "organization" | "user" | "role" | "organizations"> }) {
  const { organization, user, role, organizations } = workspace;
  return (
    <header className="border-b border-slate-200 bg-white print:hidden">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link href="/" className="text-sm font-semibold text-teal-800">
            Dashboards IA
          </Link>
          <nav className="flex flex-wrap gap-4 text-sm text-slate-700">
            <Link href="/" className="hover:text-teal-800">
              Nouveau dashboard
            </Link>
            <Link href="/dashboards" className="hover:text-teal-800">
              Mes dashboards
            </Link>
            <Link href="/organisation" className="hover:text-teal-800">
              Organisation
            </Link>
            {canManage(role) && (
              <Link href="/organisation/charte" className="hover:text-teal-800">
                Charte graphique
              </Link>
            )}
          </nav>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
          {organizations.length > 1 ? (
            <form action={switchOrganization} className="flex items-center gap-1">
              <label htmlFor="organisation-active" className="sr-only">
                Organisation active
              </label>
              <select id="organisation-active" name="organization" defaultValue={organization.id} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm">
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} ({ROLE_LABEL[o.role]})
                  </option>
                ))}
              </select>
              <button type="submit" className="rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
                Changer
              </button>
            </form>
          ) : (
            <span className="hidden sm:inline">{organization.name}</span>
          )}
          <Link href="/compte/securite" className="hidden hover:text-teal-800 md:inline" title="Sécurité du compte">
            {user.email}
          </Link>
          <form action={logout}>
            <button type="submit" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-50">
              Se déconnecter
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
