create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.drivers enable row level security;

drop trigger if exists drivers_touch_updated_at on public.drivers;
create trigger drivers_touch_updated_at
before update on public.drivers
for each row execute function app_private.touch_updated_at();

alter table public.replenishment_operations
add column if not exists driver_id uuid null references public.drivers(id);

create index if not exists idx_replenishment_operations_driver
on public.replenishment_operations(driver_id);

create or replace function app_private.protect_replenishment_operation_updates()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  if old.status = 'voided' then
    raise exception 'Una operacion anulada no puede modificarse';
  end if;

  if not app_private.has_role_at_least('Supervisor') then
    raise exception 'Solo Supervisor, Administrador o Superadministrador pueden anular operaciones';
  end if;

  if new.status <> 'voided' then
    raise exception 'No se permiten modificaciones; solo anulacion';
  end if;

  if new.fecha_operativa is distinct from old.fecha_operativa
    or new.hora_operativa is distinct from old.hora_operativa
    or new.forklift_id is distinct from old.forklift_id
    or new.court_id is distinct from old.court_id
    or new.driver_id is distinct from old.driver_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at then
    raise exception 'No se permite editar una operacion; debe anularse y cargar una nueva';
  end if;

  if nullif(trim(coalesce(new.void_reason, '')), '') is null then
    raise exception 'El motivo de anulacion es obligatorio';
  end if;

  new.voided_by = auth.uid();
  new.voided_at = now();

  return new;
end;
$$;

drop policy if exists "drivers_select_authenticated" on public.drivers;
drop policy if exists "drivers_admin_write" on public.drivers;

create policy "drivers_select_authenticated"
on public.drivers for select
to authenticated
using (app_private.has_role_at_least('Solo lectura'));

create policy "drivers_admin_write"
on public.drivers for all
to authenticated
using (app_private.has_role_at_least('Administrador'))
with check (app_private.has_role_at_least('Administrador'));

drop policy if exists "replenishment_operations_insert_operational" on public.replenishment_operations;
create policy "replenishment_operations_insert_operational"
on public.replenishment_operations for insert
to authenticated
with check (
  app_private.has_role_at_least('Usuario operativo')
  and status = 'active'
  and created_by = (select auth.uid())
  and fecha_operativa is not null
  and hora_operativa is not null
  and court_id is not null
  and (
    driver_id is null
    or exists (
      select 1
      from public.drivers d
      where d.id = replenishment_operations.driver_id
        and d.is_active = true
    )
  )
);

insert into public.drivers (name)
select coalesce(full_name, email)
from public.profiles
where is_active = true
  and role in ('Superadministrador', 'Administrador', 'Supervisor', 'Usuario operativo')
on conflict (name) do nothing;

drop view if exists public.v_replenishments_report;

create view public.v_replenishments_report
with (security_invoker = true)
as
select
  ro.id as operation_id,
  ri.id as item_id,
  ro.fecha_operativa,
  ro.hora_operativa,
  ro.status as operation_status,
  ro.driver_id,
  d.name as driver_name,
  ro.forklift_id,
  f.name as forklift_name,
  ro.court_id,
  c.name as court_name,
  ri.sku_id,
  s.sku_code,
  s.description as sku_description,
  s.effective_status as sku_status,
  ri.cantidad_paletas,
  ri.observacion,
  ro.created_by,
  ro.created_at as operation_created_at,
  ri.created_at as item_created_at,
  ro.voided_by,
  ro.void_reason,
  ro.voided_at
from public.replenishment_operations ro
join public.replenishment_items ri on ri.operation_id = ro.id
left join public.drivers d on d.id = ro.driver_id
left join public.forklifts f on f.id = ro.forklift_id
join public.courts c on c.id = ro.court_id
join public.skus s on s.id = ri.sku_id;

create or replace function public.create_replenishment_operation(
  fecha_operativa date,
  hora_operativa time,
  forklift_id uuid,
  court_id uuid,
  items jsonb,
  driver_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_operation_id uuid;
  item jsonb;
  item_sku_id uuid;
  item_cantidad numeric;
begin
  if fecha_operativa is null then
    raise exception 'fecha_operativa es obligatoria';
  end if;

  if hora_operativa is null then
    raise exception 'hora_operativa es obligatoria';
  end if;

  if court_id is null then
    raise exception 'court_id es obligatorio';
  end if;

  if items is null or jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 then
    raise exception 'Debe informar al menos un item';
  end if;

  insert into public.replenishment_operations (
    fecha_operativa,
    hora_operativa,
    forklift_id,
    court_id,
    driver_id,
    created_by
  )
  values (
    create_replenishment_operation.fecha_operativa,
    create_replenishment_operation.hora_operativa,
    create_replenishment_operation.forklift_id,
    create_replenishment_operation.court_id,
    create_replenishment_operation.driver_id,
    auth.uid()
  )
  returning id into new_operation_id;

  for item in select value from jsonb_array_elements(items)
  loop
    if nullif(item ->> 'sku_id', '') is null then
      raise exception 'Cada item debe incluir sku_id';
    end if;

    item_sku_id := (item ->> 'sku_id')::uuid;
    item_cantidad := nullif(item ->> 'cantidad_paletas', '')::numeric;

    if item_cantidad is null or item_cantidad <= 0 then
      raise exception 'cantidad_paletas debe ser mayor a cero';
    end if;

    insert into public.replenishment_items (
      operation_id,
      sku_id,
      cantidad_paletas,
      observacion
    )
    values (
      new_operation_id,
      item_sku_id,
      item_cantidad,
      nullif(trim(coalesce(item ->> 'observacion', '')), '')
    );
  end loop;

  return new_operation_id;
end;
$$;

grant select, insert, update, delete on public.drivers to authenticated;
grant execute on function public.create_replenishment_operation(date, time, uuid, uuid, jsonb, uuid) to authenticated;
