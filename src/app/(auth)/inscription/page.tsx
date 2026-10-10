import Link from "next/link";
import { AuthForm, AuthShell, Field } from "@/components/auth-form";
import { signup } from "../actions";

export const metadata = { title: "Créer un compte — Dashboards IA" };

export default function SignupPage() {
  return (
    <AuthShell
      title="Créer un compte"
      subtitle="Une organisation est créée pour vous ; vous pourrez y inviter vos collègues."
      footer={
        <>
          Déjà inscrit ?{" "}
          <Link href="/connexion" className="font-medium text-teal-800 underline">
            Se connecter
          </Link>
        </>
      }
    >
      <AuthForm action={signup} submitLabel="Créer mon compte">
        <Field id="organization" label="Nom de l'organisation" autoComplete="organization" maxLength={120} required />
        <Field id="email" label="Email professionnel" type="email" autoComplete="email" required />
        <Field
          id="password"
          label="Mot de passe"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          hint="12 caractères minimum. Une phrase de passe facile à retenir est idéale."
          required
        />
        <label htmlFor="consent" className="flex items-start gap-2 text-sm text-slate-700">
          <input id="consent" name="consent" type="checkbox" required className="mt-1" />
          <span>J&apos;accepte les conditions d&apos;utilisation et la politique de confidentialité.</span>
        </label>
      </AuthForm>
    </AuthShell>
  );
}
