create or replace function public.get_database_capacity()
returns table (
  used_bytes bigint,
  limit_bytes bigint,
  used_mb numeric,
  limit_mb numeric,
  usage_percent numeric
)
language sql
stable
set search_path = public, pg_catalog
as $$
  select
    pg_database_size(current_database())::bigint as used_bytes,
    (500::bigint * 1024::bigint * 1024::bigint) as limit_bytes,
    round((pg_database_size(current_database())::numeric / 1024 / 1024), 2) as used_mb,
    500::numeric as limit_mb,
    round((pg_database_size(current_database())::numeric / (500::numeric * 1024 * 1024)) * 100, 2) as usage_percent;
$$;

revoke all on function public.get_database_capacity() from public;
revoke all on function public.get_database_capacity() from anon;
grant execute on function public.get_database_capacity() to authenticated;
