create policy "profiles_select_by_role"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or app_private.current_role() = 'Superadministrador'
  or (
    app_private.current_role() = 'Administrador'
    and app_private.role_rank(role) < app_private.role_rank('Administrador')
  )
);

create policy "profiles_insert_by_role"
on public.profiles
for insert
to authenticated
with check (app_private.can_manage_profile(role));

create policy "profiles_update_by_role"
on public.profiles
for update
to authenticated
using (app_private.can_manage_profile(role) or id = auth.uid())
with check (
  (id = auth.uid() and role = app_private.current_role())
  or app_private.can_manage_profile(role)
);

create policy "profiles_delete_by_role"
on public.profiles
for delete
to authenticated
using (
  email <> 'sebadalessandro@gmail.com'
  and app_private.can_manage_profile(role)
);

create policy "forklifts_select_authenticated"
on public.forklifts for select
to authenticated
using (app_private.has_role_at_least('Solo lectura'));

create policy "forklifts_admin_write"
on public.forklifts for all
to authenticated
using (app_private.has_role_at_least('Administrador'))
with check (app_private.has_role_at_least('Administrador'));

create policy "courts_select_authenticated"
on public.courts for select
to authenticated
using (app_private.has_role_at_least('Solo lectura'));

create policy "courts_admin_write"
on public.courts for all
to authenticated
using (app_private.has_role_at_least('Administrador'))
with check (app_private.has_role_at_least('Administrador'));

create policy "skus_select_authenticated"
on public.skus for select
to authenticated
using (app_private.has_role_at_least('Solo lectura'));

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

create policy "sku_imports_select_reporting_roles"
on public.sku_imports for select
to authenticated
using (
  app_private.has_role_at_least('Supervisor')
  or created_by = auth.uid()
);

create policy "sku_imports_admin_write"
on public.sku_imports for all
to authenticated
using (app_private.has_role_at_least('Administrador'))
with check (app_private.has_role_at_least('Administrador'));

create policy "sku_import_details_select_reporting_roles"
on public.sku_import_details for select
to authenticated
using (
  app_private.has_role_at_least('Supervisor')
  or exists (
    select 1
    from public.sku_imports i
    where i.id = sku_import_details.import_id
      and i.created_by = auth.uid()
  )
);

create policy "sku_import_details_admin_write"
on public.sku_import_details for all
to authenticated
using (app_private.has_role_at_least('Administrador'))
with check (app_private.has_role_at_least('Administrador'));

create policy "replenishments_select_by_role"
on public.replenishments for select
to authenticated
using (
  app_private.has_role_at_least('Supervisor')
  or created_by = auth.uid()
);

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
