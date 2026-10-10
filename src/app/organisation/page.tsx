import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { MembersPanel, type Member, type PendingInvitation } from "@/components/members-panel";
import { canManage, requireWorkspace } from "@/lib/auth/session";

export default async function OrganizationPage() {
  const workspace = await requireWorkspace();
  const { supabase, organization, user, role } = workspace;
  const { data: members } = await supabase.rpc("organization_members", { org: organization.id });
  const { data: invitations } = canManage(role)
    ? await supabase
        .from("invitations")
        .select("id, email, role, expires_at")
        .eq("organization_id", organization.id)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
    : { data: [] };

  return (
    <>
      <AppHeader workspace={workspace} />
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{organization.name}</h1>
            <p className="mt-1 text-slate-600">Membres, rôles et invitations de l&apos;organisation.</p>
          </div>
          {canManage(role) && (
            <div className="flex gap-3 text-sm">
              <Link href="/organisation/charte" className="text-teal-800 underline">
                Charte graphique
              </Link>
              <Link href="/organisation/journal" className="text-teal-800 underline">
                Journal d&apos;audit
              </Link>
            </div>
          )}
        </header>
        <MembersPanel
          members={(members ?? []) as Member[]}
          invitations={(invitations ?? []) as PendingInvitation[]}
          currentUserId={user.id}
          currentRole={role}
        />
      </main>
    </>
  );
}
