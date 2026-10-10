import { AppHeader } from "@/components/app-header";
import { MfaSettings } from "@/components/mfa-settings";
import { requireWorkspace } from "@/lib/auth/session";

export default async function SecurityPage() {
  const workspace = await requireWorkspace();
  const { data: factors } = await workspace.supabase.auth.mfa.listFactors();
  const enabled = (factors?.totp ?? []).some((f) => f.status === "verified");
  return (
    <>
      <AppHeader workspace={workspace} />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Sécurité du compte</h1>
          <p className="mt-1 text-slate-600">{workspace.user.email}</p>
        </header>
        <MfaSettings enabled={enabled} />
      </main>
    </>
  );
}
