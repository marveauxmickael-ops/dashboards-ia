"use client";

import { useState } from "react";
import { changeRole, inviteMember, removeMember, revokeInvitation } from "@/app/organisation/actions";
import type { Role } from "@/lib/auth/session";

const ROLE_LABEL: Record<Role, string> = { owner: "Propriétaire", admin: "Administrateur", editor: "Éditeur", viewer: "Lecteur" };
const ROLE_HINT: Record<Role, string> = {
  owner: "tous les droits, dont la gestion des propriétaires",
  admin: "membres, invitations, charte graphique, journal",
  editor: "crée, actualise, partage et supprime des dashboards",
  viewer: "consulte et télécharge les dashboards",
};
const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "Europe/Paris" });

export interface Member {
  user_id: string;
  email: string;
  role: Role;
  joined_at: string;
}
export interface PendingInvitation {
  id: string;
  email: string;
  role: Role;
  expires_at: string;
}

export function MembersPanel({
  members,
  invitations,
  currentUserId,
  currentRole,
}: {
  members: Member[];
  invitations: PendingInvitation[];
  currentUserId: string;
  currentRole: Role;
}) {
  const manager = currentRole === "owner" || currentRole === "admin";
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<{ ok: true; token?: string } | { ok: false; message: string }>, success?: string) {
    setBusy(true);
    setMessage(null);
    const outcome = await action();
    setBusy(false);
    if (!outcome.ok) return setMessage({ tone: "error", text: outcome.message });
    if (outcome.token) setLink(`${window.location.origin}/invitation/${outcome.token}`);
    if (success) setMessage({ tone: "success", text: success });
  }

  // Un administrateur ne gère pas les propriétaires ; seul un propriétaire attribue ce rôle.
  const assignable = (target: Role): Role[] => (currentRole === "owner" ? ["owner", "admin", "editor", "viewer"] : target === "owner" ? [] : ["admin", "editor", "viewer"]);

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold text-slate-900">Membres ({members.length})</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="py-1.5 pr-3 font-medium">Adresse</th>
                <th className="py-1.5 pr-3 font-medium">Rôle</th>
                <th className="py-1.5 pr-3 font-medium">Membre depuis</th>
                <th className="py-1.5 font-medium" />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const options = assignable(m.role);
                const self = m.user_id === currentUserId;
                return (
                  <tr key={m.user_id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3 text-slate-800">
                      {m.email}
                      {self && <span className="ml-2 text-xs text-slate-500">(vous)</span>}
                    </td>
                    <td className="py-2 pr-3">
                      {manager && options.length > 0 && !self ? (
                        <select
                          value={m.role}
                          disabled={busy}
                          onChange={(e) => void run(() => changeRole(m.user_id, e.target.value as Role), "Rôle modifié.")}
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                          aria-label={`Rôle de ${m.email}`}
                        >
                          {options.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABEL[r]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-slate-700">{ROLE_LABEL[m.role]}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-slate-600">{dateFormat.format(new Date(m.joined_at))}</td>
                    <td className="py-2 text-right">
                      {(self || (manager && options.length > 0)) && (
                        <button
                          type="button"
                          disabled={busy}
                          className="text-xs text-red-800 underline disabled:opacity-50"
                          onClick={() => {
                            const question = self ? "Quitter cette organisation ? Vous n'aurez plus accès à ses dashboards." : `Retirer ${m.email} de l'organisation ?`;
                            if (window.confirm(question)) void run(() => removeMember(m.user_id), "Membre retiré.");
                          }}
                        >
                          {self ? "Quitter" : "Retirer"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <ul className="mt-4 grid grid-cols-1 gap-1 text-xs text-slate-600 sm:grid-cols-2">
          {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
            <li key={r}>
              <strong className="font-medium text-slate-800">{ROLE_LABEL[r]}</strong> : {ROLE_HINT[r]}
            </li>
          ))}
        </ul>
      </section>

      {manager && (
        <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold text-slate-900">Inviter un membre</h2>
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => inviteMember(email, role), "Invitation créée.").then(() => setEmail(""));
            }}
          >
            <label className="flex flex-1 flex-col gap-1 text-sm text-slate-700">
              Adresse email
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-1.5" />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              Rôle
              <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5">
                {(["admin", "editor", "viewer"] as Role[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={busy} className="rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-50">
              Créer l&apos;invitation
            </button>
          </form>
          {link && (
            <div className="flex flex-col gap-1 rounded-lg bg-teal-50 p-2 text-sm">
              <span className="text-xs text-teal-900">
                Envoyez ce lien à la personne invitée (valable 7 jours). Il ne sera plus affiché. Elle se connecte, ou crée son compte, avec l&apos;adresse
                invitée puis ouvre le lien.
              </span>
              <input readOnly value={link} onFocus={(e) => e.target.select()} className="rounded border border-teal-200 bg-white px-2 py-1 font-mono text-xs" />
            </div>
          )}
          {invitations.length > 0 && (
            <div>
              <h3 className="mt-2 text-sm font-semibold text-slate-800">Invitations en attente</h3>
              <ul className="mt-1 flex flex-col gap-1 text-sm">
                {invitations.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-2 text-slate-700">
                    {i.email} · {ROLE_LABEL[i.role]} · expire le {dateFormat.format(new Date(i.expires_at))}
                    <button type="button" disabled={busy} className="text-xs text-red-800 underline" onClick={() => void run(() => revokeInvitation(i.id), "Invitation révoquée.")}>
                      Révoquer
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} className={message.tone === "error" ? "text-sm text-red-800" : "text-sm text-emerald-800"}>
          {message.text}
        </p>
      )}
    </div>
  );
}
