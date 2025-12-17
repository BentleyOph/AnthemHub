import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ClientExecutionStatus } from "@/lib/client/executions";
import { getClientProfile, type ClientProfile } from "@/lib/client/profile";
import type { ResultFileValue } from "@/lib/result-files";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { resolveWorkflowIconUrl } from "@/lib/storage/workflow-icons";

type ExecutionRow = {
  id: string;
  workflow_id: string;
  status: ClientExecutionStatus;
  started_at: string;
  finished_at: string | null;
  result_file_url: ResultFileValue;
  error_message: string | null;
  input_payload: unknown;
  output_payload: unknown;
  workflow: {
    id: string;
    name: string | null;
    public_desc: string | null;
    icon_url: string | null;
  } | null;
};

type ExecutionEventRow = {
  id: string;
  timestamp: string;
  stage: string;
  message: string | null;
  raw: unknown;
};

export interface ClientExecutionDetail {
  id: string;
  workflowId: string;
  workflowName: string;
  workflowDescription: string | null;
  workflowIconUrl: string | null;
  status: ClientExecutionStatus;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  resultFileUrl: ResultFileValue;
  errorMessage: string | null;
  inputPayload: unknown;
  outputPayload: unknown;
}

export interface ClientExecutionDetailResult {
  profile: ClientProfile;
  execution: ClientExecutionDetail;
}

export interface ClientExecutionEvent {
  id: string;
  timestamp: string;
  stage: string;
  message: string | null;
  raw: unknown;
}

function calculateDurationMs(startedAt: string, finishedAt: string | null): number | null {
  if (!startedAt) return null;

  const started = Date.parse(startedAt);
  if (Number.isNaN(started)) return null;

  if (!finishedAt) return null;

  const finished = Date.parse(finishedAt);
  if (Number.isNaN(finished) || finished < started) {
    return null;
  }

  return finished - started;
}

async function mapExecutionRow(row: ExecutionRow): Promise<ClientExecutionDetail> {
  const workflow = row.workflow ?? null;
  const workflowIconUrl = await resolveWorkflowIconUrl(workflow?.icon_url ?? null);

  return {
    id: row.id,
    workflowId: workflow?.id ?? row.workflow_id,
    workflowName:
      workflow?.name?.trim() && workflow.name.length > 0
        ? workflow.name
        : "Untitled workflow",
    workflowDescription:
      workflow?.public_desc?.trim() && workflow.public_desc.length > 0
        ? workflow.public_desc
        : null,
    workflowIconUrl,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: calculateDurationMs(row.started_at, row.finished_at),
    resultFileUrl: row.result_file_url ?? null,
    errorMessage: row.error_message,
    inputPayload: row.input_payload,
    outputPayload: row.output_payload,
  };
}

export async function getClientExecutionDetail(
  executionId: string,
  options?: { supabase?: SupabaseClient },
): Promise<ClientExecutionDetailResult | null> {
  const supabase = options?.supabase ?? (await getSupabaseServerClient());
  const profile = await getClientProfile({ supabase });

  const { data, error } = await supabase
    .from("execution")
    .select(
      `
        id,
        workflow_id,
        status,
        started_at,
        finished_at,
        result_file_url,
        error_message,
        input_payload,
        output_payload,
        workflow:workflow (
          id,
          name,
          public_desc,
          icon_url
        )
      `,
    )
    .eq("id", executionId)
    .maybeSingle<ExecutionRow>();

  if (error) {
    // RLS failures surface as 406/42501; treat as not found for clients.
    if (error.code === "42501" || error.code === "PGRST116") {
      return null;
    }

    throw error;
  }

  if (!data) {
    return null;
  }

  const execution = await mapExecutionRow(data);

  return {
    profile,
    execution,
  };
}

export async function getClientExecutionEvents(
  executionId: string,
  options?: { supabase?: SupabaseClient },
): Promise<ClientExecutionEvent[]> {
  const supabase = options?.supabase ?? (await getSupabaseServerClient());

  const { data, error } = await supabase
    .from("execution_event")
    .select("id, timestamp, stage, message, raw")
    .eq("execution_id", executionId)
    .order("timestamp", { ascending: true });

  if (error) {
    if (error.code === "42501" || error.code === "PGRST116") {
      return [];
    }

    throw error;
  }

  return (data ?? []).map<ClientExecutionEvent>((row: ExecutionEventRow) => ({
    id: row.id,
    timestamp: row.timestamp,
    stage: row.stage,
    message: row.message ?? null,
    raw: row.raw ?? null,
  }));
}
