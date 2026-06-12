create or replace function app_private.role_rank(role_name public.app_role)
returns integer
language sql
immutable
set search_path = public, app_private
as $$
  select case role_name
    when 'Superadministrador' then 50
    when 'Administrador' then 40
    when 'Supervisor' then 30
    when 'Usuario operativo' then 20
    when 'Solo lectura' then 10
  end;
$$;

create index if not exists skus_manual_status_changed_by_idx on public.skus(manual_status_changed_by);
create index if not exists sku_import_details_sku_id_idx on public.sku_import_details(sku_id);
create index if not exists replenishments_voided_by_idx on public.replenishments(voided_by);
