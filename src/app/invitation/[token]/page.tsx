import Link from "next/link";
import { ROLE_LABEL, type Role } from "@/lib/auth/session";
import { isSecretTokenFormat } from "@/lib/share";
import { createClient } from "@/lib/supabase/server";
import { acceptInvitation } from "./actions";

interface InvitationInfo {
  organization: string;
  role: Role;
  email: string;
  expires_at: string;
}

// Page d'invitation : la personne doit être connectée (le proxy renvoie vers la connexion puis ici).
export default async function InvitationPage({ params, searchParams }: PageProps<"/invitation/[token]">) {
  const { token } = await params;
  const { erreur } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data } = isSecretTokenFormat(token) ? await supabase.rpc("invitation_info", { invite_token: token }) : { data: null };
  const info = data as InvitationInfo | null;

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-20">
      <p className="text-xs font-semibold uppercase tracking-widest text-teal-800">Dashboards IA</p>
      {!info ? (
        <>
          <h1 className="text-2xl font-semibold text-slate-900">Invitation indisponible</h1>
          <p className="text-slate-600">Cette invitation n&apos;existe pas, a expiré ou a été révoquée. Demandez une nouvelle invitation à l&apos;administrateur.</p>
        </>
      ) : user?.email?.toLowerCase() !== info.email ? (
        <>
          <h1 className="text-2xl font-semibold text-slate-900">Invitation pour {info.email}</h1>
          <p className="text-slate-600">
            Vous êtes connecté avec {user?.email}. Déconnectez-vous puis connectez-vous, ou créez votre compte, avec l&apos;adresse {info.email} pour
            rejoindre {info.organization}.
          </p>
          <Link href="/connexion" className="text-teal-800 underline">
            Changer de compte
          </Link>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold text-slate-900">Rejoindre {info.organization}</h1>
          <p className="text-slate-600">
            Vous êtes invité en tant que <strong>{ROLE_LABEL[info.role]}</strong>. Vous verrez les dashboards de cette organisation, en plus des vôtres.
          </p>
          {erreur && (
            <p role="alert" className="text-sm text-red-800">
              L&apos;invitation n&apos;a pas pu être acceptée. Elle a peut-être expiré.
            </p>
          )}
          <form action={acceptInvitation}>
            <input type="hidden" name="token" value={token} />
            <button type="submit" className="rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900">
              Accepter l&apos;invitation
            </button>
          </form>
        </>
      )}
    </main>
  );
}
