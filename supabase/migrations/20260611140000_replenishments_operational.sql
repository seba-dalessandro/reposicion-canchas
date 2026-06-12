do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'replenishments'
      and column_name = 'quantity'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'replenishments'
      and column_name = 'cantidad_paletas'
  ) then
    alter table public.replenishments rename column quantity to cantidad_paletas;
  end if;
end;
$$;

alter table public.replenishments
add column if not exists fecha_operativa date,
add column if not exists hora_operativa time,
add column if not exists observacion text;

update public.replenishments
set fecha_operativa = coalesce(fecha_operativa, created_at::date)
where fecha_operativa is null;

alter table public.replenishments
alter column fecha_operativa set not null;

alter table public.replenishments
drop constraint if exists replenishments_quantity_check,
drop constraint if exists replenishments_cantidad_paletas_check,
add constraint replenishments_cantidad_paletas_check check (cantidad_paletas > 0);

create index if not exists replenishments_fecha_operativa_idx on public.replenishments(fecha_operativa desc);
create index if not exists replenishments_sku_id_idx on public.replenishments(sku_id);
create index if not exists replenishments_court_id_idx on public.replenishments(court_id);
create index if not exists replenishments_forklift_id_idx on public.replenishments(forklift_id);

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

drop trigger if exists replenishments_protect_updates on public.replenishments;
create trigger replenishments_protect_updates
before update on public.replenishments
for each row execute function app_private.protect_replenishment_updates();

drop policy if exists "replenishments_insert_operational" on public.replenishments;
drop policy if exists "replenishments_update_supervisor_void" on public.replenishments;
drop policy if exists "replenishments_delete_admin" on public.replenishments;

create policy "replenishments_insert_operational"
on public.replenishments for insert
to authenticated
with check (
  app_private.has_role_at_least('Usuario operativo')
  and status = 'active'
  and created_by = auth.uid()
  and fecha_operativa is not null
  and cantidad_paletas > 0
  and (
    app_private.has_role_at_least('Supervisor')
    or exists (
      select 1
      from public.skus s
      where s.id = replenishments.sku_id
        and s.effective_status = 'active'
    )
  )
);

create policy "replenishments_void_by_supervisor"
on public.replenishments for update
to authenticated
using (
  status = 'active'
  and app_private.has_role_at_least('Supervisor')
)
with check (
  status = 'voided'
  and app_private.has_role_at_least('Supervisor')
);
