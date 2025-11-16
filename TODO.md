Nice, presets route is a clean choice. Here’s how I’d wire **timer-based workflows** into your existing setup.

---

## 1️⃣ SQL: New tables for presets & schedules

These fit into your existing schema (Postgres + Supabase, `public` schema, `set_updated_at()` trigger, etc.).

### 1. `workflow_preset`

A preset = “this workflow + this client + this default input JSON”.

```sql
-- Presets: bind a workflow + client + default input payload
create table if not exists public.workflow_preset (
  id uuid primary key default gen_random_uuid(),

  -- Links
  workflow_id uuid not null
    references public.workflow(id) on delete cascade,
  client_id uuid not null
    references public.client(id) on delete cascade,

  -- Human facing
  name text not null,
  description text,

  -- Default payload sent to n8n for this preset
  input_payload jsonb not null default '{}'::jsonb,

  -- Audit
  created_by uuid
    references public.user_profile(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Helpful indexes
create index if not exists idx_workflow_preset_client_workflow
  on public.workflow_preset (client_id, workflow_id);

create index if not exists idx_workflow_preset_workflow
  on public.workflow_preset (workflow_id);

-- Reuse your generic updated_at trigger
drop trigger if exists trg_workflow_preset_updated on public.workflow_preset;
create trigger trg_workflow_preset_updated
before update on public.workflow_preset
for each row execute procedure public.set_updated_at();

alter table public.workflow_preset enable row level security;
```

> RLS: add policies later mirroring `client_workflow_access` / `execution`:
>
> * admins: full CRUD
> * clients: read-only of rows where `client_id = profile.client_id`

---

### 2. `workflow_schedule`

A schedule = “run this preset on this cron, in this timezone, via BullMQ repeat jobs”.

```sql
-- Schedules: run a preset on a cron pattern
create table if not exists public.workflow_schedule (
  id uuid primary key default gen_random_uuid(),

  workflow_preset_id uuid not null
    references public.workflow_preset(id) on delete cascade,

  -- Display name, e.g. "Every 30 minutes" or "Daily at 9am"
  name text not null,

  -- Cron expression (5-part or 6-part, same style as BullMQ)
  cron_expr text not null,

  -- IANA timezone, defaulting to your app's default (can override per schedule)
  timezone text not null default 'Africa/Nairobi',

  -- Whether this schedule should currently fire
  is_active boolean not null default true,

  -- BullMQ repeat job key so we can cancel/update it later
  repeat_job_key text unique,

  -- For UI/debug only
  last_run_at timestamptz,
  next_run_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workflow_schedule_preset
  on public.workflow_schedule (workflow_preset_id);

create index if not exists idx_workflow_schedule_active_next
  on public.workflow_schedule (is_active, next_run_at);

drop trigger if exists trg_workflow_schedule_updated on public.workflow_schedule;
create trigger trg_workflow_schedule_updated
before update on public.workflow_schedule
for each row execute procedure public.set_updated_at();

alter table public.workflow_schedule enable row level security;
```

Same RLS idea:

* Admins: full CRUD on `workflow_schedule`
* Clients: read-only where `workflow_preset.client_id = profile.client_id` (can be done via `using` with a join or a `client_id` denormalized later if you want).

---

## 2️⃣ High-level concept (what we’re building)

* **Manual runs** (current behavior):
  Client fills the JSON-schema-driven form ➝ `POST /api/executions/start` ➝ one `execution` row ➝ BullMQ `exec:start` ➝ n8n webhook.

* **New scheduled runs (timer-based)**:

  1. Admin defines **preset**:

     * picks `workflow` + `client`
     * sets `input_payload` JSON (default input)
  2. Admin defines **schedule** on that preset:

     * `cron_expr`, `timezone`, `name`, `is_active`
  3. Backend registers a **BullMQ repeat job** per `workflow_schedule`.
  4. When the repeat job fires:

     * Worker loads schedule + preset
     * Inserts an `execution` row with `source = 'SYSTEM'::exec_source`
     * Enqueues a normal `exec:start` job with payload identical to manual runs
  5. n8n receives the webhook exactly as usual, calls back via your existing callback route.

