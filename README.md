## Overview 
An all-in-one platform for selling and operating pre-built n8n automations as products. Admins register workflows (with input schemas, webhook URLs, and visibility), assign access to clients, and monitor success/error metrics. Clients browse available workflows, run the ones they have access to, and view/download results. Include execution tracking, per-client access control, and a callback + SSE flow for real-time status.


### Route Migration (October 2024)

- `/auth/login` → `/login`
- `/dashboard` → `/admin/overview`
- `/my/workflows` → `/overview` (client landing) and `/workflows`


## 1) Stack Overview 

* **Frontend:** Next.js 16 (App Router) • React • TypeScript • TailwindCSS • **shadcn/ui**
* **Auth & DB:** **Supabase** (Auth + Postgres + RLS).

  * **No ORM.** Use **@supabase/supabase-js** directly (queries, `insert/update/delete`, `rpc`, `storage`).
* **API:** Next.js Route Handlers (REST) with Zod validation
* **Queue/Workers:** BullMQ + Redis (async webhook calls + retries + timeout)
* **Realtime:** Server-Sent Events (SSE) per execution (Redis Pub/Sub or Supabase Realtime)
* **Storage:** S3-compatible *or* Supabase Storage (choose one; both supported)
* **Charts:** Recharts
* **Timezone:** Default `Africa/Nairobi` (UTC in DB, format on read)

---

## 2) Roles, Tenancy & Security (Unchanged)

* **Roles:** `ADMIN`, `CLIENT`
* **Tenant isolation:** every row has `client_id`; enforced by **RLS**.
* **n8n callback:** HMAC signature `X-Signature` (HMAC-SHA256 of raw body).

---

## 3) Database Schema (Pure SQL)

> Use UUIDs, UTC timestamps. Create in `public` schema or a dedicated `app` schema. Below uses `public`.

```sql
-- Enums
create type role as enum ('ADMIN', 'CLIENT');
create type exec_status as enum ('PENDING', 'PROCESSING', 'SUCCESS', 'ERROR');
create type exec_source as enum ('USER', 'SYSTEM');

-- Users "profile" table (maps to Supabase auth.users.id)
create table if not exists user_profile (
  id         uuid primary key,        -- equals auth.users.id
  email      text unique not null,
  name       text,
  role       role not null default 'CLIENT',
  client_id  uuid,                    -- null for admins
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists client (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text,
  company    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table user_profile
  add constraint user_profile_client_fk
  foreign key (client_id) references client(id);

create table if not exists workflow (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  public_desc    text not null,
  internal_notes text,
  icon_url       text,
  n8n_webhook_url text not null,
  input_schema   jsonb not null,
  is_published   boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists client_workflow_access (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references client(id) on delete cascade,
  workflow_id uuid not null references workflow(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (client_id, workflow_id)
);

create table if not exists execution (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references client(id) on delete cascade,
  workflow_id     uuid not null references workflow(id) on delete cascade,
  status          exec_status not null default 'PENDING',
  source          exec_source not null default 'USER',
  input_payload   jsonb not null,
  output_payload  jsonb,
  error_message   text,
  n8n_run_id      text,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  result_file_url text
);

create index on execution (client_id, workflow_id, status);
create index on execution (started_at);

create table if not exists execution_event (
  id           uuid primary key default gen_random_uuid(),
  execution_id uuid not null references execution(id) on delete cascade,
  "timestamp"  timestamptz not null default now(),
  stage        text not null,
  message      text,
  raw          jsonb
);

create index on execution_event (execution_id, "timestamp");

-- Optional: access requests
create table if not exists access_request (
  id            uuid primary key default gen_random_uuid(),
  workflow_id   uuid not null references workflow(id) on delete cascade,
  requester_id  uuid not null references user_profile(id) on delete cascade,
  client_id     uuid not null references client(id) on delete cascade,
  note          text,
  status        text not null default 'PENDING', -- PENDING|APPROVED|DENIED
  created_at    timestamptz not null default now()
);

-- Triggers to maintain updated_at
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end; $$ language plpgsql;

drop trigger if exists trg_user_profile_updated on user_profile;
create trigger trg_user_profile_updated before update on user_profile
for each row execute procedure set_updated_at();

drop trigger if exists trg_client_updated on client;
create trigger trg_client_updated before update on client
for each row execute procedure set_updated_at();

drop trigger if exists trg_workflow_updated on workflow;
create trigger trg_workflow_updated before update on workflow
for each row execute procedure set_updated_at();
```

