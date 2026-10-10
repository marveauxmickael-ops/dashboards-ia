import Link from "next/link";
import { logout } from "@/app/(auth)/actions";

export function AppHeader({ organization, email }: { organization: string; email: string }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link href="/" className="text-sm font-semibold text-teal-800">
            Dashboards IA
          </Link>
          <nav className="flex gap-4 text-sm text-slate-700">
            <Link href="/" className="hover:text-teal-800">
              Nouveau dashboard
            </Link>
            <Link href="/dashboards" className="hover:text-teal-800">
              Mes dashboards
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <span className="hidden sm:inline">
            {organization} · {email}
          </span>
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