So any workflow that can run from the UI can also be **“cronnable”** by attaching one or more presets + schedules.

---

## 3️⃣ Implementation plan (for Codex / AI agent)

I’ll break this down in steps with explicit files & responsibilities.

---

### Step 1 — Apply DB changes & regenerate types

1. **Add migration** in `supabase/migrations/.../sql/`:

   * Create new migration file, e.g.
     `supabase/migrations/20251115120000_scheduled_workflows.sql`
   * Paste the two `create table` blocks above.

2. **Run migration** locally via Supabase CLI.

3. **Regenerate TS types** for Supabase:

   ```bash
   npx supabase gen types typescript \
     --project-id "$SUPABASE_PROJECT_ID" \
     --schema public \
     > lib/supabase/types.ts
   ```

   (Or whatever path you already use.) 

---

### Step 2 — Data layer: presets & schedules

All of this lives server-side, using the **service-role Supabase client**, like you do in `lib/admin/workflows/data.ts`.

#### 2.1. Admin data: presets/schedules API (library layer)

Create new file:

* `lib/admin/workflows/presets.ts` (or extend `data.ts` if you prefer).

Implement functions:

```ts
// Pseudo-types
export type WorkflowPreset = {
  id: string;
  name: string;
  description: string | null;
  clientId: string;
  clientName: string;
  workflowId: string;
  inputPayload: unknown;  // jsonb
  createdAt: string;
};

export type WorkflowSchedule = {
  id: string;
  name: string;
  cronExpr: string;
  timezone: string;
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
};

export type WorkflowPresetWithSchedules = WorkflowPreset & {
  schedules: WorkflowSchedule[];
};
```

**Functions:**

1. `listWorkflowPresetsForWorkflow(workflowId: string): Promise<WorkflowPresetWithSchedules[]>`

   * Query:

     ```ts
     const supabase = await getSupabaseServiceRoleClient();

     const { data, error } = await supabase
       .from("workflow_preset")
       .select(`
         id,
         name,
         description,
         input_payload,
         created_at,
         workflow_id,
         client:client (
           id,
           name
         ),
         schedules:workflow_schedule (
           id,
           name,
           cron_expr,
           timezone,
           is_active,
           last_run_at,
           next_run_at
         )
       `)
       .eq("workflow_id", workflowId)
       .order("created_at", { ascending: true });
     ```

   * Map to `WorkflowPresetWithSchedules` types (snake_case ➝ camelCase).

2. `createWorkflowPreset(input)`:

   * Validate that `client_workflow_access` exists for `(client_id, workflow_id)` before insert. 
   * Insert row into `workflow_preset` with:

     * `created_by` = current admin user id (from `requireAdminSession`).
     * `input_payload` = validated JSON.

3. `updateWorkflowPreset(id, input)`:

   * Update `name`, `description`, `input_payload`.

4. `deleteWorkflowPreset(id)`:

   * Delete row by id (cascades to schedules).

5. `createWorkflowSchedule(presetId, payload)`:

   * `payload`: `{ name, cronExpr, timezone }`.

   * Validate cron & timezone using `cron-parser`:

     ```ts
     import cronParser from "cron-parser";

     const interval = cronParser.parseExpression(cronExpr, { tz: timezone });
     const nextRun = interval.next().toDate();
     ```

   * Insert into `workflow_schedule` with `next_run_at = nextRun`, `is_active = true`.

   * **After insert**, call helper to register BullMQ repeat job and save `repeat_job_key` (more in Step 3).