### Row Level Security (RLS)

```sql
-- Enable RLS
alter table user_profile        enable row level security;
alter table client              enable row level security;
alter table workflow            enable row level security;
alter table client_workflow_access enable row level security;
alter table execution           enable row level security;
alter table execution_event     enable row level security;
alter table access_request      enable row level security;

-- Helper: get current user's client_id & role via user_profile
-- Policies assume every authenticated user has a user_profile row.

-- USER_PROFILE
create policy "users read self profile"
on user_profile for select
using (id = auth.uid());

create policy "admins read all profiles"
on user_profile for select
using ( exists (
  select 1 from user_profile up
  where up.id = auth.uid() and up.role = 'ADMIN'
));

create policy "admin manage profiles"
on user_profile for all
using ( exists (select 1 from user_profile up where up.id = auth.uid() and up.role = 'ADMIN') )
with check ( exists (select 1 from user_profile up where up.id = auth.uid() and up.role = 'ADMIN') );

-- CLIENT
create policy "admins read/write clients"
on client for all
using ( exists (select 1 from user_profile up where up.id = auth.uid() and up.role = 'ADMIN') )
with check ( exists (select 1 from user_profile up where up.id = auth.uid() and up.role = 'ADMIN') );

-- WORKFLOW
create policy "anyone read published workflows"
on workflow for select
using (is_published = true);

create policy "admins full access workflows"
on workflow for all
using ( exists (select 1 from user_profile up where up.id = auth.uid() and up.role = 'ADMIN') )
with check ( true );

-- CLIENT_WORKFLOW_ACCESS
create policy "admins manage access mappings"
on client_workflow_access for all
using ( exists (select 1 from user_profile up where up.id = auth.uid() and up.role = 'ADMIN') )
with check ( true );

-- EXECUTION (tenanted)
create policy "client read own executions"
on execution for select
using (
  exists (
    select 1 from user_profile up
    where up.id = auth.uid() and up.client_id = execution.client_id
  )
);

create policy "client create own executions"
on execution for insert
with check (
  exists (
    select 1 from user_profile up
    where up.id = auth.uid() and up.client_id = client_id
  )
);

-- Allow admin to read/write all executions
create policy "admin manage executions"
on execution for all
using ( exists (select 1 from user_profile up where up.id = auth.uid() and up.role = 'ADMIN') )
with check ( true );

-- EXECUTION_EVENT (derived from accessible executions)
create policy "read events of accessible executions"
on execution_event for select
using (
  exists (
    select 1
    from execution e
    join user_profile up on up.id = auth.uid()
    where e.id = execution_event.execution_id
      and (up.role = 'ADMIN' or up.client_id = e.client_id)
  )
);

create policy "write events via server key"
on execution_event for insert
to service_role
with check (true);

-- ACCESS_REQUEST
create policy "client create access request"
on access_request for insert
with check (
  exists (select 1 from user_profile up where up.id = auth.uid() and up.client_id = client_id)
);

create policy "client read own requests"
on access_request for select
using (
  exists (select 1 from user_profile up where up.id = auth.uid() and up.client_id = client_id)
);

create policy "admin manage requests"
on access_request for all
using ( exists (select 1 from user_profile up where up.id = auth.uid() and up.role = 'ADMIN') )
with check (true);
```

> **Auth sync:** On Supabase `auth.user` create, upsert `user_profile (id=email=auth values)`. Role/client assignments happen in Admin UI.

---

## 4) API (REST + Zod) — Using Supabase Client

**General pattern in route handlers (server only):**

```ts
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY); // for privileged ops if needed

// For user-scoped queries (respect RLS), use a client created with the user's access token/cookies.
```

### Workflows (Admin)

* `POST /api/workflows` → insert `workflow`
* `GET /api/workflows`

  * Admin: all (service role or admin check)
  * Client: `is_published = true`, with flag if assigned (`left join client_workflow_access`)
* `GET /api/workflows/:id`
* `PATCH /api/workflows/:id`
* `DELETE /api/workflows/:id`

**Example (insert):**

```ts
const { data, error } = await supabase
  .from('workflow')
  .insert([payload])
  .select()
  .single();
```

### Clients & Access (Admin)

* `POST /api/clients` → insert `client`
* `GET /api/clients` → list
* `GET /api/clients/:id` → with aggregates (counts via SQL view or `rpc`)
* `POST /api/clients/:id/access` → replace full set in `client_workflow_access`
* `POST /api/clients/:id/invite-user` (optional)

