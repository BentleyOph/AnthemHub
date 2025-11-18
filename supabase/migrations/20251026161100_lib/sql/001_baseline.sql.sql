create type "public"."exec_source" as enum ('USER', 'SYSTEM');

create type "public"."exec_status" as enum ('PENDING', 'PROCESSING', 'SUCCESS', 'ERROR');

create type "public"."role" as enum ('ADMIN', 'CLIENT');

create table "public"."access_request" (
    "id" uuid not null default gen_random_uuid(),
    "workflow_id" uuid not null,
    "requester_id" uuid not null,
    "client_id" uuid not null,
    "note" text,
    "status" text not null default 'PENDING'::text,
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."access_request" enable row level security;

create table "public"."client" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "email" text,
    "company" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
);


alter table "public"."client" enable row level security;

create table "public"."client_workflow_access" (
    "id" uuid not null default gen_random_uuid(),
    "client_id" uuid not null,
    "workflow_id" uuid not null,
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."client_workflow_access" enable row level security;

create table "public"."execution" (
    "id" uuid not null default gen_random_uuid(),
    "client_id" uuid not null,
    "workflow_id" uuid not null,
    "status" exec_status not null default 'PENDING'::exec_status,
    "source" exec_source not null default 'USER'::exec_source,
    "input_payload" jsonb not null,
    "output_payload" jsonb,
    "error_message" text,
    "n8n_run_id" text,
    "started_at" timestamp with time zone not null default now(),
    "finished_at" timestamp with time zone,
    "result_file_url" text,
    "total_cost" numeric,
    "cost_currency" text,
    "cost_breakdown" jsonb
);


alter table "public"."execution" enable row level security;

create table "public"."execution_event" (
    "id" uuid not null default gen_random_uuid(),
    "execution_id" uuid not null,
    "timestamp" timestamp with time zone not null default now(),
    "stage" text not null,
    "message" text,
    "raw" jsonb
);


alter table "public"."execution_event" enable row level security;

create table "public"."user_profile" (
    "id" uuid not null,
    "email" text not null,
    "name" text,
    "role" role not null default 'CLIENT'::role,
    "client_id" uuid,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
);


alter table "public"."user_profile" enable row level security;

create table "public"."workflow" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "public_desc" text not null,
    "internal_notes" text,
    "icon_url" text,
    "n8n_webhook_url" text not null,
    "input_schema" jsonb not null,
    "is_published" boolean not null default false,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
);


alter table "public"."workflow" enable row level security;

CREATE UNIQUE INDEX access_request_pkey ON public.access_request USING btree (id);

CREATE UNIQUE INDEX client_pkey ON public.client USING btree (id);

CREATE UNIQUE INDEX client_workflow_access_client_id_workflow_id_key ON public.client_workflow_access USING btree (client_id, workflow_id);

CREATE UNIQUE INDEX client_workflow_access_pkey ON public.client_workflow_access USING btree (id);

CREATE UNIQUE INDEX execution_event_pkey ON public.execution_event USING btree (id);

CREATE UNIQUE INDEX execution_pkey ON public.execution USING btree (id);

CREATE INDEX idx_execution_client_workflow_status ON public.execution USING btree (client_id, workflow_id, status);

CREATE INDEX idx_execution_event_execution_timestamp ON public.execution_event USING btree (execution_id, "timestamp");

CREATE INDEX idx_execution_started_at ON public.execution USING btree (started_at);
CREATE INDEX idx_execution_total_cost ON public.execution USING btree (total_cost);
CREATE INDEX idx_execution_workflow_started_at ON public.execution USING btree (workflow_id, started_at);
CREATE UNIQUE INDEX user_profile_email_key ON public.user_profile USING btree (email);

CREATE UNIQUE INDEX user_profile_pkey ON public.user_profile USING btree (id);

CREATE UNIQUE INDEX workflow_pkey ON public.workflow USING btree (id);

alter table "public"."access_request" add constraint "access_request_pkey" PRIMARY KEY using index "access_request_pkey";

alter table "public"."client" add constraint "client_pkey" PRIMARY KEY using index "client_pkey";

alter table "public"."client_workflow_access" add constraint "client_workflow_access_pkey" PRIMARY KEY using index "client_workflow_access_pkey";

alter table "public"."execution" add constraint "execution_pkey" PRIMARY KEY using index "execution_pkey";

