import { AuthForm, AuthShell, Field } from "@/components/auth-form";
import { updatePassword } from "../(auth)/actions";

export const metadata = { title: "Nouveau mot de passe — Lisio" };

// Accessible uniquement avec la session ouverte par le lien de réinitialisation.
export default function ResetPasswordPage() {
  return (
    <AuthShell title="Nouveau mot de passe" subtitle="Vos autres sessions seront fermées après le changement.">
      <AuthForm action={updatePassword} submitLabel="Enregistrer le mot de passe">
        <Field id="password" label="Nouveau mot de passe" type="password" autoComplete="new-password" minLength={12} maxLength={128} hint="12 caractères minimum." required />
        <Field id="confirmation" label="Confirmez le mot de passe" type="password" autoComplete="new-password" minLength={12} maxLength={128} required />
      </AuthForm>
    </AuthShell>
  );
}