**Example (replace access set):**

```ts
// within a transaction -> do via Postgres function and call with supabase.rpc('set_client_access', {...})
```

Create a small RPC:

```sql
create or replace function set_client_access(p_client uuid, p_workflows uuid[])
returns void language plpgsql security definer as $$
begin
  delete from client_workflow_access where client_id = p_client;
  insert into client_workflow_access (client_id, workflow_id)
  select p_client, unnest(p_workflows);
end; $$;
```

Then:

```ts
await supabase.rpc('set_client_access', { p_client: clientId, p_workflows: workflowIds });
```

### Executions

* `POST /api/executions/start`

  1. Verify caller has access to `workflow_id` (join `client_workflow_access`)
  2. Insert `execution` (`PENDING` → `PROCESSING`)
  3. Enqueue BullMQ job `exec:start` with correlation payload (includes callback URL)
  4. Return `{ executionId }`

**Access check (user-scoped client):**

```ts
const hasAccess = await supabaseClient
  .from('client_workflow_access')
  .select('id', { count: 'exact', head: true })
  .eq('client_id', user.client_id)
  .eq('workflow_id', workflowId);
```

* `GET /api/executions/:id` → `select` respecting RLS
* `GET /api/executions/:id/stream` → SSE (see Realtime section)
* `GET /api/executions?...` → admin filter view
* `POST /api/executions/:id/cancel` (optional)

### Request Access (Client)

* `POST /api/requests/access` → insert into `access_request`

### n8n Callback (Server-to-Server)

* `POST /api/webhooks/n8n/callback`

  * Validate HMAC
  * Upsert `n8n_run_id` if provided
  * Insert `execution_event`
  * If terminal `status` present: update `execution` with `SUCCESS|ERROR`, set `output_payload`, `result_file_url`, `finished_at`

**Server insert with service role (bypasses RLS):**

```ts
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
await admin.from('execution_event').insert([{ execution_id, stage, message, raw: data }]);
```

Make updates **idempotent** (check existing status before finalize).

---

## 5) Realtime & Workers

### BullMQ Worker (`exec:start`)

* POST to `workflow.n8n_webhook_url` with correlation payload (execution_id, client_id, workflow_id, input, callback_url).
* Retry with exponential backoff (5 attempts).
* On final failure: set `execution.status='ERROR'`, `error_message`.

### SSE (`/api/executions/:id/stream`)

* **Option A (Redis Pub/Sub):** publish on `exec:{id}` whenever an event row is written or status changes; SSE handler subscribes and streams.
* **Option B (Supabase Realtime):** subscribe to `execution_event` and `execution` changes (row filters by execution_id); proxy events to SSE.

Client receives small JSON messages:

```json
{ "stage": "research", "message": "Collecting sources...", "ts": "2025-10-26T14:00:00Z", "status": "PROCESSING" }
```

---

## 6) Dynamic Forms (JSON Schema → shadcn/ui)

* Store schema in `workflow.input_schema`.
* Render fields: string/Input, number/Input[type=number], boolean/Checkbox, enum/Select, arrays/objects as nested groups.
* Validate input with **Zod** (server & client) and **reject unknown**.

---

## 7) Admin Dashboards & Metrics

* KPIs: executions today/week/month; success%, error%.
* Charts (Recharts): *Executions over time*, *Most used workflows*, *Most active clients*.
* Recent failures table with links.

**Tip:** Build Postgres **views** or **materialized views** for aggregation:

```sql
create or replace view v_executions_daily as
select date_trunc('day', started_at) as day, count(*) as total
from execution group by 1 order by 1;
```

---

## 8) Storage

* **Option A:** Supabase Storage (signed URLs).
* **Option B:** S3/MinIO with pre-signed URLs.

For Supabase Storage (current setup):

- Create a bucket named `workflow-icons` (or set `SUPABASE_WORKFLOW_ICON_BUCKET`).
- Ensure the service role key (`SUPABASE_SERVICE_ROLE_KEY`) is available to the server for uploads and signing.
- Icons are stored by path only; UI fetches signed URLs on demand with a 1-hour TTL.

Save final URL in `execution.result_file_url`.

---

## 9) Environment

```
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # server-only
SUPABASE_WORKFLOW_ICON_BUCKET=workflow-icons
DATABASE_URL=postgres://<supabase-connection-string>   # optional if needed by tools
REDIS_URL=redis://...
S3_BUCKET=...
S3_REGION=...
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
APP_TIMEZONE=Africa/Nairobi
N8N_HMAC_SECRET=...
RATE_LIMIT_EXEC_START_PER_MIN=10

# Email notifications (Resend)
RESEND_API_KEY=re_...           # Resend API key
RESEND_FROM_EMAIL=Anthem <noreply@anthem.agency>   # Sender address
```