alter table "public"."execution_event" add constraint "execution_event_pkey" PRIMARY KEY using index "execution_event_pkey";

alter table "public"."user_profile" add constraint "user_profile_pkey" PRIMARY KEY using index "user_profile_pkey";

alter table "public"."workflow" add constraint "workflow_pkey" PRIMARY KEY using index "workflow_pkey";

alter table "public"."access_request" add constraint "access_request_client_id_fkey" FOREIGN KEY (client_id) REFERENCES client(id) ON DELETE CASCADE not valid;

alter table "public"."access_request" validate constraint "access_request_client_id_fkey";

alter table "public"."access_request" add constraint "access_request_requester_id_fkey" FOREIGN KEY (requester_id) REFERENCES user_profile(id) ON DELETE CASCADE not valid;

alter table "public"."access_request" validate constraint "access_request_requester_id_fkey";

alter table "public"."access_request" add constraint "access_request_workflow_id_fkey" FOREIGN KEY (workflow_id) REFERENCES workflow(id) ON DELETE CASCADE not valid;

alter table "public"."access_request" validate constraint "access_request_workflow_id_fkey";

alter table "public"."client_workflow_access" add constraint "client_workflow_access_client_id_fkey" FOREIGN KEY (client_id) REFERENCES client(id) ON DELETE CASCADE not valid;

alter table "public"."client_workflow_access" validate constraint "client_workflow_access_client_id_fkey";

alter table "public"."client_workflow_access" add constraint "client_workflow_access_client_id_workflow_id_key" UNIQUE using index "client_workflow_access_client_id_workflow_id_key";

alter table "public"."client_workflow_access" add constraint "client_workflow_access_workflow_id_fkey" FOREIGN KEY (workflow_id) REFERENCES workflow(id) ON DELETE CASCADE not valid;

alter table "public"."client_workflow_access" validate constraint "client_workflow_access_workflow_id_fkey";

alter table "public"."execution" add constraint "execution_client_id_fkey" FOREIGN KEY (client_id) REFERENCES client(id) ON DELETE CASCADE not valid;

alter table "public"."execution" validate constraint "execution_client_id_fkey";

alter table "public"."execution" add constraint "execution_workflow_id_fkey" FOREIGN KEY (workflow_id) REFERENCES workflow(id) ON DELETE CASCADE not valid;

alter table "public"."execution" validate constraint "execution_workflow_id_fkey";

alter table "public"."execution_event" add constraint "execution_event_execution_id_fkey" FOREIGN KEY (execution_id) REFERENCES execution(id) ON DELETE CASCADE not valid;

alter table "public"."execution_event" validate constraint "execution_event_execution_id_fkey";

alter table "public"."user_profile" add constraint "user_profile_client_id_fkey" FOREIGN KEY (client_id) REFERENCES client(id) ON DELETE SET NULL not valid;

alter table "public"."user_profile" validate constraint "user_profile_client_id_fkey";

