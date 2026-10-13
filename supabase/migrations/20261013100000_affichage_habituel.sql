-- US-13 : affichage habituel de chaque utilisateur, repris à la création de ses dashboards.
-- Uniquement des réglages indépendants du fichier (mise en page, tailles, types de graphique, sections) :
-- aucune valeur du fichier n'y est enregistrée. Chacun ne lit et ne modifie que les siens.
create table public.display_preferences (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  preferences jsonb not null check (jsonb_typeof(preferences) = 'object' and pg_column_size(preferences) < 4000),
  updated_at timestamptz not null default now()
);

alter table public.display_preferences enable row level security;

create policy "Lecture de ses préférences" on public.display_preferences
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Création de ses préférences" on public.display_preferences
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Modification de ses préférences" on public.display_preferences
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Double authentification exigée si activée" on public.display_preferences
  as restrictive for all to authenticated using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

revoke all on public.display_preferences from anon;
