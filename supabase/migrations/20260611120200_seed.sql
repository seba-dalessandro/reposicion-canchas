insert into public.forklifts (name)
values ('Autoelevador 1'), ('Autoelevador 2')
on conflict (name) do nothing;

insert into public.courts (name)
select 'Cancha ' || gs::text
from generate_series(1, 7) as gs
on conflict (name) do nothing;

insert into public.profiles (id, email, full_name, role, can_change_sku_manual_status, is_active)
select id, email, coalesce(raw_user_meta_data->>'full_name', email), 'Superadministrador', true, true
from auth.users
where email = 'sebadalessandro@gmail.com'
on conflict (id) do update
set email = excluded.email,
    role = 'Superadministrador',
    can_change_sku_manual_status = true,
    is_active = true,
    updated_at = now();