alter table "public"."user_profile" add constraint "user_profile_email_key" UNIQUE using index "user_profile_email_key";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.set_client_access(p_client uuid, p_workflows uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  delete from client_workflow_access where client_id = p_client;
  insert into client_workflow_access (client_id, workflow_id)
  select p_client, unnest(p_workflows);
end; $function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end; $function$
;

create or replace view "public"."v_executions_daily" as  SELECT date_trunc('day'::text, started_at) AS day,
    count(*) AS total
   FROM execution
  GROUP BY (date_trunc('day'::text, started_at))
  ORDER BY (date_trunc('day'::text, started_at));


create policy "admin manage requests"
on "public"."access_request"
as permissive
for all
to public
using ((EXISTS ( SELECT 1
   FROM user_profile up
  WHERE ((up.id = auth.uid()) AND (up.role = 'ADMIN'::role)))))
with check (true);


create policy "client create access request"
on "public"."access_request"
as permissive
for insert
to public
with check ((EXISTS ( SELECT 1
   FROM user_profile up
  WHERE ((up.id = auth.uid()) AND (up.client_id = up.client_id)))));


create policy "client read own requests"
on "public"."access_request"
as permissive
for select
to public
using ((EXISTS ( SELECT 1
   FROM user_profile up
  WHERE ((up.id = auth.uid()) AND (up.client_id = up.client_id)))));


create policy "admins read/write clients"
on "public"."client"
as permissive
for all
to public
using ((EXISTS ( SELECT 1
   FROM user_profile up
  WHERE ((up.id = auth.uid()) AND (up.role = 'ADMIN'::role)))))
with check ((EXISTS ( SELECT 1
   FROM user_profile up
  WHERE ((up.id = auth.uid()) AND (up.role = 'ADMIN'::role)))));


create policy "clients can read their own client info"
on "public"."client"
as permissive
for select
to public
using ((EXISTS ( SELECT 1
   FROM user_profile up
  WHERE ((up.id = auth.uid()) AND (up.client_id = client.id)))));


create policy "admins manage access mappings"
on "public"."client_workflow_access"
as permissive
for all
to public
using ((EXISTS ( SELECT 1
   FROM user_profile up
  WHERE ((up.id = auth.uid()) AND (up.role = 'ADMIN'::role)))))
with check (true);


create policy "clients can read their own workflow access"
on "public"."client_workflow_access"
as permissive
for select
to public
using ((EXISTS ( SELECT 1
   FROM user_profile up
  WHERE ((up.id = auth.uid()) AND (up.client_id = client_workflow_access.client_id)))));


create policy "admin manage executions"
on "public"."execution"
as permissive
for all
to public
using ((EXISTS ( SELECT 1
   FROM user_profile up
  WHERE ((up.id = auth.uid()) AND (up.role = 'ADMIN'::role)))))
with check (true);


create policy "client create own executions"
on "public"."execution"
as permissive
for insert
to public
with check ((EXISTS ( SELECT 1
   FROM user_profile up
  WHERE ((up.id = auth.uid()) AND (up.client_id = up.client_id)))));


create policy "client read own executions"
on "public"."execution"
as permissive
for select
to public
using ((EXISTS ( SELECT 1
   FROM user_profile up
  WHERE ((up.id = auth.uid()) AND (up.client_id = execution.client_id)))));


create policy "read events of accessible executions"
on "public"."execution_event"
as permissive
for select
to public
using ((EXISTS ( SELECT 1
   FROM (execution e
     JOIN user_profile up ON ((up.id = auth.uid())))
  WHERE ((e.id = execution_event.execution_id) AND ((up.role = 'ADMIN'::role) OR (up.client_id = e.client_id))))));


create policy "write events via server key"
on "public"."execution_event"
as permissive
for insert
to service_role
with check (true);


create policy "admin manage profiles"
on "public"."user_profile"
as permissive
for all
to public
using ((EXISTS ( SELECT 1
   FROM user_profile up
  WHERE ((up.id = auth.uid()) AND (up.role = 'ADMIN'::role)))))
with check ((EXISTS ( SELECT 1
   FROM user_profile up
  WHERE ((up.id = auth.uid()) AND (up.role = 'ADMIN'::role)))));


create policy "admins read all profiles"
on "public"."user_profile"
as permissive
for select
to public
using ((EXISTS ( SELECT 1
   FROM user_profile up
  WHERE ((up.id = auth.uid()) AND (up.role = 'ADMIN'::role)))));


create policy "users read self profile"
on "public"."user_profile"
as permissive
for select
to public
using ((id = auth.uid()));


create policy "admins full access workflows"
on "public"."workflow"
as permissive
for all
to public
using ((EXISTS ( SELECT 1
   FROM user_profile up
  WHERE ((up.id = auth.uid()) AND (up.role = 'ADMIN'::role)))))
with check (true);


create policy "anyone read published workflows"
on "public"."workflow"
as permissive
for select
to public
using ((is_published = true));


CREATE TRIGGER trg_client_updated BEFORE UPDATE ON public.client FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_user_profile_updated BEFORE UPDATE ON public.user_profile FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_workflow_updated BEFORE UPDATE ON public.workflow FOR EACH ROW EXECUTE FUNCTION set_updated_at();
create or replace function public.get_usage_cost_summary(p_from timestamptz, p_to timestamptz)
returns table(total_cost numeric, execution_count bigint, average_cost numeric, currency text)
language sql
stable
as $$
  with stats as (
    select
      coalesce(sum(total_cost), 0) as total_cost,
      count(*) filter (where total_cost is not null) as execution_count,
      max(cost_currency) as currency
    from public.execution
    where started_at between p_from and p_to
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

create or replace function public.get_workflow_usage_breakdown(
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
    and e.started_at between p_from and p_to
  group by e.workflow_id, w.name
  order by total_cost desc nulls last
  limit greatest(coalesce(p_limit, 10), 1);
$$;