---


## 11) Testing & Seed

* **Tests:** RBAC/RLS (authenticated client), Workflow CRUD, Access assignment, Execution lifecycle, SSE emissions, callback idempotency.
* **Seed:** SQL seed or route-based seed with service key:

  * Admin `admin@example.com` / `Admin@123` (set via Supabase auth)
  * Client “Acme Ltd”
  * Workflow “AI White Paper Generator” (published) with provided schema
  * Access for Acme
  * One success execution with dummy `result_file_url`

---

## 12) Acceptance Criteria (Unchanged)

* Admin can manage workflows/clients/access; clients can browse/run assigned workflows, stream progress, and download results.
* Executions tracked end-to-end with events and drill-down.
* Dashboard shows KPIs, charts, recent failures.
* RBAC & RLS enforced; inputs validated; rate-limited `start`.
* n8n callback HMAC-validated; idempotent finalization.

---

## 13) Example Supabase Calls (No ORM)

**Create execution (user-scoped client)**

```ts
const { data: exec, error } = await supabaseClient
  .from('execution')
  .insert([{ client_id: user.client_id, workflow_id, input_payload: input, status: 'PROCESSING' }])
  .select()
  .single();
```

**Append event (server)**

```ts
await admin.from('execution_event').insert([{
  execution_id: executionId,
  stage,
  message,
  raw: data ?? null
}]);
```

**Finalize success**

```ts
await admin.from('execution')
  .update({ status: 'SUCCESS', output_payload: output, result_file_url: download_url, finished_at: new Date().toISOString() })
  .eq('id', executionId)
  .in('status', ['PENDING','PROCESSING']); // idempotent guard
```

**List published workflows (client)**

```ts
const { data } = await supabaseClient
  .from('workflow')
  .select('*')
  .eq('is_published', true)
  .order('created_at', { ascending: false });
```

---

## 14) Epics for `TODO.md` 

1. **DB & RLS**

   * Apply SQL DDL + RLS policies
   * Create RPCs: `set_client_access`, optional aggregates/views
   * Seed baseline data

2. **Auth & Profiles**

   * Supabase Auth; `user_profile` upsert on first login
   * Admin role assignment flow

3. **Admin: Workflows**

   * CRUD via supabase-js; icon upload; JSON Schema editor

4. **Admin: Clients & Access**

   * Client CRUD; assign workflows via `rpc:set_client_access`

5. **Executions**

   * `POST /api/executions/start` (Zod + rate limit + enqueue)
   * BullMQ worker (webhook, retries, timeout)

6. **Callback & Events**

   * HMAC verify; insert events; finalize status + file URL

7. **Realtime (SSE)**

   * Redis or Supabase Realtime → SSE bridge
   * Client hook & UI progress

8. **Client UX**

   * `/overview`, `/catalog`, `/workflows`, `/workflows/:id/run` (schema→form)
   * `/executions` + `/history` details + download

9. **Dashboards**

   * KPI queries, charts, failures table

10. **Hardening**

    * Logs, error boundaries, pagination, rate limits, idempotency

---

## 15) Notes & Gotchas

* **RLS first:** Default all reads/writes through **user-scoped** supabase client to leverage RLS. Use **service role** only in trusted server routes (callbacks, seeds, admin jobs).
* **Transactions:** For multi-step atomic ops, prefer **Postgres functions** + `rpc()` (e.g., “replace access set”, “finalize execution if still processing”).
* **Idempotency:** Make callback updates conditional on current status.
* **Streaming hosts:** Keep SSE/worker on a long-lived Node runtime (or separate process) if your host limits open connections.
* **Rate limiting:** Use Redis tokens per `client_id` and per `workflow_id` on `/executions/start`.

---

### Appendix: Example JSON Schema (unchanged)

```json
{
  "title": "White Paper Inputs",
  "type": "object",
  "required": ["topic", "length"],
  "properties": {
    "topic": { "type": "string", "title": "Topic" },
    "length": { "type": "string", "title": "Length", "enum": ["short", "medium", "long"] },
    "tone": { "type": "string", "title": "Brand Voice", "enum": ["professional", "friendly", "technical"] },
    "outline_only": { "type": "boolean", "title": "Outline only?" }
  }
}
```

---
