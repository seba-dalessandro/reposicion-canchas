create table if not exists public.replenishment_operations (
  id uuid primary key default gen_random_uuid(),
  fecha_operativa date not null,
  hora_operativa time not null,
  forklift_id uuid null references public.forklifts(id),
  court_id uuid not null references public.courts(id),
  status text not null default 'active',
  created_by uuid null references auth.users(id),
  voided_by uuid null references auth.users(id),
  void_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  voided_at timestamptz null,
  constraint replenishment_operations_status_check check (status in ('active', 'voided')),
  constraint replenishment_operations_void_consistency check (
    (status = 'active' and voided_by is null and voided_at is null)
    or (status = 'voided' and voided_by is not null and voided_at is not null)
  )
);

create table if not exists public.replenishment_items (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.replenishment_operations(id) on delete cascade,
  sku_id uuid not null references public.skus(id),
  cantidad_paletas numeric not null check (cantidad_paletas > 0),
  observacion text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_replenishment_operations_fecha
on public.replenishment_operations(fecha_operativa desc);

create index if not exists idx_replenishment_operations_court
on public.replenishment_operations(court_id);

create index if not exists idx_replenishment_operations_forklift
on public.replenishment_operations(forklift_id);

create index if not exists idx_replenishment_operations_created_by
on public.replenishment_operations(created_by);

create index if not exists idx_replenishment_operations_voided_by
on public.replenishment_operations(voided_by);

create index if not exists idx_replenishment_items_operation
on public.replenishment_items(operation_id);

create index if not exists idx_replenishment_items_sku
on public.replenishment_items(sku_id);

drop trigger if exists replenishment_operations_touch_updated_at on public.replenishment_operations;
create trigger replenishment_operations_touch_updated_at
before update on public.replenishment_operations
for each row execute function app_private.touch_updated_at();

drop trigger if exists replenishment_items_touch_updated_at on public.replenishment_items;
create trigger replenishment_items_touch_updated_at
before update on public.replenishment_items
for each row execute function app_private.touch_updated_at();

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

drop trigger if exists replenishment_operations_protect_updates on public.replenishment_operations;
create trigger replenishment_operations_protect_updates
before update on public.replenishment_operations
for each row execute function app_private.protect_replenishment_operation_updates();

create or replace view public.v_replenishments_report
with (security_invoker = true)
as
select
  ro.id as operation_id,
  ri.id as item_id,
  ro.fecha_operativa,
  ro.hora_operativa,
  ro.status as operation_status,
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
left join public.forklifts f on f.id = ro.forklift_id
join public.courts c on c.id = ro.court_id
join public.skus s on s.id = ri.sku_id;

alter table public.replenishment_operations enable row level security;
alter table public.replenishment_items enable row level security;

drop policy if exists "replenishment_operations_select_by_role" on public.replenishment_operations;
drop policy if exists "replenishment_operations_insert_operational" on public.replenishment_operations;
drop policy if exists "replenishment_operations_void_by_supervisor" on public.replenishment_operations;
drop policy if exists "replenishment_operations_delete_supervisor" on public.replenishment_operations;

create policy "replenishment_operations_select_by_role"
on public.replenishment_operations for select
to authenticated
using (app_private.has_role_at_least('Solo lectura'));

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
);

create policy "replenishment_operations_void_by_supervisor"
on public.replenishment_operations for update
to authenticated
using (
  status = 'active'
  and app_private.has_role_at_least('Supervisor')
)
with check (
  status = 'voided'
  and app_private.has_role_at_least('Supervisor')
);

create policy "replenishment_operations_delete_supervisor"
on public.replenishment_operations for delete
to authenticated
using (app_private.has_role_at_least('Supervisor'));

drop policy if exists "replenishment_items_select_by_role" on public.replenishment_items;
drop policy if exists "replenishment_items_insert_operational" on public.replenishment_items;
drop policy if exists "replenishment_items_delete_supervisor" on public.replenishment_items;

create policy "replenishment_items_select_by_role"
on public.replenishment_items for select
to authenticated
using (app_private.has_role_at_least('Solo lectura'));

create policy "replenishment_items_insert_operational"
on public.replenishment_items for insert
to authenticated
with check (
  app_private.has_role_at_least('Usuario operativo')
  and cantidad_paletas > 0
  and exists (
    select 1
    from public.replenishment_operations ro
    where ro.id = replenishment_items.operation_id
      and ro.status = 'active'
      and ro.created_by = (select auth.uid())
  )
  and (
    app_private.has_role_at_least('Supervisor')
    or exists (
      select 1
      from public.skus s
      where s.id = replenishment_items.sku_id
        and s.effective_status = 'active'
    )
  )
);

create policy "replenishment_items_delete_supervisor"
on public.replenishment_items for delete
to authenticated
using (app_private.has_role_at_least('Supervisor'));

create or replace function public.create_replenishment_operation(
  fecha_operativa date,
  hora_operativa time,
  forklift_id uuid,
  court_id uuid,
  items jsonb
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
    created_by
  )
  values (
    create_replenishment_operation.fecha_operativa,
    create_replenishment_operation.hora_operativa,
    create_replenishment_operation.forklift_id,
    create_replenishment_operation.court_id,
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

grant select, insert, update, delete on
  public.replenishment_operations,
  public.replenishment_items
to authenticated;

grant select on public.v_replenishments_report to authenticated;
grant execute on function public.create_replenishment_operation(date, time, uuid, uuid, jsonb) to authenticated;
