-- US-09 / US-02 : historique des actualisations d'un dashboard (une version par import réussi).
-- US-01 : partage d'un dashboard par lien sécurisé, révocable.

create table public.dashboard_versions (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references public.dashboards (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  file_name text not null,
  row_count integer not null,
  -- Période couverte par le fichier (mois AAAA-MM), pour comparer les actualisations.
  period_start text check (period_start ~ '^\d{4}-\d{2}$'),
  period_end text check (period_end ~ '^\d{4}-\d{2}$'),
  result jsonb not null,
  created_at timestamptz not null default now()
);
create index dashboard_versions_dashboard_idx on public.dashboard_versions (dashboard_id, created_at desc);
create index dashboard_versions_organization_idx on public.dashboard_versions (organization_id);
create index dashboard_versions_created_by_idx on public.dashboard_versions (created_by);

alter table public.dashboard_versions enable row level security;

create policy "Lecture par les membres" on public.dashboard_versions
  for select to authenticated using ((select private.member_role(organization_id)) is not null);

-- Historique en ajout seul : aucune politique de modification ni de suppression.
create policy "Ajout par les éditeurs" on public.dashboard_versions
  for insert to authenticated
  with check (
    (select private.member_role(organization_id)) in ('owner', 'admin', 'editor')
    and created_by = (select auth.uid())
    and exists (select 1 from public.dashboards d where d.id = dashboard_id and d.organization_id = dashboard_versions.organization_id)
  );

-- Liens de partage : seul le hachage SHA-256 du jeton est conservé ; le lien complet n'est montré qu'à sa création.
create table public.dashboard_shares (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references public.dashboards (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  access text not null check (access in ('view', 'view_export')),
  enabled boolean not null default true,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index dashboard_shares_dashboard_idx on public.dashboard_shares (dashboard_id);
create index dashboard_shares_organization_idx on public.dashboard_shares (organization_id);
create index dashboard_shares_created_by_idx on public.dashboard_shares (created_by);

alter table public.dashboard_shares enable row level security;

create policy "Lecture par les membres" on public.dashboard_shares
  for select to authenticated using ((select private.member_role(organization_id)) is not null);

create policy "Création par les éditeurs" on public.dashboard_shares
  for insert to authenticated
  with check (
    (select private.member_role(organization_id)) in ('owner', 'admin', 'editor')
    and created_by = (select auth.uid())
    and exists (select 1 from public.dashboards d where d.id = dashboard_id and d.organization_id = dashboard_shares.organization_id)
  );

create policy "Gestion par les éditeurs" on public.dashboard_shares
  for update to authenticated
  using ((select private.member_role(organization_id)) in ('owner', 'admin', 'editor'))
  with check ((select private.member_role(organization_id)) in ('owner', 'admin', 'editor'));

-- Un lien révoqué l'est définitivement ; jeton, dashboard et organisation ne changent jamais.
create function private.dashboard_shares_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.token_hash <> old.token_hash or new.dashboard_id <> old.dashboard_id or new.organization_id <> old.organization_id then
    raise exception 'jeton, dashboard et organisation ne sont pas modifiables';
  end if;
  if old.revoked_at is not null and (new.revoked_at is null or new.enabled) then
    raise exception 'un lien révoqué ne peut pas être réactivé';
  end if;
  return new;
end;
$$;

create trigger dashboard_shares_guard
  before update on public.dashboard_shares
  for each row execute function private.dashboard_shares_guard();

-- Consultation d'un dashboard partagé, sans compte. Ne renvoie que le résultat calculé (indicateurs,
-- graphiques, analyse) : ni contexte envoyé à l'IA, ni structure, ni listes de valeurs des filtres.
-- Les données sources ne sont de toute façon jamais conservées.
create function public.shared_dashboard(share_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'title', d.title,
    'organization', o.name,
    'access', s.access,
    'refreshed_at', coalesce(d.updated_at, d.created_at),
    'result', ((d.result - 'aiContext' - 'spec' - 'filterOptions' - 'issues') #- '{analysis,sentToAi}')
  )
  from public.dashboard_shares s
  join public.dashboards d on d.id = s.dashboard_id
  join public.organizations o on o.id = d.organization_id
  where char_length(share_token) between 32 and 128
    and s.token_hash = encode(extensions.digest(share_token, 'sha256'), 'hex')
    and s.enabled
    and s.revoked_at is null
    and (s.expires_at is null or s.expires_at > now())
$$;
revoke all on function public.shared_dashboard(text) from public;
grant execute on function public.shared_dashboard(text) to anon, authenticated;