6. `updateWorkflowSchedule(id, payload)`:

   * Update `name`, `cron_expr`, `timezone`, `is_active`.
   * Recompute `next_run_at`.
   * If cron/timezone/is_active changed:

     * Remove previous repeat job (`repeat_job_key`).
     * Register a new repeat job and update `repeat_job_key`.

7. `deleteWorkflowSchedule(id)`:

   * Load schedule to get `repeat_job_key`.
   * Remove repeat job.
   * Delete DB row.

> Note: all BullMQ interactions will go through a shared helper in `lib/queue/schedules.ts` to avoid circular imports.

---

### Step 3 — Scheduler worker & BullMQ glue

You already have an execution worker: `workers/exec-start.ts` and `lib/queue/index.ts`.

Now we add a **schedule worker** that:

* owns one repeat job per `workflow_schedule`
* creates new `execution` rows
* enqueues standard `exec:start` jobs

#### 3.1. Extend `lib/queue/index.ts`

Add a second queue for schedules:

```ts
// lib/queue/index.ts

export const EXEC_QUEUE_NAME = "exec:start";
export const SCHEDULE_QUEUE_NAME = "workflow:schedule";

export type ScheduleJob = {
  scheduleId: string;
};

let scheduleQueue: Queue<ScheduleJob> | null = null;
let scheduleWorker: Worker<ScheduleJob> | null = null;
let scheduleQueueScheduler: QueueScheduler | null = null;

export function getScheduleQueue() {
  if (scheduleQueue) return scheduleQueue;

  const connection = getRedisConnection(); // same helper you use now
  scheduleQueue = new Queue<ScheduleJob>(SCHEDULE_QUEUE_NAME, { connection });
  scheduleQueueScheduler = new QueueScheduler(SCHEDULE_QUEUE_NAME, { connection });

  return scheduleQueue;
}

export function createScheduleWorker(
  processor: (job: Job<ScheduleJob>) => Promise<void>,
) {
  if (scheduleWorker) return scheduleWorker;

  const connection = getRedisConnection();
  scheduleWorker = new Worker<ScheduleJob>(SCHEDULE_QUEUE_NAME, processor, {
    connection,
    concurrency: 5,
  });

  scheduleWorker.on("error", (err) => {
    console.error("[schedule-worker] Error", err);
  });

  return scheduleWorker;
}
```

#### 3.2. Helper for registering / removing repeat jobs

Create `lib/queue/schedules.ts`:

```ts
import type { Job } from "bullmq";
import cronParser from "cron-parser";
import { getScheduleQueue } from "./index";

export async function registerScheduleJob(args: {
  scheduleId: string;
  cronExpr: string;
  timezone: string;
}): Promise<string> {
  const queue = getScheduleQueue();

  // Validate cron/timezone (defensive, though already done)
  cronParser.parseExpression(args.cronExpr, { tz: args.timezone });

  const job = await queue.add(
    "schedule:tick",
    { scheduleId: args.scheduleId },
    {
      repeat: {
        pattern: args.cronExpr,
        tz: args.timezone,
      },
      removeOnComplete: true,
      removeOnFail: true,
    },
  );

  // In BullMQ, repeatable jobs expose a repeatJobKey
  const repeatKey = job.repeatJobKey!;
  return repeatKey;
}

export async function removeScheduleJob(repeatJobKey: string) {
  const queue = getScheduleQueue();
  await queue.removeRepeatableByKey(repeatJobKey);
}
```

Then in the data layer functions:

* After creating a schedule, call `registerScheduleJob`, then `update workflow_schedule set repeat_job_key = ...`.
* Before updating / deleting, if `repeat_job_key` exists, call `removeScheduleJob`.

#### 3.3. New worker script: `workers/run-schedule-worker.ts`

Create `workers/run-schedule-worker.ts`:

