create extension if not exists pgcrypto;
create extension if not exists citext;

create schema if not exists app_private;

create type public.app_role as enum (
  'Superadministrador',
  'Administrador',
  'Supervisor',
  'Usuario operativo',
  'Solo lectura'
);

create type public.replenishment_status as enum ('active', 'voided');
create type public.sku_status as enum ('active', 'voided');
create type public.sku_status_source as enum ('file', 'manual');
create type public.sku_import_status as enum ('pending', 'processed', 'failed');
create type public.sku_import_detail_classification as enum (
  'nuevo',
  'existente',
  'modificado',
  'duplicado_archivo',
  'error'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext not null unique,
  full_name text,
  role public.app_role not null default 'Solo lectura',
  can_change_sku_manual_status boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_superadmin_email_role check (
    email <> 'sebadalessandro@gmail.com'::citext or role = 'Superadministrador'
  )
);

create table public.forklifts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.courts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.skus (
  id uuid primary key default gen_random_uuid(),
  sku_code text not null unique,
  description text not null,
  status_file public.sku_status not null default 'active',
  status_manual public.sku_status,
  effective_status public.sku_status not null default 'active',
  status_source public.sku_status_source not null default 'file',
  last_file_import_at timestamptz,
  manual_status_changed_by uuid references public.profiles(id),
  manual_status_changed_at timestamptz,
  manual_status_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sku_imports (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  status public.sku_import_status not null default 'pending',
  total_rows integer not null default 0 check (total_rows >= 0),
  valid_rows integer not null default 0 check (valid_rows >= 0),
  invalid_rows integer not null default 0 check (invalid_rows >= 0),
  summary_new integer not null default 0 check (summary_new >= 0),
  summary_existing integer not null default 0 check (summary_existing >= 0),
  summary_modified integer not null default 0 check (summary_modified >= 0),
  summary_duplicado_archivo integer not null default 0 check (summary_duplicado_archivo >= 0),
  summary_error integer not null default 0 check (summary_error >= 0),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create table public.sku_import_details (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.sku_imports(id) on delete cascade,
  row_number integer not null check (row_number > 0),
  sku_code text not null,
  description text,
  status_file public.sku_status,
  classification public.sku_import_detail_classification not null default 'existente',
  previous_description text,
  previous_status_file public.sku_status,
  status_manual public.sku_status,
  effective_status public.sku_status,
  status_source public.sku_status_source,
  error_message text,
  sku_id uuid references public.skus(id),
  created_at timestamptz not null default now(),
  unique (import_id, row_number)
);

create table public.replenishments (
  id uuid primary key default gen_random_uuid(),
  sku_id uuid not null references public.skus(id),
  court_id uuid not null references public.courts(id),
  forklift_id uuid references public.forklifts(id),
  fecha_operativa date not null,
  hora_operativa time,
  cantidad_paletas numeric(12, 3) not null check (cantidad_paletas > 0),
  observacion text,
  status public.replenishment_status not null default 'active',
  created_by uuid not null default auth.uid() references public.profiles(id),
  voided_by uuid references public.profiles(id),
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  voided_at timestamptz,
  constraint replenishments_void_consistency check (
    (status = 'active' and voided_by is null and voided_at is null)
    or (status = 'voided' and voided_by is not null and voided_at is not null)
  )
);

create index profiles_role_idx on public.profiles(role);
create index skus_effective_status_idx on public.skus(effective_status);
create index sku_imports_created_by_idx on public.sku_imports(created_by);
create index sku_import_details_import_id_idx on public.sku_import_details(import_id);
create index sku_import_details_classification_idx on public.sku_import_details(classification);
create index replenishments_created_by_idx on public.replenishments(created_by);
create index replenishments_created_at_idx on public.replenishments(created_at desc);
create index replenishments_fecha_operativa_idx on public.replenishments(fecha_operativa desc);
create index replenishments_status_idx on public.replenishments(status);
create index replenishments_sku_id_idx on public.replenishments(sku_id);
create index replenishments_court_id_idx on public.replenishments(court_id);
create index replenishments_forklift_id_idx on public.replenishments(forklift_id);

create or replace function app_private.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function app_private.touch_updated_at();

create trigger forklifts_touch_updated_at
before update on public.forklifts
for each row execute function app_private.touch_updated_at();

create trigger courts_touch_updated_at
before update on public.courts
for each row execute function app_private.touch_updated_at();

create trigger skus_touch_updated_at
before update on public.skus
for each row execute function app_private.touch_updated_at();

create trigger replenishments_touch_updated_at
before update on public.replenishments
for each row execute function app_private.touch_updated_at();

create or replace function app_private.role_rank(role_name public.app_role)
returns integer
language sql
immutable
as $$
  select case role_name
    when 'Superadministrador' then 50
    when 'Administrador' then 40
    when 'Supervisor' then 30
    when 'Usuario operativo' then 20
    when 'Solo lectura' then 10
  end;
$$;

create or replace function app_private.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active = true;
$$;

create or replace function app_private.has_role_at_least(required_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public, app_private
as $$
  select coalesce(app_private.role_rank(app_private.current_role()) >= app_private.role_rank(required_role), false);
$$;

create or replace function app_private.can_manage_profile(target_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public, app_private
as $$
  select app_private.current_role() = 'Superadministrador'
    or app_private.role_rank(app_private.current_role()) > app_private.role_rank(target_role);
$$;

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

create trigger skus_apply_effective_status
before insert or update on public.skus
for each row execute function app_private.apply_sku_effective_status();

create trigger skus_protect_updates
before update on public.skus
for each row execute function app_private.protect_sku_updates();

create or replace function app_private.protect_replenishment_updates()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  if tg_op = 'UPDATE' then
    if old.status = 'voided' then
      raise exception 'Una reposicion anulada no puede modificarse';
    end if;

    if not app_private.has_role_at_least('Supervisor') then
      raise exception 'Solo Supervisor, Administrador o Superadministrador pueden anular reposiciones';
    end if;

    if new.status <> 'voided' then
      raise exception 'No se permiten modificaciones; solo anulacion';
    end if;

    if new.sku_id is distinct from old.sku_id
      or new.court_id is distinct from old.court_id
      or new.forklift_id is distinct from old.forklift_id
      or new.cantidad_paletas is distinct from old.cantidad_paletas
      or new.fecha_operativa is distinct from old.fecha_operativa
      or new.hora_operativa is distinct from old.hora_operativa
      or new.observacion is distinct from old.observacion
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at then
      raise exception 'No se permite editar una reposicion; debe anularse y cargar una nueva';
    end if;

    if nullif(trim(coalesce(new.void_reason, '')), '') is null then
      raise exception 'El motivo de anulacion es obligatorio';
    end if;

    new.voided_by = auth.uid();
    new.voided_at = now();
  end if;

  return new;
end;
$$;

create trigger replenishments_protect_updates
before update on public.replenishments
for each row execute function app_private.protect_replenishment_updates();

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

create trigger profiles_protect_superadmin
before insert or update on public.profiles
for each row execute function app_private.protect_profiles();

create or replace function app_private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    case
      when new.email = 'sebadalessandro@gmail.com' then 'Superadministrador'::public.app_role
      else 'Solo lectura'::public.app_role
    end
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(public.profiles.full_name, excluded.full_name),
      role = case
        when excluded.email = 'sebadalessandro@gmail.com' then 'Superadministrador'::public.app_role
        else public.profiles.role
      end,
      can_change_sku_manual_status = case
        when excluded.email = 'sebadalessandro@gmail.com' then true
        else public.profiles.can_change_sku_manual_status
      end,
      updated_at = now();

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function app_private.handle_new_auth_user();

revoke all on schema app_private from public;
grant usage on schema app_private to authenticated;
grant execute on all functions in schema app_private to authenticated;

grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.profiles,
  public.forklifts,
  public.courts,
  public.skus,
  public.sku_imports,
  public.sku_import_details,
  public.replenishments
to authenticated;

alter table public.profiles enable row level security;
alter table public.forklifts enable row level security;
alter table public.courts enable row level security;
alter table public.skus enable row level security;
alter table public.sku_imports enable row level security;
alter table public.sku_import_details enable row level security;
alter table public.replenishments enable row level security;
