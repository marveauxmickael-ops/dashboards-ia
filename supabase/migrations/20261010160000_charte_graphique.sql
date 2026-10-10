-- Charte graphique de l'organisation : logo (PNG réencodé, data URL) et couleurs, appliqués aux dashboards.
alter table public.organizations
  add column branding jsonb not null default '{}'::jsonb
  check (jsonb_typeof(branding) = 'object' and pg_column_size(branding) < 400000);

-- Le dashboard partagé affiche aussi le logo et les couleurs de l'organisation.
create or replace function public.shared_dashboard(share_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'title', d.title,
    'organization', o.name,
    'branding', o.branding,
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
