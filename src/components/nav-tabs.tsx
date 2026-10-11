"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavTab = { href: string; label: string; /** Chemins qui rendent l'onglet actif (préfixes). */ match: string[]; exact?: boolean };

function isActive(pathname: string, tab: NavTab): boolean {
  return tab.match.some((m) => (tab.exact ? pathname === m : pathname === m || pathname.startsWith(`${m}/`)));
}

/** Onglets du menu principal : l'onglet de la page courante est souligné (cuivre). */
export function NavTabs({ tabs, label }: { tabs: NavTab[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="-mb-px flex gap-1 overflow-x-auto">
      {tabs.map((tab) => {
        const active = isActive(pathname, tab);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap border-b-[3px] px-3 py-4 text-sm ${active ? "border-accent-500 font-semibold text-brand-800" : "border-transparent text-slate-600 hover:text-brand-800"}`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Menu latéral des Paramètres : la rubrique courante est mise en évidence. */
export function SideTabs({ groups, label }: { groups: { title: string; tabs: NavTab[] }[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="flex flex-col gap-0.5 rounded-xl border border-slate-200 bg-white p-2 text-sm">
      {groups.map((group) => (
        <div key={group.title} className="flex flex-col gap-0.5">
          <span className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-slate-500">{group.title}</span>
          {group.tabs.map((tab) => {
            const active = isActive(pathname, tab);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-lg px-3 py-2.5 ${active ? "bg-brand-50 font-semibold text-brand-800 shadow-[inset_3px_0_0_var(--color-accent-500)]" : "text-slate-800 hover:bg-slate-50"}`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
