-- Test d'isolation entre organisations (SEC-04). S'exécute dans une transaction annulée :
-- aucune donnée n'est conservée. Chaque ligne du résultat doit afficher « ok ».
begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alice@test.example', '{"organization_name":"Org Alice"}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bob@test.example', '{"organization_name":"Org Bob"}', now(), now());

create temp table results (test text, ok boolean) on commit drop;
grant all on results to authenticated;
create temp table alice (org uuid) on commit drop;
insert into alice select organization_id from public.memberships where user_id = '11111111-1111-1111-1111-111111111111';
grant select on alice to authenticated;

insert into results select 'l''inscription crée une organisation dont l''utilisateur est propriétaire',
  (select role from public.memberships where user_id = '11111111-1111-1111-1111-111111111111') = 'owner';

-- Alice crée un dashboard dans son organisation.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
insert into public.dashboards (organization_id, created_by, title, file_name, row_count, ai_mode, result)
select org, auth.uid(), 'Ventes Alice', 'a.csv', 10, 'standard', '{}'::jsonb from alice;
insert into results select 'Alice voit son dashboard', (select count(*) from public.dashboards) = 1;

-- Bob, membre d'une autre organisation.
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
insert into results select 'Bob ne voit aucun dashboard d''Alice', (select count(*) from public.dashboards) = 0;
insert into results select 'Bob ne voit que son organisation', (select string_agg(name, ',') from public.organizations) = 'Org Bob';
insert into results select 'Bob ne voit que sa propre appartenance', (select count(*) from public.memberships) = 1;

do $$
begin
  begin
    insert into public.dashboards (organization_id, created_by, title, file_name, row_count, ai_mode, result)
    select org, auth.uid(), 'Intrusion', 'x.csv', 1, 'standard', '{}'::jsonb from alice;
    insert into results values ('Bob ne peut pas écrire chez Alice', false);
  exception when insufficient_privilege then
    insert into results values ('Bob ne peut pas écrire chez Alice', true);
  end;
end $$;

update public.organizations set name = 'Piraté' where id = (select org from alice);
delete from public.dashboards where organization_id = (select org from alice);

reset role;
insert into results select 'L''organisation d''Alice n''a pas été renommée',
  (select name from public.organizations where id = (select org from alice)) = 'Org Alice';
insert into results select 'Le dashboard d''Alice n''a pas été supprimé',
  (select count(*) from public.dashboards where organization_id = (select org from alice)) = 1;
insert into results select 'La fonction de contrôle n''est pas exposée à l''API',
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'member_role');

select test, case when ok then 'ok' else 'ÉCHEC' end as resultat from results;
rollback;
