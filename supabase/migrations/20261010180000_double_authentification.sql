-- AUTH-04 : double authentification (TOTP). Pour un utilisateur qui l'a activée, les données ne sont accessibles
-- qu'avec une session vérifiée par le second facteur (aal2) : politiques restrictives, en plus des politiques existantes.
create function private.mfa_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'aal') = 'aal2', false)
      or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified')
$$;
revoke all on function private.mfa_ok() from public, anon;
grant execute on function private.mfa_ok() to authenticated;

create policy "Double authentification exigée si activée" on public.dashboards
  as restrictive for all to authenticated using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
create policy "Double authentification exigée si activée" on public.dashboard_versions
  as restrictive for all to authenticated using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
create policy "Double authentification exigée si activée" on public.dashboard_shares
  as restrictive for all to authenticated using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
create policy "Double authentification exigée si activée" on public.invitations
  as restrictive for all to authenticated using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
create policy "Double authentification exigée si activée" on public.audit_log
  as restrictive for all to authenticated using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
create policy "Double authentification exigée si activée" on public.analysis_feedback
  as restrictive for all to authenticated using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
create policy "Double authentification exigée si activée" on public.ai_calls
  as restrictive for all to authenticated using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
