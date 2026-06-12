do $$
begin
  if not exists (select 1 from pg_type where typname = 'sku_status') then
    create type public.sku_status as enum ('active', 'voided');
  end if;

  if not exists (select 1 from pg_type where typname = 'sku_status_source') then
    create type public.sku_status_source as enum ('file', 'manual');
  end if;

  if not exists (select 1 from pg_type where typname = 'sku_import_detail_classification') then
    create type public.sku_import_detail_classification as enum (
      'nuevo',
      'existente',
      'modificado',
      'duplicado_archivo',
      'error'
    );
  end if;
end;
$$;

alter table public.profiles
add column if not exists can_change_sku_manual_status boolean not null default false;

create or replace function app_private.protect_profiles()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  if new.email = 'sebadalessandro@gmail.com'::citext then
    new.role = 'Superadministrador';
    new.can_change_sku_manual_status = true;
    new.is_active = true;
  end if;

  if tg_op = 'UPDATE' and old.email = 'sebadalessandro@gmail.com'::citext then
    new.email = old.email;
    new.role = 'Superadministrador';
    new.can_change_sku_manual_status = true;
    new.is_active = true;
  end if;

  if tg_op = 'UPDATE'
    and old.email <> 'sebadalessandro@gmail.com'::citext
    and not app_private.can_manage_profile(old.role) then
    new.role = old.role;
    new.is_active = old.is_active;
    new.can_change_sku_manual_status = old.can_change_sku_manual_status;
  end if;

  return new;
end;
$$;

update public.profiles
set can_change_sku_manual_status = true
where email = 'sebadalessandro@gmail.com'::citext;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'skus'
      and column_name = 'code'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'skus'
      and column_name = 'sku_code'
  ) then
    alter table public.skus rename column code to sku_code;
  end if;
end;
$$;

alter table public.skus
drop column if exists unit,
drop column if exists is_active;

alter table public.skus
add column if not exists status_file public.sku_status not null default 'active',
add column if not exists status_manual public.sku_status,
add column if not exists effective_status public.sku_status not null default 'active',
add column if not exists status_source public.sku_status_source not null default 'file',
add column if not exists last_file_import_at timestamptz,
add column if not exists manual_status_changed_by uuid references public.profiles(id),
add column if not exists manual_status_changed_at timestamptz,
add column if not exists manual_status_reason text;

alter table public.sku_imports
add column if not exists summary_new integer not null default 0 check (summary_new >= 0),
add column if not exists summary_existing integer not null default 0 check (summary_existing >= 0),
add column if not exists summary_modified integer not null default 0 check (summary_modified >= 0),
add column if not exists summary_duplicado_archivo integer not null default 0 check (summary_duplicado_archivo >= 0),
add column if not exists summary_error integer not null default 0 check (summary_error >= 0);

alter table public.sku_import_details
drop column if exists unit,
add column if not exists status_file public.sku_status,
add column if not exists classification public.sku_import_detail_classification not null default 'existente',
add column if not exists previous_description text,
add column if not exists previous_status_file public.sku_status,
add column if not exists status_manual public.sku_status,
add column if not exists effective_status public.sku_status,
add column if not exists status_source public.sku_status_source;

create index if not exists skus_effective_status_idx on public.skus(effective_status);
create index if not exists sku_import_details_classification_idx on public.sku_import_details(classification);

create or replace function app_private.current_profile_can_change_sku_manual_status()
returns boolean
language sql
stable
security definer
set search_path = public, app_private
as $$
  select coalesce(
    app_private.has_role_at_least('Administrador')
    or (
      app_private.current_role() = 'Supervisor'
      and exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.is_active = true
          and p.can_change_sku_manual_status = true
      )
    ),
    false
  );
$$;

create or replace function app_private.apply_sku_effective_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status_manual is not null then
    new.effective_status = new.status_manual;
    new.status_source = 'manual';
  else
    new.effective_status = new.status_file;
    new.status_source = 'file';
  end if;

  return new;
end;
$$;

create or replace function app_private.protect_sku_updates()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  if tg_op = 'UPDATE' and not app_private.has_role_at_least('Administrador') then
    if not app_private.current_profile_can_change_sku_manual_status() then
      raise exception 'No autorizado para modificar SKUs';
    end if;

    if new.sku_code is distinct from old.sku_code
      or new.description is distinct from old.description
      or new.status_file is distinct from old.status_file
      or new.last_file_import_at is distinct from old.last_file_import_at then
      raise exception 'Solo se permite cambiar el estado manual del SKU';
    end if;
  end if;

  if new.status_manual is distinct from old.status_manual then
    if new.status_manual is null then
      new.manual_status_changed_by = null;
      new.manual_status_changed_at = null;
      new.manual_status_reason = null;
    else
      new.manual_status_changed_by = auth.uid();
      new.manual_status_changed_at = now();
      if nullif(trim(coalesce(new.manual_status_reason, '')), '') is null then
        raise exception 'El motivo del cambio manual es obligatorio';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists skus_apply_effective_status on public.skus;
create trigger skus_apply_effective_status
before insert or update on public.skus
for each row execute function app_private.apply_sku_effective_status();

drop trigger if exists skus_protect_updates on public.skus;
create trigger skus_protect_updates
before update on public.skus
for each row execute function app_private.protect_sku_updates();

drop policy if exists "skus_admin_write" on public.skus;
drop policy if exists "skus_admin_insert" on public.skus;
drop policy if exists "skus_update_by_permission" on public.skus;
drop policy if exists "skus_delete_admin" on public.skus;
create policy "skus_admin_insert"
on public.skus for insert
to authenticated
with check (app_private.has_role_at_least('Administrador'));

create policy "skus_update_by_permission"
on public.skus for update
to authenticated
using (
  app_private.has_role_at_least('Administrador')
  or app_private.current_profile_can_change_sku_manual_status()
)
with check (
  app_private.has_role_at_least('Administrador')
  or app_private.current_profile_can_change_sku_manual_status()
);

create policy "skus_delete_admin"
on public.skus for delete
to authenticated
using (app_private.has_role_at_least('Administrador'));

grant execute on function app_private.current_profile_can_change_sku_manual_status() to authenticated;
