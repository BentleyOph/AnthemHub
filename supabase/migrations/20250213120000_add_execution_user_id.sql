alter table public.execution
  add column if not exists user_id uuid references public.user_profile(id) on delete set null;

create index if not exists idx_execution_user_id on public.execution(user_id);
