import { redirect } from "next/navigation";
import { AuthForm, AuthShell, Field } from "@/components/auth-form";
import { needsSecondFactor } from "@/lib/auth/mfa";
import { safeNextPath } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";
import { logout, verifySecondFactor } from "../../actions";

export const metadata = { title: "Vérification — Dashboards IA" };

export default async function SecondFactorPage({ searchParams }: PageProps<"/connexion/verification">) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : undefined);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  if (!(await needsSecondFactor(supabase))) redirect(next);

  return (
    <AuthShell
      title="Double authentification"
      subtitle="Saisissez le code à 6 chiffres affiché par votre application d'authentification."
      footer={
        <form action={logout}>
          <button type="submit" className="text-teal-800 underline">
            Se connecter avec un autre compte
          </button>
        </form>
      }
    >
      <AuthForm action={verifySecondFactor} submitLabel="Vérifier">
        <input type="hidden" name="next" value={next} />
        <Field id="code" label="Code" type="text" autoComplete="one-time-code" required />
      </AuthForm>
    </AuthShell>
  );
}
