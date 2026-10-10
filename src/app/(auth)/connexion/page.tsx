import Link from "next/link";
import { AuthForm, AuthShell, Field } from "@/components/auth-form";
import { safeNextPath } from "@/lib/auth/redirect";
import { login } from "../actions";

export const metadata = { title: "Connexion — Dashboards IA" };

export default async function LoginPage({ searchParams }: PageProps<"/connexion">) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : undefined);
  const linkError = params.erreur === "lien";
  return (
    <AuthShell
      title="Connexion"
      subtitle="Retrouvez vos tableaux de bord."
      footer={
        <>
          Pas encore de compte ?{" "}
          <Link href="/inscription" className="font-medium text-teal-800 underline">
            Créer un compte
          </Link>
        </>
      }
    >
      {linkError && (
        <p role="alert" className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Ce lien est invalide ou a expiré. Connectez-vous ou demandez un nouveau lien.
        </p>
      )}
      <AuthForm action={login} submitLabel="Se connecter">
        <input type="hidden" name="next" value={next} />
        <Field id="email" label="Email" type="email" autoComplete="email" required />
        <Field id="password" label="Mot de passe" type="password" autoComplete="current-password" required />
        <Link href="/mot-de-passe-oublie" className="-mt-2 text-sm text-teal-800 underline">
          Mot de passe oublié ?
        </Link>
      </AuthForm>
    </AuthShell>
  );
}
