-- La fonction de contrôle d'appartenance n'a pas à être appelable via l'API REST :
-- elle passe dans un schéma privé, non exposé, utilisé uniquement par les politiques RLS.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

alter function public.member_role(uuid) set schema private;
revoke all on function private.member_role(uuid) from public, anon;
grant execute on function private.member_role(uuid) to authenticated;
