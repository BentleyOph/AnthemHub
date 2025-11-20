-- Allow admins to store per-workflow time savings estimates for client metrics.
alter table public.workflow
  add column if not exists estimated_minutes_saved integer check (estimated_minutes_saved >= 0);

comment on column public.workflow.estimated_minutes_saved is 'Estimated minutes saved per successful automation run.';