```ts
import { Job } from "bullmq";
import { createScheduleWorker, getExecutionQueue } from "@/lib/queue";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { ScheduleJob } from "@/lib/queue";
import cronParser from "cron-parser";

async function processScheduleJob(job: Job<ScheduleJob>) {
  const { scheduleId } = job.data;
  const supabase = await getSupabaseServiceRoleClient();

  // 1) Load schedule + preset + workflow + client
  const { data: schedule, error } = await supabase
    .from("workflow_schedule")
    .select(`
      id,
      name,
      cron_expr,
      timezone,
      is_active,
      workflow_preset:workflow_preset (
        id,
        input_payload,
        workflow:workflow (
          id,
          n8n_webhook_url
        ),
        client:client (
          id
        )
      )
    `)
    .eq("id", scheduleId)
    .maybeSingle();

  if (error || !schedule) {
    console.error("[schedule-worker] Schedule not found or error", error);
    return;
  }

  if (!schedule.is_active) {
    // Don't run inactive schedules
    return;
  }

  const preset = schedule.workflow_preset;
  if (!preset || !preset.workflow || !preset.client) {
    console.error("[schedule-worker] Schedule missing preset/workflow/client", {
      scheduleId,
    });
    return;
  }

  const workflowId = preset.workflow.id;
  const clientId = preset.client.id;
  const inputPayload = preset.input_payload ?? {};

  // 2) Insert execution row with source = SYSTEM
  const { data: execRow, error: execError } = await supabase
    .from("execution")
    .insert({
      workflow_id: workflowId,
      client_id: clientId,
      input_payload: inputPayload,
      status: "PROCESSING",
      source: "SYSTEM",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (execError || !execRow) {
    console.error("[schedule-worker] Failed to insert execution", execError);
    return;
  }

  const executionId = execRow.id;

  // 3) Enqueue normal exec:start job
  const execQueue = getExecutionQueue();

  const callbackUrl = new URL(
    "/api/webhooks/n8n/callback",
    process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL,
  ).toString();

  await execQueue.add("exec:start", {
    executionId,
    workflowId,
    clientId,
    input: inputPayload,
    callbackUrl,
    startedByUserId: "system", // or preset.created_by if you want
  });

  // 4) Update last_run_at & next_run_at
  try {
    const interval = cronParser.parseExpression(schedule.cron_expr, {
      tz: schedule.timezone,
    });
    const next = interval.next().toDate().toISOString();

    await supabase
      .from("workflow_schedule")
      .update({
        last_run_at: new Date().toISOString(),
        next_run_at: next,
      })
      .eq("id", scheduleId);
  } catch (err) {
    console.error("[schedule-worker] Failed to compute next_run_at", err);
    await supabase
      .from("workflow_schedule")
      .update({ last_run_at: new Date().toISOString(), next_run_at: null })
      .eq("id", scheduleId);
  }
}

// Bootstrap worker
createScheduleWorker(processScheduleJob);
console.log("[schedule-worker] Started.");
```

Add script to `package.json`:

```json
"scripts": {
  "worker:exec": "tsx workers/run-exec-worker.ts",
  "worker:schedule": "tsx workers/run-schedule-worker.ts"
}
```

Run both workers in your PM2 / systemd / Docker setup.

---

### Step 4 — Admin UI changes

We want admins to:

* Create presets for a workflow + client.
* Create/update/delete schedules for a preset.
* See upcoming runs.

Admin workflow detail page is at `app/admin/workflows/[id]/page.tsx`. 

#### 4.1. Fetch presets & schedules on admin workflow detail

In `app/admin/workflows/[id]/page.tsx`:

* Import new data helper:

  ```ts
  import { listWorkflowPresetsForWorkflow } from "@/lib/admin/workflows/presets";
  ```

* After loading `workflow`:

  ```ts
  const presets = await listWorkflowPresetsForWorkflow(workflowId);
  ```

* Below the existing two cards (metadata + schema overview), add a third section:

  ```tsx
  <Card>
    <CardHeader>
      <CardTitle>Presets & schedules</CardTitle>
      <CardDescription>
        Define default inputs and timers for this workflow per client.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <WorkflowSchedulingPanel workflowId={workflowId} presets={presets} />
    </CardContent>
  </Card>
  ```

