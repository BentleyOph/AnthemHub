import { pathToFileURL } from "node:url";
import path from "node:path";
import { config as dotenvConfig } from "dotenv";

dotenvConfig({ path: path.resolve(process.cwd(), ".env.local") });

import cronParser from "cron-parser";
import type { Job, Worker } from "bullmq";

import {
  createScheduleWorker,
  getExecutionQueue,
  type ScheduleJob,
} from "@/lib/queue";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

const supabase = getSupabaseServiceRoleClient();

type ScheduleRow = {
  id: string;
  cron_expr: string;
  timezone: string;
  is_active: boolean;
  workflow_preset: {
    id: string;
    input_payload: Record<string, unknown> | null;
    created_by: string | null;
    workflow: {
      id: string;
      n8n_webhook_url: string | null;
    } | null;
    client: {
      id: string;
    } | null;
  } | null;
};

function resolveCallbackUrl(): string {
  const base =
    process.env.APP_BASE_URL?.trim() ??
    process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (!base) {
    throw new Error(
      "APP_BASE_URL or NEXT_PUBLIC_APP_URL must be configured for schedule worker.",
    );
  }

  return new URL("/api/webhooks/n8n/callback", base).toString();
}

function computeNextTick(cronExpr: string, timezone: string): string | null {
  try {
    const interval = cronParser.parse(cronExpr, { tz: timezone });
    return interval.next().toDate().toISOString();
  } catch (error) {
    console.error("Failed to compute next schedule tick", {
      cronExpr,
      timezone,
      error,
    });
    return null;
  }
}

function normalizeJobInput(
  payload: unknown,
): Record<string, unknown> {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }

  return { value: payload ?? null };
}

async function processScheduleJob(job: Job<ScheduleJob>) {
  const { scheduleId } = job.data;

  const { data: schedule, error } = await supabase
    .from("workflow_schedule")
    .select(
      `
        id,
        cron_expr,
        timezone,
        is_active,
        workflow_preset:workflow_preset (
          id,
          input_payload,
          created_by,
          workflow:workflow (
            id,
            n8n_webhook_url
          ),
          client:client (
            id
          )
        )
      `,
    )
    .eq("id", scheduleId)
    .maybeSingle<ScheduleRow>();

  if (error) {
    console.error("[schedule-worker] Failed to load schedule", {
      scheduleId,
      error,
    });
    return;
  }

  if (!schedule) {
    console.warn("[schedule-worker] Schedule no longer exists", {
      scheduleId,
    });
    return;
  }

  if (!schedule.is_active) {
    console.info("[schedule-worker] Skipping inactive schedule", {
      scheduleId,
    });
    return;
  }

  const preset = schedule.workflow_preset;
  const workflow = preset?.workflow;
  const client = preset?.client;

  if (!preset || !workflow || !client || !workflow.n8n_webhook_url) {
    console.error("[schedule-worker] Schedule is missing relationships", {
      scheduleId,
    });
    return;
  }

  const now = new Date().toISOString();
  const inputPayload = preset.input_payload ?? {};

  const { data: execution, error: executionError } = await supabase
    .from("execution")
    .insert({
      workflow_id: workflow.id,
      client_id: client.id,
      input_payload: inputPayload,
      status: "PROCESSING",
      source: "SYSTEM",
      started_at: now,
    })
    .select("id")
    .single<{ id: string }>();

  if (executionError || !execution) {
    console.error("[schedule-worker] Failed to create execution", {
      scheduleId,
      error: executionError,
    });
    return;
  }

  const executionId = execution.id;
  const queue = getExecutionQueue();
  const callbackUrl = resolveCallbackUrl();

  try {
    await queue.add("start", {
      executionId,
      workflowId: workflow.id,
      clientId: client.id,
      input: normalizeJobInput(inputPayload),
      callbackUrl,
      startedByUserId: preset.created_by ?? "system",
    });
  } catch (enqueueError) {
    console.error("[schedule-worker] Failed to enqueue execution", {
      scheduleId,
      executionId,
      error: enqueueError,
    });
    await supabase
      .from("execution")
      .update({
        status: "ERROR",
        error_message: "Failed to enqueue scheduled execution",
        finished_at: new Date().toISOString(),
      })
      .eq("id", executionId);
    return;
  }

  const nextRunAt = computeNextTick(schedule.cron_expr, schedule.timezone);

  const { error: updateError } = await supabase
    .from("workflow_schedule")
    .update({
      last_run_at: now,
      next_run_at: nextRunAt,
    })
    .eq("id", scheduleId);

  if (updateError) {
    console.error("[schedule-worker] Failed to update schedule timestamps", {
      scheduleId,
      error: updateError,
    });
  }
}

export function createWorker(): Worker<ScheduleJob> {
  const worker = createScheduleWorker(processScheduleJob, { concurrency: 5 });

  worker.on("error", (err) => {
    console.error("[schedule-worker] Worker error", err);
  });

  worker.on("completed", (job) => {
    console.info("[schedule-worker] Completed job", {
      jobId: job.id,
      scheduleId: job.data.scheduleId,
    });
  });

  worker.on("failed", (job, err) => {
    console.error("[schedule-worker] Job failed", {
      jobId: job?.id,
      scheduleId: job?.data.scheduleId,
      error: err,
    });
  });

  return worker;
}

const entryArg = process.argv[1];
const currentModuleUrl = entryArg ? pathToFileURL(entryArg).href : null;

if (currentModuleUrl && import.meta.url === currentModuleUrl) {
  console.info("[schedule-worker] Bootstrapping schedule worker");
  createWorker();
}
