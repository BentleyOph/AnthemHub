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
- [x] RPC: `approve_access_request(request_id uuid, admin_user_id uuid)` (SECURITY DEFINER)
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

- [x] Admin UI to manage clients and assign workflows via RPC.

Tasks

- [x] Pages under `app/admin/clients` (list, create, details, access assignment)
- [x] API routes: `POST/GET /api/clients`, `GET /api/clients/:id`
- [x] API route: `POST /api/clients/:id/access` → calls `rpc:set_client_access`
- [ ] Optional: invite user endpoint `POST /api/clients/:id/invite-user`

Acceptance

- [x] Access mapping replaces full set atomically
- [x] Client details show aggregates (counts) if implemented

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

- [x] Guard to ADMIN only (middleware + server checks).
- [x] Table columns: Client Name, Company, Primary Email, Workflows (#), Created, Actions.
- [x] Search input (name/company/email) + pagination.
- [x] CTA “New Client” → modal/dialog with fields `Name`, `Email`, `Company`; Zod validation; create via API; navigate to details on success.
- [x] Row action “View” to `/admin/clients/[id]`.

Tasks — UI: Details page (`app/admin/clients/[id]`)

- [x] Header card: name, company, email, created date.
- [x] KPIs: Executions (7d), Success rate (7d), Last run at, Assigned workflows count.
- [x] Access assignment panel:
  - [x] List all published workflows with checkboxes or multi-select; pre-select currently assigned.
  - [x] “Save access” replaces set via `POST /api/clients/:id/access`; disable while saving; toast on success/failure.
  - [x] Show chips/list of assigned workflows; include quick unassign action.
- [x] Execution history panel:
  - [x] Table (latest 20): Status, Workflow, Started, Duration, Result/Error link.
  - [x] Link to Admin Executions page pre-filtered by this client.
- [ ] Optional: Contacts/users panel listing `user_profile` rows tied to this client; manage separately.

Tasks — API & server

- [x] Implement list with search: `ilike` on `name`, `company`, `email`; order by `created_at DESC`.
- [x] Include `assigned_workflows_count` via join/subquery.
- [x] Implement details handler: fetch client row, assigned workflow ids, and KPI aggregates.
- [x] Implement `set_client_access` RPC call; ensure transactional replace of mappings.
- [ ] Cache strategy: server components fetch with small revalidation window (e.g., 30–60s) or tag-based invalidation on access changes.

Permissions & RLS

- [x] Admin-only for all `/api/clients*` and `/admin/clients*` routes.
- [x] Use service role for `set_client_access` if RLS blocks admin through user-scoped client; otherwise ensure admin policies allow it.
- [x] Never expose service role to the browser; all mutations occur on the server.

Acceptance

- [x] Onboarding: creating a client inserts row and appears at top of list; redirect lands on details.
- [x] Access control: saving updates mapping atomically; UI reflects new assignment on refresh; client users can now run only assigned workflows.
- [x] Client-specific view: KPIs and recent executions reflect only that client; links navigate correctly to filtered executions.
- [x] Non-admins redirected from UI and receive 403 on API.

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

### Phase 3B — Admin: Executions (/admin/executions)

Deliverables

- Admin executions list with robust server filtering and pagination.
- Interactive table with filters (workflow, status, client, date range, search) and sortable columns.
- Execution details view with input/output payloads and full event timeline (live updates for in-flight runs).

API design (read-only)

- `GET /api/executions` (admin sees all) with query params:
  - `page` (default 1), `per_page` (default 20, max 100)
  - `workflow_id` (uuid), `status` (enum), `client_id` (uuid)
  - `from` (ISO), `to` (ISO) filter by `started_at`
  - `q` (search by execution id prefix or n8n_run_id)
  - `sort` in {`started_at.desc` (default), `started_at.asc`, `duration.desc`, `duration.asc`}
- `GET /api/executions/:id` returns execution + workflow/client naming + payloads.
- `GET /api/executions/:id/events` returns paged event list (or fetch via details endpoint embed).
- Reuse `GET /api/executions/:id/stream` (Phase 9) for live timeline.

Tasks — Backend

- [ ] Validate admin role in handlers; never expose service role to browser.
- [ ] Implement query builder with safe defaults: time window capped (e.g., 90 days) if no filters.
- [ ] Offset pagination v1 (`page`, `per_page`); consider keyset later for large tables.
- [ ] Enforce max `per_page=100`; return `{ data, page, per_page, total, next_page }`.
- [ ] Filters: `workflow_id`, `status`, `client_id`, `started_at BETWEEN from/to`, `q` on `id` prefix or `n8n_run_id`.
- [ ] Sorting: default `started_at DESC`; allow select sort whitelist only.
- [ ] Performance: use existing indices (`idx_execution_client_workflow_status`, `idx_execution_started_at`).
- [ ] Shape rows with joins for names: `workflow.name`, `client.name`; avoid N+1.

Tasks — UI: List page (`app/admin/executions`)

- [ ] Guard route to ADMIN; server-fetch initial page with current query params.
- [ ] Filters: multi-select `workflow`, multi-select `status`, multi-select `client`, date range, search box.
- [ ] Data table columns: ID (short), Status badge, Workflow, Client, Started, Duration, Source, Result (link if present), Error (tooltip).
- [ ] Sort controls on Started/Duration; pagination controls (page size selector).
- [ ] URL state: reflect filters/sort/page in querystring; deep-linkable and shareable.
- [ ] Empty, loading, and error states; retain filters when reloading.
- [ ] Optional: CSV export of current filtered view (server-side, capped rows).
- [ ] Row click → navigate to `app/admin/executions/[id]`.

Tasks — UI: Details page (`app/admin/executions/[id]`)

- [ ] Header: status, workflow, client, started/finished, duration, source, n8n run id.
- [ ] Tabs: Timeline, Input, Output, Metadata.
- [ ] Timeline: paged list of `execution_event` entries; if status in `PENDING/PROCESSING` subscribe to SSE stream and append live events.
- [ ] Input/Output: pretty-printed JSON with copy/download; protect large payloads with collapse.
- [ ] Metadata: IDs, attempts, error message, result file link (signed URL), environment.
- [ ] Linkouts: Workflow details, Client details, open result file in new tab if available.

QA & Acceptance

- [ ] Admin can filter by workflow, status, client, and date range; combinations return correct counts.
- [ ] Pagination works with totals; no page loads exceed limits; sort stable under filters.
- [ ] Query state preserved in URL; refreshing keeps the same view.
- [ ] Details view loads payloads and events; live updates appear while processing.
- [ ] Non-admins receive 403 on API and redirects from UI.
- [ ] P95 list query < 200ms for 50k-row table under indexed filters (local benchmark).

### Phase 3C — Admin: Access Requests (/admin/access-requests)

Deliverables

- Simple admin list of access requests with actions to approve or reject.
- Columns: Date requested, Requester name/email, Client name, Workflow name, Actions (Approve, Reject).

Data model

- Source: `access_request` joined to `user_profile` (requester), `client`, and `workflow`.
- Show `created_at` (UTC → `Africa/Nairobi`), `status` (focus on Pending by default).

API design

- `GET /api/requests/access` — list with filters: `status=pending|approved|denied`, `client_id`, `workflow_id`, `page`, `per_page`.
- `POST /api/requests/access/:id/approve` — approve via RPC `approve_access_request`.
- `POST /api/requests/access/:id/reject` — reject with optional body `{ reason?: string }`.

Tasks — UI: List page (`app/admin/access-requests`)

- [x] Guard route to ADMIN only (server component + middleware).
- [x] Table with columns: Date, Requester (name + email), Client, Workflow, Actions.
- [x] Status tabs or filter chips: Pending (default), Approved, Denied.
- [x] Approve/Reject buttons per row with confirm dialog; disable while processing.
- [x] Empty, loading, and error states; skeleton on first load.
- [x] After action: optimistic update or revalidate via tag/path; toast on success/failure.
- [ ] Optional: search input (requester/client/workflow) and date range filter.

Tasks — API routes

- [x] Implement list handler with pagination and basic filters; order by `created_at DESC`.
- [x] Approve handler: verify ADMIN, then call RPC:
  - [x] `supabase.rpc('approve_access_request', { request_id: id, admin_user_id: session.user.id })`.
  - [x] Map function error "not found or already processed" to 409 Conflict (or treat as no-op with 200) and show friendly toast.
  - [x] On success, revalidate tags/paths for list and overview KPIs.
- [x] Reject handler: verify ADMIN; update `status = 'DENIED'` for pending requests.
- [x] Emit revalidation tag/event so UI refreshes counts (e.g., Overview KPIs).
- [ ] Persist rejection metadata once additional columns (e.g., `rejected_by`, `reason`) are introduced.

Permissions & RLS

- [x] The RPC is `SECURITY DEFINER`; it bypasses RLS for internal writes. Call it from a server route after verifying the user is ADMIN.
- [x] Restrict who can execute the RPC: either call with service-role key or `GRANT EXECUTE` only to `authenticated` plus app-side admin check.
- [x] All reads for admin list occur server-side; never expose service role to the browser.

Acceptance

- [x] Pending requests load with correct requester/client/workflow names and dates.
- [x] Approve path uses RPC `approve_access_request` and results in APPROVED status and access mapping present.
- [x] Reject marks request DENIED without granting access.
- [x] Only admins can view or act on requests; non-admins are redirected.
- [x] Overview KPI “Pending access requests” reflects updated counts after actions.

SQL follow-up (optional)

- [ ] Consider extending the function to record `approved_by` and `approved_at` using `admin_user_id` param.
- [ ] Ensure function has stable `search_path` (e.g., `SET search_path = public`) and proper grants.

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

### Phase 5A — Client: Overview Dashboard (My Workflows)

Deliverables

- Client overview page matching the provided sketch (image).
- Server-fed data for assigned workflows (hero cards), KPIs, recent activity, and discover rail.

Layout (desktop)

- Header: Company Name Dashboard.
- Top row — Assigned workflows (cards):
  - Three cards showing image/icon, name, short description, and a primary Run action.
  - Cards link to `app/(client)/workflows/[id]/run`. Optional “See all” link to full list.
- Metrics row — three KPI chips:
  - Executions (month)
  - Success rate (last 7–30d)
  - Time saved (est) — optional; see Data notes.
- Recent activity — table:
  - Columns: Workflow, Status, Started, Action (e.g., View/Run again).
- Discover — horizontal scroll rail:
  - Published workflows not yet assigned to this client; each card shows icon, name, and Request access CTA.
- Sidebar/nav: Anthem Agency brand; nav items → My Workflows, Catalog, Executions; this view highlights My Workflows.

Data & API

- Assigned workflows hero cards:
  - Fetch assigned via `GET /api/workflows` filtered to current client; order by last run or created; limit 3.
  - Include `icon_url`, `name`, `short_description` in shape.
- KPIs:
  - Prefer RPC `get_client_overview_kpis(client_id)` returning `executions_7d`, `success_rate_7d`, `last_run_at`, `assigned_workflows`.
  - Executions (month): count of `execution.started_at` in current calendar month for this client.
  - Time saved (est): if `workflow.estimated_minutes_saved` exists, compute sum over successful executions in last 30d; otherwise hide or show 0.
- Recent activity table:
  - `GET /api/executions?limit=10` (RLS ensures only this client’s data). Columns as above.
- Discover rail:
  - `GET /api/workflows` for published minus assigned; cards surface Request access → `POST /api/requests/access`.
- All data fetched server-side with the user-scoped Supabase client (no service-role in browser).

UX states

- Skeletons for hero cards, KPIs, table rows, and discover rail.
- Empty states when no assigned workflows or recent activity.
- Toasts for API errors and request-access success/failure.

Acceptance

- Layout matches the sketch: top assigned cards with Run, KPI row, Recent activity table, and Discover rail.
- Run buttons deep-link to `app/(client)/workflows/[id]/run` and respect access.
- Request access flow creates `access_request` and reflects a “Requested” state while pending.
- KPI values match manual SQL for the same windows.
- Desktop matches sketch; mobile stacks sections vertically with horizontal scroll for Discover.

### Phase 5B — Client: Executions (/executions)

Deliverables

- [x] A simple, RLS-safe history page listing only the signed-in client’s past executions.
- [x] Clear status indicators and a Results action: Download when a file was produced; otherwise View Details.

Layout (desktop)

- Header: “Executions” + short helper text.
- Table (paginated):
  - Columns: Date (Started), Workflow Name, Status, Result.
  - Optional: Duration (if available) as a right-aligned column.
- Row actions:
  - Primary: row click opens `/executions/[id]` (details with events and payloads).
  - Result cell: “Download” if `result_file_url` is present; else “View Details”.

Data & API

- Fetch in a server component using the user-scoped Supabase client (leverages RLS; no service-role in the browser).
- Source: `execution` joined with `workflow` by `workflow_id`.
- Fields needed: `id`, `workflow_id`, `status`, `started_at`, `finished_at`, `result_file_url`, `workflow.name`.
- Default sort: `started_at DESC`.
- Pagination: `page` + `per_page` (20 default). Keep URLs shareable via query params.
- Status mapping (display labels):
  - PROCESSING/PENDING → “Processing”
  - SUCCESS → “Complete”
  - ERROR → “Failed”
- Timezone: format `started_at` using `APP_TIMEZONE`.
- Downloads:
  - If `result_file_url` is a storage path, sign via server utility in `lib/storage/supabase.ts`.
  - If already a full URL, link directly with `target="_blank"`.

UX states

- Loading skeleton for table rows.
- Empty state with a short message and a link to “My Workflows” to run one.
- Error state with retry.
- Accessibility: table headers scoped, focus-visible styles, button labels include workflow name.

Permissions & RLS

- RLS policy “client read own executions” guarantees only the current client’s rows are returned.
- All reads made with user-scoped Supabase client. No admin/service keys in this page.

Routing & Links

- List page: `app/(client)/executions`.
- Details page: `app/executions/[id]` (shared, RLS-protected view). Link every row and Result → View Details when no download.

Performance

- Query with `eq(client_id, profile.clientId)` and order by `started_at DESC` (index: `idx_execution_started_at`).
- Select only needed fields; avoid N+1 by joining `workflow (id, name)` in a single call.

Acceptance

- [x] Page shows only the signed-in client’s executions with correct workflow names and statuses.
- [x] “Download” appears only when a `result_file_url` exists and opens a valid file; otherwise “View Details” navigates to the execution details page.
- [x] Pagination works and preserves filters/sort via URL params.
- [x] Timestamps respect configured timezone; statuses use friendly labels and badges.
- [x] No data is visible across clients (validated via manual RLS checks).

## Phase 6 — Execution Lifecycle

Deliverables

- Start execution API with RBAC, rate limit, and enqueue; details view and history.

Tasks

- [x] API: `POST /api/executions/start`
  - [x] Verify access via `client_workflow_access`
  - [x] Zod-validate input against workflow.schema
  - [x] Rate limit using Redis tokens per `client_id` and `workflow_id` (`RATE_LIMIT_EXEC_START_PER_MIN`)
  - [x] Insert `execution(status=PROCESSING)` with input
  - [x] Enqueue BullMQ job `exec:start` with correlation data and callback URL
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

- [x] `lib/queue/index.ts` → BullMQ init (Queue, Worker, QueueScheduler)
- [x] `workers/exec-start.ts` → process jobs:
  - [x] POST to `workflow.n8n_webhook_url` with payload { execution_id, client_id, workflow_id, input, callback_url }
  - [x] Retries with exponential backoff (5 attempts)
  - [x] On final failure, set `execution.status='ERROR'` and `error_message`
- [x] Run script in `package.json` (e.g., `pnpm worker:exec`)

Acceptance

- [x] Jobs retry and settle into ERROR on exhaustion

## Phase 8 — n8n Callback & Events

Deliverables

- Secure server-to-server callback with HMAC; inserts events and finalizes execution.

Tasks

- [x] API: `POST /api/webhooks/n8n/callback`
  - [ ] Validate `X-Signature` using HMAC-SHA256 of raw body + `N8N_HMAC_SECRET`(TO BE DONE LATER AFTER MVP NOT NOW)
  - [x] Upsert/record `n8n_run_id` if present
  - [x] Insert `execution_event` rows (service role client)
  - [x] If terminal status provided: update `execution` to `SUCCESS|ERROR`, set `output_payload`, `result_file_url`, `finished_at`
  - [x] Idempotency guard: only finalize if current status in `['PENDING','PROCESSING']`

Acceptance

- [ ] Malformed signature rejected
- [ ] Duplicate callbacks safe (no double-finalize)

## Phase 9 — Realtime (SSE via Supabase Realtime)

Deliverables

- Server-Sent Events endpoint that streams `execution_event` and `execution` updates for a given execution id.

Tasks

- [x] API: `GET /api/executions/:id/stream` (Edge-friendly if possible)
- [x] Server subscribes to Supabase Realtime changes for `execution_event` and `execution` filtered by `execution_id`
- [x] Proxy each DB change to SSE client as small JSON messages
- [x] Client hook `useExecutionStream(executionId)`
- [x] Authorization: verify requester can access `executionId` before opening stream; subscribe with service role only after authorization check

Acceptance

- [x] Progress updates appear in near real-time during a run

## Phase 10 — Storage (Workflow Icons Only)

Deliverables

- Workflow icon uploads stored in Supabase Storage bucket `workflow-icons`.
- Icons are served via time-limited signed URLs and refreshed when needed.
- Admin create/edit flows support upload and removal; DB stores only the object path.

Tasks

- [x] Storage client: ensure `lib/storage/supabase.ts` supports icon upload + `createSignedUrl`.
- [x] API (admin): `POST /api/workflows` and `PATCH /api/workflows/:id` accept `multipart/form-data` with `icon`; store object path in `workflow.icon_url`; support `removeIcon`.
- [x] Admin list/detail: resolve `icon_url` to signed URL before returning to UI.
- [x] Client surfaces: resolve `icon_url` to signed URL for catalog, overview, workflows list, run/executions pages.
- [x] Validation: restrict uploads to images (png/jpg/svg/webp), add size limit (e.g., 2MB), and sanitize filenames.
- [x] Config: document `SUPABASE_WORKFLOW_ICON_BUCKET=workflow-icons` and required env (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`), plus bucket creation in Supabase.
- [x] Optional: centralize icon signing helper to avoid duplication across admin/client loaders.

Acceptance

- [x] Creating a workflow with an icon uploads to `workflow-icons` and displays via signed URL.
- [x] Editing supports replacing or removing the icon; changes reflect in admin and client views.
- [x] All user-visible icon URLs are signed with a reasonable TTL and still render after refresh.

## Phase 11 — Hardening & Ops

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

## Phase 12 — Testing & Seed

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
- [ ] `POST /api/requests/access/:id/approve` (calls `rpc:approve_access_request`)
- [ ] `POST /api/requests/access/:id/reject`

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
- [ ] `app/admin/executions`
- [ ] `app/admin/executions/[id]`
- [ ] `app/admin/workflows` (list/create/edit)
- [ ] `app/admin/clients` (list/details/access)

Client

- [ ] `app/(client)/catalog`
- [ ] `app/(client)/workflows` (overview dashboard)
- [ ] `app/(client)/workflows/[id]/run`
- [x] `app/(client)/executions`
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
