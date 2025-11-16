import "server-only";

import cronParser from "cron-parser";
import { z } from "zod";

import { registerScheduleJob, removeScheduleJob } from "@/lib/queue/schedules";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type WorkflowPreset = {
  id: string;
  workflowId: string;
  clientId: string;
  clientName: string;
  name: string;
  description: string | null;
  inputPayload: Record<string, unknown>;
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

const presetSelection = `
  id,
  workflow_id,
  client_id,
  name,
  description,
  input_payload,
  created_at,
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
    next_run_at,
    repeat_job_key
  )
`;

type WorkflowPresetRow = {
  id: string;
  workflow_id: string;
  client_id: string;
  name: string;
  description: string | null;
  input_payload: Record<string, unknown> | null;
  created_at: string;
  client: { id: string; name: string | null } | null;
  schedules:
    | Array<{
        id: string;
        name: string;
        cron_expr: string;
        timezone: string;
        is_active: boolean;
        last_run_at: string | null;
        next_run_at: string | null;
        repeat_job_key: string | null;
      }>
    | null;
};

type WorkflowScheduleRow = NonNullable<WorkflowPresetRow["schedules"]>[number];

function mapScheduleRow(row: WorkflowScheduleRow): WorkflowSchedule {
  return {
    id: row.id,
    name: row.name,
    cronExpr: row.cron_expr,
    timezone: row.timezone,
    isActive: Boolean(row.is_active),
    lastRunAt: row.last_run_at,
    nextRunAt: row.next_run_at,
  };
}

function mapPresetRow(row: WorkflowPresetRow): WorkflowPresetWithSchedules {
  const inputPayload =
    row.input_payload && typeof row.input_payload === "object"
      ? (row.input_payload as Record<string, unknown>)
      : {};

  return {
    id: row.id,
    workflowId: row.workflow_id,
    clientId: row.client?.id ?? row.client_id,
    clientName: row.client?.name ?? "Unknown client",
    name: row.name,
    description: row.description ?? null,
    inputPayload,
    createdAt: row.created_at,
    schedules: (row.schedules ?? []).map(mapScheduleRow),
  };
}

const createPresetSchema = z.object({
  workflowId: z.string().uuid(),
  clientId: z.string().uuid(),
  name: z.string().trim().min(2).max(255),
  description: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  inputPayload: z
    .record(z.string(), z.any())
    .optional()
    .default({})
    .transform((value) => JSON.parse(JSON.stringify(value ?? {}))),
  createdBy: z.string().uuid(),
});

const updatePresetSchema = z.object({
  name: z.string().trim().min(2).max(255),
  description: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  inputPayload: z
    .record(z.string(), z.any())
    .optional()
    .default({})
    .transform((value) => JSON.parse(JSON.stringify(value ?? {}))),
});

const scheduleInsertSchema = z.object({
  presetId: z.string().uuid(),
  name: z.string().trim().min(2).max(255),
  cronExpr: z.string().trim().min(1).max(255),
  timezone: z.string().trim().min(2).max(255),
  isActive: z.boolean().optional().default(true),
});

const scheduleUpdateSchema = z.object({
  name: z.string().trim().min(2).max(255),
  cronExpr: z.string().trim().min(1).max(255),
  timezone: z.string().trim().min(2).max(255),
  isActive: z.boolean(),
});

function computeNextRunAt(cronExpr: string, timezone: string): string {
  const interval = cronParser.parse(cronExpr, { tz: timezone });
  return interval.next().toDate().toISOString();
}

async function ensureClientWorkflowAccess({
  workflowId,
  clientId,
}: {
  workflowId: string;
  clientId: string;
}): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("client_workflow_access")
    .select("id")
    .eq("workflow_id", workflowId)
    .eq("client_id", clientId)
    .maybeSingle<{ id: string }>();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("Client does not have access to this workflow.");
  }
}

async function loadScheduleRow(
  scheduleId: string,
): Promise<(WorkflowScheduleRow & { workflow_preset_id: string }) | null> {
  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("workflow_schedule")
    .select(
      `
        id,
        workflow_preset_id,
        name,
        cron_expr,
        timezone,
        is_active,
        last_run_at,
        next_run_at,
        repeat_job_key
      `,
    )
    .eq("id", scheduleId)
    .maybeSingle<
      WorkflowScheduleRow & {
        workflow_preset_id: string;
        repeat_job_key: string | null;
      }
    >();

  if (error) {
    throw error;
  }

  return data ?? null;
}

