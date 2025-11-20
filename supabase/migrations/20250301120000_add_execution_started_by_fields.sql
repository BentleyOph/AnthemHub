-- Add denormalized starter metadata to executions so clients can see who started a run without joining user_profile.
alter table public.execution
  add column if not exists started_by_name text,
  add column if not exists started_by_email text;

-- Backfill existing executions with the current snapshot of user profile data.
update public.execution e
set
  started_by_name = coalesce(e.started_by_name, u.name),
  started_by_email = coalesce(e.started_by_email, u.email)
from public.user_profile u
where e.user_id = u.id;

comment on column public.execution.started_by_name is 'Display name of the user who started the execution (denormalized).';
comment on column public.execution.started_by_email is 'Email address of the user who started the execution (denormalized).';
