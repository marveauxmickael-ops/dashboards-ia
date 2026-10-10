-- Sprint 2 : comptes, organisations, dashboards sauvegardés, journal des appels IA.
-- Toutes les tables portent un organization_id ; la RLS limite chaque lecture et écriture
-- aux organisations dont l'utilisateur est membre (SEC-04).

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now()
);

create table public.memberships (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index memberships_user_id_idx on public.memberships (user_id);

-- Le fichier importé n'est jamais conservé : seul le résultat (profil, KPI, graphiques, constats)
-- et le contexte pseudonymisé envoyé à l'IA sont enregistrés.
create table public.dashboards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  title text not null,
  file_name text not null,
  row_count integer not null,
  ai_mode text not null check (ai_mode in ('standard', 'strict')),
  result jsonb not null,
  created_at timestamptz not null default now()
);
create index dashboards_organization_id_idx on public.dashboards (organization_id, created_at desc);

-- Traçabilité des appels IA (SEC-06) : métadonnées uniquement, jamais le contenu.
create table public.ai_calls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  dashboard_id uuid references public.dashboards (id) on delete set null,
  provider text not null,
  model text,
  ai_mode text not null,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now()
);
create index ai_calls_organization_id_idx on public.ai_calls (organization_id, created_at desc);

-- Rôle de l'utilisateur courant dans une organisation (null s'il n'en est pas membre).
-- SECURITY DEFINER évite la récursion des politiques sur memberships.
create function public.member_role(org uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.memberships where organization_id = org and user_id = auth.uid()
$$;
revoke all on function public.member_role(uuid) from public;
grant execute on function public.member_role(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.dashboards enable row level security;
alter table public.ai_calls enable row level security;

create policy "Lecture par les membres" on public.organizations
  for select to authenticated using (public.member_role(id) is not null);
create policy "Renommage par propriétaire ou admin" on public.organizations
  for update to authenticated using (public.member_role(id) in ('owner', 'admin'))
  with check (public.member_role(id) in ('owner', 'admin'));

create policy "Lecture des membres de ses organisations" on public.memberships
  for select to authenticated using (public.member_role(organization_id) is not null);

create policy "Lecture par les membres" on public.dashboards
  for select to authenticated using (public.member_role(organization_id) is not null);
create policy "Création par les éditeurs" on public.dashboards
  for insert to authenticated
  with check (public.member_role(organization_id) in ('owner', 'admin', 'editor') and created_by = auth.uid());
create policy "Suppression par les éditeurs" on public.dashboards
  for delete to authenticated using (public.member_role(organization_id) in ('owner', 'admin', 'editor'));

create policy "Lecture par propriétaire ou admin" on public.ai_calls
  for select to authenticated using (public.member_role(organization_id) in ('owner', 'admin'));
create policy "Journalisation par les éditeurs" on public.ai_calls
  for insert to authenticated
  with check (public.member_role(organization_id) in ('owner', 'admin', 'editor') and user_id = auth.uid());

-- À l'inscription : une organisation est créée et l'utilisateur en devient propriétaire (AUTH-01).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  org_id uuid;
begin
  insert into public.organizations (name)
  values (coalesce(nullif(left(trim(new.raw_user_meta_data ->> 'organization_name'), 120), ''), 'Mon organisation'))
  returning id into org_id;
  insert into public.memberships (organization_id, user_id, role) values (org_id, new.id, 'owner');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
revoke execute on function public.handle_new_user() from public, anon, authenticated;