export async function listWorkflowPresetsForWorkflow(
  workflowId: string,
): Promise<WorkflowPresetWithSchedules[]> {
  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("workflow_preset")
    .select(presetSelection)
    .eq("workflow_id", workflowId)
    .order("created_at", { ascending: true })
    .order("created_at", {
      ascending: true,
      referencedTable: "workflow_schedule",
    });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as unknown as WorkflowPresetRow[];
  return rows.map(mapPresetRow);
}

export type CreateWorkflowPresetInput = z.input<typeof createPresetSchema>;

export async function createWorkflowPreset(
  input: CreateWorkflowPresetInput,
): Promise<WorkflowPresetWithSchedules> {
  const payload = createPresetSchema.parse(input);
  await ensureClientWorkflowAccess({
    workflowId: payload.workflowId,
    clientId: payload.clientId,
  });

  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("workflow_preset")
    .insert({
      workflow_id: payload.workflowId,
      client_id: payload.clientId,
      name: payload.name,
      description: payload.description,
      input_payload: payload.inputPayload,
      created_by: payload.createdBy,
    })
    .select(presetSelection)
    .single<WorkflowPresetRow>();

  if (error) {
    throw error;
  }

  return mapPresetRow(data);
}

export type UpdateWorkflowPresetInput = z.input<typeof updatePresetSchema>;

export async function updateWorkflowPreset(
  presetId: string,
  input: UpdateWorkflowPresetInput,
): Promise<WorkflowPresetWithSchedules> {
  const payload = updatePresetSchema.parse(input);
  const supabase = getSupabaseServiceRoleClient();

  const { data, error } = await supabase
    .from("workflow_preset")
    .update({
      name: payload.name,
      description: payload.description,
      input_payload: payload.inputPayload,
    })
    .eq("id", presetId)
    .select(presetSelection)
    .single<WorkflowPresetRow>();

  if (error) {
    throw error;
  }

  return mapPresetRow(data);
}

export async function deleteWorkflowPreset(presetId: string): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();

  const { data: schedules, error: scheduleLoadError } = await supabase
    .from("workflow_schedule")
    .select("repeat_job_key")
    .eq("workflow_preset_id", presetId)
    .not("repeat_job_key", "is", null)
    .returns<
      Array<{
        repeat_job_key: string | null;
      }>
    >();

  if (scheduleLoadError) {
    throw scheduleLoadError;
  }

  if (schedules && schedules.length > 0) {
    const keys = schedules
      .map((schedule) => schedule.repeat_job_key)
      .filter((key): key is string => Boolean(key));

    await Promise.all(keys.map((key) => removeScheduleJob(key)));
  }

  const { error } = await supabase
    .from("workflow_preset")
    .delete()
    .eq("id", presetId);

  if (error) {
    throw error;
  }
}

export type CreateWorkflowScheduleInput = z.input<typeof scheduleInsertSchema>;

export async function createWorkflowSchedule(
  input: CreateWorkflowScheduleInput,
): Promise<WorkflowSchedule> {
  const payload = scheduleInsertSchema.parse(input);
  const supabase = getSupabaseServiceRoleClient();

  const { data: presetRow, error: presetError } = await supabase
    .from("workflow_preset")
    .select("id")
    .eq("id", payload.presetId)
    .maybeSingle<{ id: string }>();

  if (presetError) {
    throw presetError;
  }

  if (!presetRow) {
    throw new Error("Workflow preset not found.");
  }

  const nextRunAt = payload.isActive
    ? computeNextRunAt(payload.cronExpr, payload.timezone)
    : null;

  const { data, error } = await supabase
    .from("workflow_schedule")
    .insert({
      workflow_preset_id: payload.presetId,
      name: payload.name,
      cron_expr: payload.cronExpr,
      timezone: payload.timezone,
      is_active: payload.isActive,
      next_run_at: nextRunAt,
    })
    .select(
      `
        id,
        name,
        cron_expr,
        timezone,
        is_active,
        last_run_at,
        next_run_at,
        repeat_job_key
      `,
    )
    .single<
      WorkflowScheduleRow & {
        repeat_job_key: string | null;
      }
    >();

  if (error) {
    throw error;
  }

  let result = data;

  if (payload.isActive) {
    try {
      const repeatKey = await registerScheduleJob({
        scheduleId: data.id,
        cronExpr: payload.cronExpr,
        timezone: payload.timezone,
      });

      const { data: updated, error: repeatKeyUpdateError } = await supabase
        .from("workflow_schedule")
        .update({ repeat_job_key: repeatKey })
        .eq("id", data.id)
        .select(
          `
            id,
            name,
            cron_expr,
            timezone,
            is_active,
            last_run_at,
            next_run_at,
            repeat_job_key
          `,
        )
        .single<
          WorkflowScheduleRow & {
            repeat_job_key: string | null;
          }
        >();

      if (repeatKeyUpdateError || !updated) {
        throw repeatKeyUpdateError ?? new Error("Failed to persist repeat job key.");
      }

      result = updated;
    } catch (scheduleError) {
      await supabase
        .from("workflow_schedule")
        .delete()
        .eq("id", data.id);
      throw scheduleError;
    }
  }

  return mapScheduleRow(result);
}

