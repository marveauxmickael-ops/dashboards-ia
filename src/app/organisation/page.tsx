import { AppHeader } from "@/components/app-header";
import { SettingsShell } from "@/components/settings-shell";
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
      <SettingsShell workspace={workspace}>
        <header>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Membres et invitations</h2>
          <p className="mt-1 text-slate-600">Membres, rôles et invitations de {organization.name}.</p>
        </header>
        <MembersPanel
          members={(members ?? []) as Member[]}
          invitations={(invitations ?? []) as PendingInvitation[]}
          currentUserId={user.id}
          currentRole={role}
        />
      </SettingsShell>
    </>
  );
}
