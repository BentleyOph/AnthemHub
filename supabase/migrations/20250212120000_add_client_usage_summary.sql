-- Migration: Add per-client usage cost summary helper

create or replace function public.get_client_usage_cost_summary(
  p_client uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table(
  total_cost numeric,
  execution_count bigint,
  average_cost numeric,
  currency text
)
language sql
stable
as $$
  with stats as (
    select
      coalesce(sum(total_cost), 0) as total_cost,
      count(*) filter (where total_cost is not null) as execution_count,
      max(cost_currency) as currency
    from public.execution
    where client_id = p_client
      and started_at between p_from and p_to
      and total_cost is not null
  )
  select
    stats.total_cost,
    stats.execution_count,
    case
      when stats.execution_count = 0 then null
      else stats.total_cost / stats.execution_count
    end as average_cost,
    stats.currency
  from stats;
$$;

create or replace function public.get_client_workflow_usage_breakdown(
  p_client uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_limit integer default 10
)
returns table(
  workflow_id uuid,
  workflow_name text,
  total_cost numeric,
  execution_count bigint,
  average_cost numeric,
  currency text
)
language sql
stable
as $$
  select
    e.workflow_id,
    w.name as workflow_name,
    coalesce(sum(e.total_cost), 0) as total_cost,
    count(*) filter (where e.total_cost is not null) as execution_count,
    case
      when count(*) filter (where e.total_cost is not null) = 0 then null
      else sum(e.total_cost) / count(*) filter (where e.total_cost is not null)
    end as average_cost,
    max(e.cost_currency) as currency
  from public.execution e
  join public.workflow w on w.id = e.workflow_id
  where e.total_cost is not null
    and e.client_id = p_client
    and e.started_at between p_from and p_to
  group by e.workflow_id, w.name
  order by total_cost desc nulls last
  limit greatest(coalesce(p_limit, 10), 1);
$$;