Create new component:

* `components/admin/workflows/workflow-scheduling-panel.tsx`

Responsibilities:

* Render:

  * **Table of presets**:

    * Columns: Preset name, Client, Description (shortened), Schedules count, Actions.
  * **Per preset**, a nested list of schedules:

    * `name`
    * `cron_expr`
    * `timezone`
    * `is_active`
    * `last_run_at` / `next_run_at` formatted with `APP_TIMEZONE`.

* Actions:

  * **Create preset**:

    * Button “New preset”

    * Opens modal:

      * Select client (dropdown of clients that have `client_workflow_access` for this workflow — query from `/api/clients` and hide those without access, or provide only assigned clients from `getClientDetail`).
      * `name`, `description`
      * `input_payload` JSON editor:

        * Start with `jsonSchemaDefaultValues(workflow.inputSchema)` or `{}` as convenience.
        * Validate JSON before POST.

    * Submit to `POST /api/admin/workflows/[id]/presets` (new route).

  * **Edit preset**:

    * Button “Edit preset”
    * Allows updating `name`, `description`, `input_payload`.

  * **Delete preset**:

    * Confirm, then `DELETE /api/admin/workflow-presets/[id]`.

  * **Add schedule** (per preset):

    * Button “Add schedule”
    * Fields: `name`, `cron_expr`, `timezone`, `is_active`.
    * `cron_expr` helper with example dropdown:

      * “Every 30 minutes” → `*/30 * * * *`
      * “Every hour” → `0 * * * *`
      * “Daily at 09:00” → `0 9 * * *`
    * POST to `/api/admin/workflow-schedules` with `{ presetId, ... }`.

  * **Toggle active**:

    * Switch for `is_active` → calls `PATCH /api/admin/workflow-schedules/[id]`.

  * **Delete schedule**:

    * Confirm → `DELETE /api/admin/workflow-schedules/[id]`.

UX details:

* Use same UI kit (Card, Table, Button, Badge) as other admin screens. 
* Show friendly labels like:

  * `source: SYSTEM` as “Scheduled” in the executions UI (that already displays `source`). 

#### 4.2. Admin API routes

Create routes under `app/api/admin/workflows`:

1. `app/api/admin/workflows/[id]/presets/route.ts`

   * `POST` (create preset):

     * `requireAdminSession()`.
     * Validate body with Zod:

       ```ts
       z.object({
         clientId: z.string().uuid(),
         name: z.string().min(2),
         description: z.string().max(2000).optional(),
         inputPayload: z.record(z.any()).default({}),
       });
       ```
     * Call `createWorkflowPreset`.
     * Return `201` + new preset.

   * `GET` (optional; you already load via data helper, can skip route).

2. `app/api/admin/workflow-presets/[id]/route.ts`

   * `PATCH` → `updateWorkflowPreset`
   * `DELETE` → `deleteWorkflowPreset`

3. `app/api/admin/workflow-schedules/route.ts`

   * `POST` → `createWorkflowSchedule`

4. `app/api/admin/workflow-schedules/[id]/route.ts`

   * `PATCH` → `updateWorkflowSchedule` (name, cronExpr, timezone, isActive)
   * `DELETE` → `deleteWorkflowSchedule`

Error handling pattern: follow your existing `/api/clients` and `/api/requests/access` routes.

---

### Step 5 — Client UI changes

We’re not giving clients control over schedules (for now), but they should be aware of automation.

Client workflow run page: `app/(client)/workflows/[id]/run/page.tsx`. 

#### 5.1. Extend `getWorkflowRunData`

In `lib/client/workflow-run.ts`, extend the query:

* Currently it loads:

  * `workflow`
  * `hasAccess`
  * `request`
  * `assignedAt`
  * `profile`



