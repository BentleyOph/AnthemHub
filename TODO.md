# TODO — Anthem Hub Implementation Plan

This file is the authoritative plan to implement the app described in README.md. It captures decisions, milestones, and concrete tasks we will track to completion.

## High-level Goals
- Sell and operate pre-built n8n automations as products.
- Admins manage workflows, clients, and access; monitor executions and metrics.
- Clients discover, run, and track assigned workflows; stream progress; download results.
- Strong security with Supabase Auth + Postgres RLS; HMAC-validated callbacks; rate limiting; idempotency.

## Technical Decisions (initial)
- Framework: Next.js 15 (App Router), React, TypeScript, TailwindCSS, shadcn/ui.
- Auth/DB: Supabase (supabase-js, no ORM). All user-scoped reads/writes go through user client to leverage RLS.
- Queue/Workers: BullMQ + Redis. Dedicated worker process at `workers/exec-start.ts`.
- Realtime (SSE): Supabase Realtime (subscribe to `execution` and `execution_event` row changes) and proxy to an SSE route.
- Storage: Supabase Storage (signed URLs) for simplicity. (S3 parity kept in utils for future switch.)
- Timezone: Use UTC in DB; format to `Africa/Nairobi` on read via app config.

## Environment
- Create `.env.local` with:
  - `SUPABASE_URL` / `SUPABASE_ANON_KEY` (client)
  - `SUPABASE_SERVICE_ROLE_KEY` (server-only)
  - `REDIS_URL`
  - `APP_TIMEZONE=Africa/Nairobi`
  - `N8N_HMAC_SECRET`
  - `RATE_LIMIT_EXEC_START_PER_MIN=10`
  - Optional S3 creds if switching from Supabase Storage

Checklist
- [ ] Add `.env.example` mirroring the README’s env list
- [ ] Add `@supabase/supabase-js`, `bullmq`, `ioredis`, `zod`, `recharts`
- [ ] Set up Tailwind + shadcn/ui components

## Status Sync — Supabase (Applied Schema)
Based on your provided SQL already run in Supabase:

- [x] Enums created: `role`, `exec_status`, `exec_source`
- [x] Tables created: `client`, `user_profile`, `workflow`, `client_workflow_access`, `execution`, `execution_event`, `access_request`
- [x] Indices created: `idx_execution_client_workflow_status`, `idx_execution_started_at`, `idx_execution_event_execution_timestamp`
- [x] Triggers: `set_updated_at()` + per-table `updated_at` triggers
- [x] RLS enabled + policies for all tables
- [x] RPC: `set_client_access`
- [x] Views/Aggregates: `v_executions_daily`, etc.
- [x] Seed data (pending)

Next actions
- [ ] Capture the applied DDL into `lib/sql/001_baseline.sql` for reproducibility
- [ ] Note: your `001_baseline.sql` already includes RLS/policies and views; splitting into `002`/`003` is optional and can be done later for readability
- [ ] Apply migrations in Supabase; verify RLS access with a user-scoped client

## Phase 0 — Project Scaffolding
Deliverables
- Minimal file and directory scaffolding aligned with README structure.

Tasks
- [x] Create directories: `app/admin`, `app/(client)/catalog`, `app/(client)/workflows`, `app/(client)/history`, `app/(client)/workflows/[id]`, `app/api`
- [x] Create directories: `lib/supabase`, `lib/auth`, `lib/queue`, `lib/storage`, `lib/schema`, `lib/sql`
- [x] Bootstrap `lib/supabase/{client,server}.ts`
- [x] Bootstrap `lib/auth/guards.ts` (role checks) and `lib/auth/session.ts`
- [x] Bootstrap `lib/queue/index.ts` and `workers/exec-start.ts`
- [x] Bootstrap `lib/storage/supabase.ts`
- [x] Bootstrap `lib/schema/{zod.ts,jsonschema.ts}` helpers
- [x] Place DDL/RLS/Views in `lib/sql/*.sql`

## Phase 1 — Database & RLS (SQL only)
Deliverables
- Pure SQL: types, tables, triggers, policies, RPCs, and views.
- Stored under `lib/sql/` and loadable via tooling or Supabase migrations.

