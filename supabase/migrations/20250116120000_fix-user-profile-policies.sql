-- Fix recursive user_profile policies by removing self-referencing subqueries.

alter table public.user_profile enable row level security;

drop policy if exists "admin manage profiles" on public.user_profile;
drop policy if exists "admins read all profiles" on public.user_profile;
drop policy if exists "users read self profile" on public.user_profile;

create policy "user_profile_self_select"
on public.user_profile
for select
using (id = auth.uid());

create policy "user_profile_admin_full_access"
on public.user_profile
for all
using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'ADMIN')
with check (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'ADMIN');
