drop policy if exists "replenishments_delete_supervisor" on public.replenishments;
drop policy if exists "replenishments_delete_admin" on public.replenishments;

create policy "replenishments_delete_supervisor"
on public.replenishments for delete
to authenticated
using (app_private.has_role_at_least('Supervisor'));
