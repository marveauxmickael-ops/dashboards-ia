-- Sprint 4 : journal d'audit, invitations et gestion des rôles (AUTH-05).

-- Journal d'audit : ajout seul (aucune politique de modification ni de suppression), lisible par les gestionnaires.
create table public.audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  user_email text check (char_length(user_email) <= 254),
  action text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  target_type text check (char_length(target_type) <= 40),
  target_id text check (char_length(target_id) <= 80),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object' and pg_column_size(details) < 4000),
  created_at timestamptz not null default now()
);
create index audit_log_organization_idx on public.audit_log (organization_id, created_at desc);
create index audit_log_user_idx on public.audit_log (user_id);

alter table public.audit_log enable row level security;

create policy "Lecture par propriétaire ou admin" on public.audit_log
  for select to authenticated using ((select private.member_role(organization_id)) in ('owner', 'admin'));
create policy "Journalisation par les membres" on public.audit_log
  for insert to authenticated
  with check ((select private.member_role(organization_id)) is not null and user_id = (select auth.uid()));

-- Invitations : seul le hachage du jeton est conservé ; le lien est montré une fois à l'administrateur.
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) between 3 and 254 and position('@' in email) > 1),
  role text not null check (role in ('admin', 'editor', 'viewer')),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz
);
create index invitations_organization_idx on public.invitations (organization_id, created_at desc);
create index invitations_invited_by_idx on public.invitations (invited_by);
create index invitations_accepted_by_idx on public.invitations (accepted_by);

alter table public.invitations enable row level security;

create policy "Lecture par propriétaire ou admin" on public.invitations
  for select to authenticated using ((select private.member_role(organization_id)) in ('owner', 'admin'));
create policy "Invitation par propriétaire ou admin" on public.invitations
  for insert to authenticated
  with check (
    (select private.member_role(organization_id)) in ('owner', 'admin')
    and invited_by = (select auth.uid())
    and accepted_at is null and revoked_at is null
  );
create policy "Révocation par propriétaire ou admin" on public.invitations
  for update to authenticated
  using ((select private.member_role(organization_id)) in ('owner', 'admin') and accepted_at is null)
  with check ((select private.member_role(organization_id)) in ('owner', 'admin') and accepted_at is null);

-- Aperçu d'une invitation pour la personne invitée (connectée) : organisation, rôle, adresse attendue.
create function public.invitation_info(invite_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('organization', o.name, 'role', i.role, 'email', i.email, 'expires_at', i.expires_at)
  from public.invitations i
  join public.organizations o on o.id = i.organization_id
  where char_length(invite_token) between 32 and 128
    and i.token_hash = encode(extensions.digest(invite_token, 'sha256'), 'hex')
    and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
$$;

-- Acceptation : l'adresse du compte connecté doit être celle de l'invitation.
create function public.accept_invitation(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.invitations;
  uid uuid := auth.uid();
  mail text := lower(auth.jwt() ->> 'email');
begin
  if uid is null then
    raise exception 'connexion requise';
  end if;
  select * into inv from public.invitations
    where token_hash = encode(extensions.digest(invite_token, 'sha256'), 'hex')
    for update;
  if not found or inv.accepted_at is not null or inv.revoked_at is not null or inv.expires_at <= now() then
    raise exception 'invitation invalide ou expirée';
  end if;
  if inv.email <> mail then
    raise exception 'invitation destinée à une autre adresse';
  end if;
  insert into public.memberships (organization_id, user_id, role) values (inv.organization_id, uid, inv.role)
    on conflict (organization_id, user_id) do nothing;
  update public.invitations set accepted_at = now(), accepted_by = uid where id = inv.id;
  insert into public.audit_log (organization_id, user_id, user_email, action, target_type, target_id, details)
    values (inv.organization_id, uid, mail, 'member.joined', 'invitation', inv.id::text, jsonb_build_object('role', inv.role));
  return inv.organization_id;
end;
$$;

-- Membres d'une organisation avec leur adresse (lue dans auth.users, non exposée), pour les seuls membres.
create function public.organization_members(org uuid)
returns table (user_id uuid, email text, role text, joined_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, u.email::text, m.role, m.created_at
  from public.memberships m
  join auth.users u on u.id = m.user_id
  where m.organization_id = org and private.member_role(org) is not null
  order by m.created_at
$$;

-- Changement de rôle : propriétaire ou admin ; seul un propriétaire touche au rôle de propriétaire ;
-- l'organisation garde toujours au moins un propriétaire.
create function public.set_member_role(org uuid, member uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller text := private.member_role(org);
  current_role_of_member text;
begin
  if caller is null or caller not in ('owner', 'admin') then
    raise exception 'action réservée au propriétaire et aux administrateurs';
  end if;
  if new_role not in ('owner', 'admin', 'editor', 'viewer') then
    raise exception 'rôle inconnu';
  end if;
  select m.role into current_role_of_member from public.memberships m where m.organization_id = org and m.user_id = member for update;
  if current_role_of_member is null then
    raise exception 'membre introuvable';
  end if;
  if (new_role = 'owner' or current_role_of_member = 'owner') and caller <> 'owner' then
    raise exception 'seul un propriétaire peut modifier le rôle de propriétaire';
  end if;
  if current_role_of_member = 'owner' and new_role <> 'owner'
     and (select count(*) from public.memberships m where m.organization_id = org and m.role = 'owner') = 1 then
    raise exception 'l''organisation doit garder au moins un propriétaire';
  end if;
  update public.memberships set role = new_role where organization_id = org and user_id = member;
  insert into public.audit_log (organization_id, user_id, user_email, action, target_type, target_id, details)
    values (org, auth.uid(), lower(auth.jwt() ->> 'email'), 'member.role_changed', 'user', member::text,
            jsonb_build_object('from', current_role_of_member, 'to', new_role));
end;
$$;

revoke all on function public.invitation_info(text), public.accept_invitation(text), public.organization_members(uuid),
  public.set_member_role(uuid, uuid, text) from public, anon;
grant execute on function public.invitation_info(text), public.accept_invitation(text), public.organization_members(uuid),
  public.set_member_role(uuid, uuid, text) to authenticated;

-- Retrait d'un membre (ou départ volontaire) : politique RLS et déclencheur, mêmes garde-fous.
create policy "Retrait par propriétaire, admin ou soi-même" on public.memberships
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.member_role(organization_id)) = 'owner'
    or ((select private.member_role(organization_id)) = 'admin' and role <> 'owner')
  );

create function private.memberships_before_remove()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Opérations d'administration (suppression de compte, d'organisation) : pas de contrôle applicatif.
  if auth.uid() is null then
    return old;
  end if;
  if old.role = 'owner' and (select count(*) from public.memberships m where m.organization_id = old.organization_id and m.role = 'owner') = 1 then
    raise exception 'l''organisation doit garder au moins un propriétaire';
  end if;
  insert into public.audit_log (organization_id, user_id, user_email, action, target_type, target_id, details)
    values (old.organization_id, auth.uid(), lower(auth.jwt() ->> 'email'), 'member.removed', 'user', old.user_id::text, jsonb_build_object('role', old.role));
  return old;
end;
$$;

create trigger memberships_before_remove
  before delete on public.memberships
  for each row execute function private.memberships_before_remove();
