import { AppHeader } from "@/components/app-header";
import { SettingsShell } from "@/components/settings-shell";
import { MfaSettings } from "@/components/mfa-settings";
import { requireWorkspace } from "@/lib/auth/session";

export default async function SecurityPage() {
  const workspace = await requireWorkspace();
  const { data: factors } = await workspace.supabase.auth.mfa.listFactors();
  const enabled = (factors?.totp ?? []).some((f) => f.status === "verified");
  return (
    <>
      <AppHeader workspace={workspace} />
      <SettingsShell workspace={workspace}>
        <header>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Sécurité et double authentification</h2>
          <p className="mt-1 text-slate-600">{workspace.user.email}</p>
        </header>
        <MfaSettings enabled={enabled} />
      </SettingsShell>
    </>
  );
}