* Add `presets/schedules` for this workflow **and** this client:

  ```ts
  const { data: presets, error: presetError } = await supabase
    .from("workflow_preset")
    .select(`
      id,
      name,
      description,
      input_payload,
      workflow_schedule (
        id,
        name,
        cron_expr,
        timezone,
        is_active,
        last_run_at,
        next_run_at
      )
    `)
    .eq("workflow_id", workflowId)
    .eq("client_id", profile.clientId);
  ```

* Add to return type:

  ```ts
  presets: Array<{
    id: string;
    name: string;
    description: string | null;
    schedules: Array<...>;
  }>;
  ```

#### 5.2. Render schedule info on client run page

In `app/(client)/workflows/[id]/run/page.tsx`:

* After the header (workflow title, description, badges), add a “Scheduling” section inside the card:

  ```tsx
  {presets.length > 0 ? (
    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
      <span className="font-medium">Scheduled runs</span>
      {presets.flatMap((preset) =>
        preset.schedules.map((schedule) => (
          <div key={schedule.id} className="flex flex-wrap gap-2">
            <span>{schedule.name}</span>
            <span>·</span>
            <span>cron: {schedule.cronExpr}</span>
            <span>·</span>
            <span>
              next:{" "}
              {schedule.nextRunAt
                ? new Intl.DateTimeFormat(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: TIMEZONE,
                  }).format(new Date(schedule.nextRunAt))
                : "pending"}
            </span>
          </div>
        )),
      )}
    </div>
  ) : (
    <div className="text-xs text-muted-foreground">
      This workflow is not scheduled. Use the form below to run it on-demand.
    </div>
  )}
  ```

* Keep the existing `WorkflowRunForm` exactly as-is (clients can still run manually).

Optional future enhancement: add a “Run with preset X now” button that calls a small API to clone the preset’s `input_payload` into `/api/executions/start`. For now, not required.

---

### Step 6 — n8n expectations (no code change, just convention)

Scheduled jobs hit the same n8n webhook URL as normal runs.

Your payload to n8n already looks like:

```json
{
  "execution_id": "<uuid>",
  "client_id": "<uuid>",
  "workflow_id": "<uuid>",
  "input": { ... },
  "callback_url": "https://app.yourdomain.com/api/webhooks/n8n/callback"
}
```

For scheduled runs:

* `input` is taken from `workflow_preset.input_payload`.
* `execution.source` = `"SYSTEM"` so you can branch inside n8n if needed (e.g. different behavior for system vs manual triggers).

No extra n8n changes are strictly required.

---

### Step 7 — Testing checklist

To make sure everything works end-to-end:

1. **Preset creation**

   * From admin UI, create a preset for a test client + workflow.
   * Confirm:

     * Row in `workflow_preset`.
     * It appears in admin workflow page panel.
     * It appears (read-only) in client run page.

2. **Schedule creation**

   * Create a schedule with `*/5 * * * *` (every 5 minutes) on that preset.
   * Confirm:

     * Row in `workflow_schedule` with `repeat_job_key`, `next_run_at` > now.
     * A repeat job exists in Redis for queue `workflow:schedule`.

3. **Worker behavior**

   * Run `pnpm worker:schedule` and `pnpm worker:exec`.
   * Wait > 5 minutes.
   * Confirm:

     * New `execution` rows with `source = 'SYSTEM'`.
     * n8n receives and completes runs.
     * Client can see these runs in executions table / detail view.

4. **Toggling / deleting**

   * Set `is_active = false` from admin UI → verify no new runs are created.
   * Delete schedule → confirm:

     * Repeat job removed from BullMQ.
     * DB row removed.

5. **Error paths**

   * Ensure schedule with invalid cron fails on creation with clear error.
   * Ensure worker logs but doesn’t crash if:

     * preset is deleted,
     * client access is removed,
     * workflow is unpublished.
 