Tasks
- [x] Create enums: `role`, `exec_status`, `exec_source`
- [x] Tables: `user_profile`, `client`, `workflow`, `client_workflow_access`, `execution`, `execution_event`, `access_request`
- [x] Indices (as in README)
- [x] Triggers: `set_updated_at()` + table triggers
- [x] Enable RLS on all tables
- [x] Policies matching README (admin and tenant-aware rules)
- [x] RPC: `set_client_access(p_client uuid, p_workflows uuid[])`
- [x] Views: `v_executions_daily` and any aggregates for dashboards
- [x] Seed SQL: admin user, demo client, demo workflow, access, one success execution

Acceptance
- [ ] Authenticated users can only see their own executions by RLS
- [ ] Admin can manage all entities
- [ ] Published workflows visible to all

## Phase 2 — Supabase Auth & Profile Sync
Deliverables
- User profile upsert/link to `auth.users` on first login.
- Role/client assignment flows accessible to admin.

Tasks
- [x] `lib/supabase/server.ts` and `lib/supabase/client.ts` helpers
- [x] On auth callback/session, ensure `user_profile` row exists (id=email=auth values)
- [x] Admin-only UI to set role and client mapping for users
- [x] Route guards/utilities in `lib/auth` (e.g., `requireAdmin`, `requireClient`)

Acceptance
- [x] New user signs in → profile row created; defaults to CLIENT
- [x] Admin can promote user to ADMIN and assign `client_id`

## Phase 3 — Admin: Workflows CRUD
Deliverables
- Admin UI to create, edit, publish workflows, upload icon, edit JSON schema.
- REST route handlers using supabase-js + Zod.

Tasks
- [ ] Pages under `app/admin/workflows` (list, create, edit, view)
- [ ] JSON Schema editor component with validation (Zod conversion helper in `lib/schema`)
- [ ] API routes: `POST/GET/PATCH/DELETE /api/workflows`, `GET /api/workflows/:id`
- [ ] Supabase Storage integration for `icon_url` (upload + signed URL)

Acceptance
- [ ] Admin can publish/unpublish and changes reflect in catalog
- [ ] Invalid schemas rejected server-side

## Phase 4 — Admin: Clients & Access
Deliverables
- Admin UI to manage clients and assign workflows via RPC.

Tasks
- [ ] Pages under `app/admin/clients` (list, create, details, access assignment)
- [ ] API routes: `POST/GET /api/clients`, `GET /api/clients/:id`
- [ ] API route: `POST /api/clients/:id/access` → calls `rpc:set_client_access`
- [ ] Optional: invite user endpoint `POST /api/clients/:id/invite-user`

Acceptance
- [ ] Access mapping replaces full set atomically
- [ ] Client details show aggregates (counts) if implemented

Feature Plan — matches requirements

Scope
- Onboarding: create a new client with `Name`, `Email`, `Company`.
- Access Control: assign specific workflows to each client via checklist/multi-select.
- Client-Specific View: per-client page with usage stats, execution history, and current access list.

Data model
- Tables: `client`, `workflow`, `client_workflow_access`, `execution`.
- Optional views/RPCs for aggregates:
  - `get_client_overview_kpis(client_id)` → `{ executions_7d, success_rate_7d, last_run_at, assigned_workflows }`.
  - `get_client_recent_executions(client_id, limit)` or query `execution` joined with `workflow`.

API design
- `POST /api/clients` — create client; body `{ name, email, company }`.
- `GET /api/clients` — list with `search`, `page`, `per_page`; include `assigned_workflows_count`.
- `GET /api/clients/:id` — detail + aggregates; include assigned workflow ids.
- `POST /api/clients/:id/access` — replace full set using `rpc:set_client_access({ p_client, p_workflows })`.
- Optional: `POST /api/clients/:id/invite-user` — send invite, pre-link `user_profile.client_id` after acceptance.