export type UpdateWorkflowScheduleInput = z.input<typeof scheduleUpdateSchema>;

export async function updateWorkflowSchedule(
  scheduleId: string,
  input: UpdateWorkflowScheduleInput,
): Promise<WorkflowSchedule> {
  const payload = scheduleUpdateSchema.parse(input);

  const existing = await loadScheduleRow(scheduleId);
  if (!existing) {
    throw new Error("Workflow schedule not found.");
  }

  const needsNewRepeatJob =
    payload.isActive &&
    (!existing.is_active ||
      !existing.repeat_job_key ||
      existing.cron_expr !== payload.cronExpr ||
      existing.timezone !== payload.timezone);

  const nextRunAt = payload.isActive
    ? computeNextRunAt(payload.cronExpr, payload.timezone)
    : null;

  if (
    existing.repeat_job_key &&
    (!payload.isActive || needsNewRepeatJob)
  ) {
    await removeScheduleJob(existing.repeat_job_key);
  }

  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("workflow_schedule")
    .update({
      name: payload.name,
      cron_expr: payload.cronExpr,
      timezone: payload.timezone,
      is_active: payload.isActive,
      next_run_at: nextRunAt,
      repeat_job_key:
        payload.isActive && !needsNewRepeatJob
          ? existing.repeat_job_key
          : null,
    })
    .eq("id", scheduleId)
    .select(
      `
        id,
        name,
        cron_expr,
        timezone,
        is_active,
        last_run_at,
        next_run_at,
        repeat_job_key
      `,
    )
    .single<
      WorkflowScheduleRow & {
        repeat_job_key: string | null;
      }
    >();

  if (error) {
    throw error;
  }

  let result = data;

  if (needsNewRepeatJob) {
    try {
      const repeatKey = await registerScheduleJob({
        scheduleId,
        cronExpr: payload.cronExpr,
        timezone: payload.timezone,
      });

      const { data: updated, error: updateError } = await supabase
        .from("workflow_schedule")
        .update({ repeat_job_key: repeatKey })
        .eq("id", scheduleId)
        .select(
          `
            id,
            name,
            cron_expr,
            timezone,
            is_active,
            last_run_at,
            next_run_at,
            repeat_job_key
          `,
        )
        .single<
          WorkflowScheduleRow & {
            repeat_job_key: string | null;
          }
        >();

      if (updateError || !updated) {
        throw updateError ?? new Error("Failed to persist repeat job key.");
      }

      result = updated;
    } catch (scheduleError) {
      await supabase
        .from("workflow_schedule")
        .update({
          is_active: false,
          repeat_job_key: null,
          next_run_at: null,
        })
        .eq("id", scheduleId);
      throw scheduleError;
    }
  }

  return mapScheduleRow(result);
}

export async function deleteWorkflowSchedule(scheduleId: string): Promise<void> {
  const existing = await loadScheduleRow(scheduleId);
  if (!existing) {
    return;
  }

  if (existing.repeat_job_key) {
    await removeScheduleJob(existing.repeat_job_key);
  }

  const supabase = getSupabaseServiceRoleClient();
  const { error } = await supabase
    .from("workflow_schedule")
    .delete()
    .eq("id", scheduleId);

  if (error) {
    throw error;
  }
}

export type WorkflowClientOption = {
  id: string;
  name: string;
};

export async function listWorkflowClientOptions(
  workflowId: string,
): Promise<WorkflowClientOption[]> {
  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("client_workflow_access")
    .select(
      `
        client_id,
        created_at,
        client:client (
          id,
          name
        )
      `,
    )
    .eq("workflow_id", workflowId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as unknown as Array<{
    client_id: string;
    client: { id: string; name: string | null } | null;
  }>;

  return rows.map((row) => ({
    id: row.client?.id ?? row.client_id,
    name: row.client?.name ?? "Unnamed client",
  }));
}
