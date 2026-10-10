import Link from "next/link";
import { AuthForm, AuthShell, Field } from "@/components/auth-form";
import { requestPasswordReset } from "../actions";

export const metadata = { title: "Mot de passe oublié — Dashboards IA" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Mot de passe oublié"
      subtitle="Recevez un lien pour choisir un nouveau mot de passe."
      footer={
        <Link href="/connexion" className="font-medium text-teal-800 underline">
          Retour à la connexion
        </Link>
      }
    >
      <AuthForm action={requestPasswordReset} submitLabel="Envoyer le lien">
        <Field id="email" label="Email" type="email" autoComplete="email" required />
      </AuthForm>
    </AuthShell>
  );
}