Tasks — UI: List page (`app/admin/clients`)
- [ ] Guard to ADMIN only (middleware + server checks).
- [ ] Table columns: Client Name, Company, Primary Email, Workflows (#), Created, Actions.
- [ ] Search input (name/company/email) + pagination.
- [ ] CTA “New Client” → modal/dialog with fields `Name`, `Email`, `Company`; Zod validation; create via API; navigate to details on success.
- [ ] Row action “View” to `/admin/clients/[id]`.

Tasks — UI: Details page (`app/admin/clients/[id]`)
- [ ] Header card: name, company, email, created date.
- [ ] KPIs: Executions (7d), Success rate (7d), Last run at, Assigned workflows count.
- [ ] Access assignment panel:
  - [ ] List all published workflows with checkboxes or multi-select; pre-select currently assigned.
  - [ ] “Save access” replaces set via `POST /api/clients/:id/access`; disable while saving; toast on success/failure.
  - [ ] Show chips/list of assigned workflows; include quick unassign action.
- [ ] Execution history panel:
  - [ ] Table (latest 20): Status, Workflow, Started, Duration, Result/Error link.
  - [ ] Link to Admin Executions page pre-filtered by this client.
- [ ] Optional: Contacts/users panel listing `user_profile` rows tied to this client; manage separately.

Tasks — API & server
- [ ] Implement list with search: `ilike` on `name`, `company`, `email`; order by `created_at DESC`.
- [ ] Include `assigned_workflows_count` via join/subquery.
- [ ] Implement details handler: fetch client row, assigned workflow ids, and KPI aggregates.
- [ ] Implement `set_client_access` RPC call; ensure transactional replace of mappings.
- [ ] Cache strategy: server components fetch with small revalidation window (e.g., 30–60s) or tag-based invalidation on access changes.

Permissions & RLS
- [ ] Admin-only for all `/api/clients*` and `/admin/clients*` routes.
- [ ] Use service role for `set_client_access` if RLS blocks admin through user-scoped client; otherwise ensure admin policies allow it.
- [ ] Never expose service role to the browser; all mutations occur on the server.

Acceptance
- [ ] Onboarding: creating a client inserts row and appears at top of list; redirect lands on details.
- [ ] Access control: saving updates mapping atomically; UI reflects new assignment on refresh; client users can now run only assigned workflows.
- [ ] Client-specific view: KPIs and recent executions reflect only that client; links navigate correctly to filtered executions.
- [ ] Non-admins redirected from UI and receive 403 on API.

### Phase 3A — Admin: Overview Dashboard (/admin/overview)
Deliverables
- Admin Overview dashboard matching the provided wireframe.
- Server data pipes (read-only) for metrics and charts.

Layout (desktop)
- Top metrics row (4 cards):
  - Total executions (today)
  - Success rate of executions
  - Active clients
  - Pending access requests
- Middle row:
  - Executions chart (Day/Week/Month toggle)
  - Most used workflows (top N by executions)
- Bottom row:
  - Recent executions table (last 20)
  - Most active clients (top N by executions)

Tasks
- [x] Sidebar: rename to “Anthem Agency”; nav items → Overview, Workflows, Executions, Clients, Access Requests
- [x] Replace dashboard content with purpose-built components
- [x] Implement `ExecutionsChart` with Day/Week/Month toggle (demo data)
- [x] Implement `OverviewCards`, `TopWorkflows`, `TopClients`, `RecentExecutions` (demo data)
- [x] Wire data from Supabase (no client exposure of secrets):
  - [x] Route guard: require ADMIN session at `app/admin/overview` (redirect CLIENTs)
  - [x] Data owner: fetch in server components or server-only loaders; never expose service role to client
  - [x] RLS: confirm RPC/view invoker can read needed tables as ADMIN; otherwise run on server with service-role key
  - [x] KPIs (OverviewCards):
    - [x] Call RPC `get_admin_overview_kpis()` using server Supabase client
    - [x] Map fields → cards: `executions_today`, `success_rate_7d`, `active_clients_today`, `pending_requests_count`
    - [x] Handle empty DB edge-cases (e.g., success rate defaults to 100 per SQL)
  - [x] Top Workflows (TopWorkflows):
    - [x] Call RPC `get_top_workflows({ limit_count: 5 })`
    - [ ] Display `name` and `executions`; link to workflow details if available
  - [x] Top Clients (TopClients):
    - [x] Call RPC `get_top_clients({ limit_count: 5 })`
    - [ ] Display `name` and `executions`; link to client details if available
  - [x] Recent Executions (RecentExecutions):
    - [x] Query view `v_execution_details` ordered by `started_at DESC` LIMIT 20
    - [x] Show columns: `status`, `workflow_name`, `client_name`, `started_at`, optional `error_message`
    - [ ] Link each row to execution details if route exists
  - [x] Executions Chart (ExecutionsChart):
    - [x] For Day: group executions by hour over last 24h
    - [x] For Week: group executions by day over last 7d
    - [x] For Month: group executions by day over last 30d
    - [x] Source data: prefer existing aggregates (e.g., `v_executions_daily`) if present; otherwise compute from `execution` or `v_execution_details`
  - [x] Loading + error states: skeletons for cards/lists; show toast or inline message on fetch failure
  - [x] Timezone + formatting: format timestamps to `Africa/Nairobi`
  - [x] Caching strategy: server-side revalidate every 30–60s or `no-store` for live metrics; tag-based revalidation optional
  - [x] Types: define TS shapes for RPC/view results; validate with Zod where props cross the RSC boundary
- [x] Observability: console/server logs for RPC failures (dev only); graceful fallbacks in UI
- [x] Access control: if user role = CLIENT → redirect to client overview (separate design)

Acceptance
- [ ] Desktop layout matches wireframe structure
- [ ] KPIs match manual SQL in Supabase for same windows
- [ ] Top workflows/clients lists reflect RPC output and are correctly sorted
- [ ] Recent executions show latest 20 with correct names/status/time
- [ ] Chart toggles (Day/Week/Month) switch datasets and totals align with table counts when windows overlap
- [ ] Admin-only access (middleware + server guards)

## Phase 5 — Catalog & Client UX
Deliverables
- Public catalog of published workflows; personal view of assigned workflows; run form.

Tasks
- [ ] Pages: `app/(client)/catalog`, `app/(client)/workflows`, `app/(client)/workflows/[id]/run`
- [ ] Dynamic form renderer from JSON Schema → shadcn/ui components
- [ ] Client-side Zod validation mirroring server schema
 - [ ] API: `POST /api/requests/access` (from workflow page if not assigned)
 - [ ] UI affordance to request access and track `access_request` status

Acceptance
- [ ] Only published appear in catalog; assigned flagged in list
- [ ] Run page renders proper controls for schema types

## Phase 6 — Execution Lifecycle
Deliverables
- Start execution API with RBAC, rate limit, and enqueue; details view and history.

Tasks
- [ ] API: `POST /api/executions/start`
  - [ ] Verify access via `client_workflow_access`
  - [ ] Zod-validate input against workflow.schema
  - [ ] Rate limit using Redis tokens per `client_id` and `workflow_id` (`RATE_LIMIT_EXEC_START_PER_MIN`)
  - [ ] Insert `execution(status=PROCESSING)` with input
  - [ ] Enqueue BullMQ job `exec:start` with correlation data and callback URL
- [ ] API: `GET /api/executions/:id` (respect RLS)
- [ ] API: `GET /api/executions` (admin filters)
- [ ] UI: `app/(client)/executions` and `app/(client)/history` execution details page with stream panel

Acceptance
- [ ] RLS enforced on fetches
- [ ] Starts are rate-limited and return executionId

## Phase 7 — Worker: BullMQ + n8n webhook
Deliverables
- Dedicated worker process posting to n8n webhook, retries, and early failure status.

Tasks
- [ ] `lib/queue/index.ts` → BullMQ init (Queue, Worker, QueueScheduler)
- [ ] `workers/exec-start.ts` → process jobs:
  - [ ] POST to `workflow.n8n_webhook_url` with payload { execution_id, client_id, workflow_id, input, callback_url }
  - [ ] Retries with exponential backoff (5 attempts)
  - [ ] On final failure, set `execution.status='ERROR'` and `error_message`
- [ ] Run script in `package.json` (e.g., `pnpm worker:exec`)

Acceptance
- [ ] Jobs retry and settle into ERROR on exhaustion

## Phase 8 — n8n Callback & Events
Deliverables
- Secure server-to-server callback with HMAC; inserts events and finalizes execution.

Tasks
- [ ] API: `POST /api/webhooks/n8n/callback`
  - [ ] Validate `X-Signature` using HMAC-SHA256 of raw body + `N8N_HMAC_SECRET`
  - [ ] Upsert/record `n8n_run_id` if present
  - [ ] Insert `execution_event` rows (service role client)
  - [ ] If terminal status provided: update `execution` to `SUCCESS|ERROR`, set `output_payload`, `result_file_url`, `finished_at`
  - [ ] Idempotency guard: only finalize if current status in `['PENDING','PROCESSING']`

Acceptance
- [ ] Malformed signature rejected
- [ ] Duplicate callbacks safe (no double-finalize)

## Phase 9 — Realtime (SSE via Supabase Realtime)
Deliverables
- Server-Sent Events endpoint that streams `execution_event` and `execution` updates for a given execution id.

Tasks
- [ ] API: `GET /api/executions/:id/stream` (Edge-friendly if possible)
- [ ] Server subscribes to Supabase Realtime changes for `execution_event` and `execution` filtered by `execution_id`
- [ ] Proxy each DB change to SSE client as small JSON messages
- [ ] Client hook `useExecutionStream(executionId)`
 - [ ] Authorization: verify requester can access `executionId` before opening stream; subscribe with service role only after authorization check

Acceptance
- [ ] Progress updates appear in near real-time during a run

## Phase 10 — Storage
Deliverables
- Uploads for icons and final result file URLs stored in Supabase Storage with signed URLs.

Tasks
- [ ] `lib/storage/supabase.ts` for uploads and URL signing
- [ ] Save final `result_file_url` on finalize (from callback or worker)
- [ ] Optional: abstracted interfaces to allow S3 switch later

Acceptance
- [ ] Result links are time-limited signed URLs

## Phase 11 — Dashboards & Metrics
Deliverables
- Admin dashboards for KPIs, charts, and recent failures.

Tasks
- [ ] Views or RPCs for daily counts, top workflows/clients
- [ ] Pages in `app/admin/overview`
- [ ] Recharts components for: Executions over time, Most used workflows, Most active clients
- [ ] Recent failures table with links to details

Acceptance
- [ ] Data loads efficiently; queries use views/indices

## Phase 12 — Hardening & Ops
Deliverables
- Production-ready concerns: errors, logging, pagination, limits.

Tasks
- [ ] Error boundaries and toast/reporting UX
- [ ] Pagination on all lists; server-side params validated by Zod
- [ ] Consistent server errors with problem details
- [ ] Rate limit on sensitive endpoints (already for `start`)
- [ ] Security review: avoid leaking service role to client; validate all inputs; enforce RLS

Acceptance
- [ ] Endpoint schemas documented; happy-path and failure-path verified

## Phase 13 — Testing & Seed
Deliverables
- Minimal but targeted tests for RBAC/RLS, CRUD, lifecycle, SSE, idempotency.

Tasks
- [ ] Seed script using service role to create baseline data
- [ ] Tests for: profile access, workflow CRUD, access assignment (RPC), execution lifecycle, callback idempotency
- [ ] Optional: Playwright e2e covering admin + client flows

Acceptance
- [ ] Tests pass locally with a configured Supabase project

## API Surface (authoritative list)
Admin
- [ ] `POST /api/workflows`
- [ ] `GET /api/workflows` (admin all)
- [ ] `GET /api/workflows/:id`
- [ ] `PATCH /api/workflows/:id`
- [ ] `DELETE /api/workflows/:id`
- [ ] `POST /api/clients`
- [ ] `GET /api/clients`
- [ ] `GET /api/clients/:id`
- [ ] `POST /api/clients/:id/access`
- [ ] `POST /api/clients/:id/invite-user` (optional)

Client
- [ ] `GET /api/workflows` (published; with assigned flag)
- [ ] `POST /api/executions/start`
- [ ] `GET /api/executions/:id`
- [ ] `GET /api/executions` (own history)
- [ ] `GET /api/executions/:id/stream` (SSE)
- [ ] `POST /api/requests/access`

Server-to-server
- [ ] `POST /api/webhooks/n8n/callback`

## UI Routes (App Router)
Admin
- [ ] `app/admin/overview`
- [ ] `app/admin/workflows` (list/create/edit)
- [ ] `app/admin/clients` (list/details/access)

Client
- [ ] `app/(client)/catalog`
- [ ] `app/(client)/workflows`
- [ ] `app/(client)/workflows/[id]/run`
- [ ] `app/(client)/history`
- [ ] `app/executions/[id]` (details)

## Non-Goals (initial)
- Multi-tenant org hierarchy beyond single `client` per user.
- GraphQL API (REST only for now).
- Advanced billing/subscription integration.

## Risks & Mitigations
- Long-lived SSE on serverless: prefer a Node runtime or route-specific config to keep connections stable.
- RLS complexity: keep all user reads/writes via user-scoped supabase client; centralize admin-only service role usage.
- Rate limiting correctness: per `client_id` and `workflow_id` token bucket in Redis; include tests.

## Definition of Done (project-level)
- All phases marked complete; acceptance in each phase met.
- README is updated with any deviations; TODO.md reflects final state.
- Seed runs cleanly; a demo workflow can be run end-to-end with streaming and downloadable result.
