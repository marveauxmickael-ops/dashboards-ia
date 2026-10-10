-- Avis « utile / pas utile » sur les pistes d'amélioration de l'analyse des variations (US-10).
-- Aucune donnée du fichier : seulement l'identifiant de la variation, la position de la suggestion et l'avis.
create table public.analysis_feedback (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  dashboard_id uuid not null references public.dashboards (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  variation_id text not null check (char_length(variation_id) <= 120),
  suggestion_index smallint not null check (suggestion_index between 0 and 20),
  useful boolean not null,
  created_at timestamptz not null default now(),
  -- Un avis par personne et par suggestion : un nouveau clic remplace le précédent.
  unique (dashboard_id, user_id, variation_id, suggestion_index)
);
create index analysis_feedback_organization_id_idx on public.analysis_feedback (organization_id, created_at desc);
create index analysis_feedback_user_id_idx on public.analysis_feedback (user_id);

alter table public.analysis_feedback enable row level security;

create policy "Lecture par les membres" on public.analysis_feedback
  for select to authenticated using ((select private.member_role(organization_id)) is not null);

-- Le dashboard doit appartenir à l'organisation indiquée : impossible de rattacher un avis ailleurs.
create policy "Avis par les membres" on public.analysis_feedback
  for insert to authenticated
  with check (
    (select private.member_role(organization_id)) is not null
    and user_id = (select auth.uid())
    and exists (select 1 from public.dashboards d where d.id = dashboard_id and d.organization_id = analysis_feedback.organization_id)
  );

create policy "Modification de son avis" on public.analysis_feedback
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (select private.member_role(organization_id)) is not null);
