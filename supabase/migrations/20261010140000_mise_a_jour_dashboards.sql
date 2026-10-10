-- US-08 : mise à jour d'un dashboard avec un nouveau fichier de même structure.
alter table public.dashboards add column updated_at timestamptz;

create policy "Mise à jour par les éditeurs" on public.dashboards
  for update to authenticated
  using ((select private.member_role(organization_id)) in ('owner', 'admin', 'editor'))
  with check ((select private.member_role(organization_id)) in ('owner', 'admin', 'editor'));

-- L'organisation et l'auteur d'un dashboard ne changent pas après sa création.
create function private.dashboards_immutable_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id <> old.organization_id or new.created_by is distinct from old.created_by or new.created_at <> old.created_at then
    raise exception 'organization_id, created_by et created_at ne sont pas modifiables';
  end if;
  return new;
end;
$$;

create trigger dashboards_immutable_columns
  before update on public.dashboards
  for each row execute function private.dashboards_immutable_columns();
