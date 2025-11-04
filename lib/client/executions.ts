import "server-only";

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseServerClient } from "@/lib/supabase/server";

import { getClientProfile, type ClientProfile } from "./profile";

const EXECUTION_STATUSES = ["PENDING", "PROCESSING", "SUCCESS", "ERROR"] as const;

export type ClientExecutionStatus = (typeof EXECUTION_STATUSES)[number];

export const DEFAULT_CLIENT_EXECUTIONS_PER_PAGE = 20;

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  per_page: z
    .coerce
    .number()
    .int()
    .positive()
    .max(50)
    .default(DEFAULT_CLIENT_EXECUTIONS_PER_PAGE),
});

export interface ClientExecutionListParams {
  page: number;
  perPage: number;
}

export interface ClientExecutionListFilters {
  workflowId?: string;
  status?: ClientExecutionStatus[];
}

export interface ClientExecutionListOptions {
  params?: ClientExecutionListParams;
  filters?: ClientExecutionListFilters;
  supabase?: SupabaseClient;
}

export interface ClientExecutionListItem {
  id: string;
  workflowId: string;
  workflowName: string;
  status: ClientExecutionStatus;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  resultFileUrl: string | null;
}

export interface ClientExecutionListResult {
  profile: ClientProfile;
  executions: ClientExecutionListItem[];
  pagination: {
    page: number;
    perPage: number;
    total: number;
    nextPage: number | null;
    prevPage: number | null;
  };
}

type ExecutionRow = {
  id: string;
  workflow_id: string;
  status: ClientExecutionStatus;
  started_at: string;
  finished_at: string | null;
  result_file_url: string | null;
  workflow: {
    id: string;
    name: string | null;
  } | null;
};

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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeStatusFilter(
  statuses: ClientExecutionStatus[] | undefined,
): ClientExecutionStatus[] {
  if (!statuses) {
    return [];
  }

  return statuses.filter((status): status is ClientExecutionStatus =>
    EXECUTION_STATUSES.includes(status),
  );
}

export function parseClientExecutionQuery(
  searchParams: Record<string, string | string[] | undefined>,
): ClientExecutionListParams {
  const raw = {
    page: Array.isArray(searchParams.page) ? searchParams.page[0] : searchParams.page,
    per_page: Array.isArray(searchParams.per_page)
      ? searchParams.per_page[0]
      : searchParams.per_page,
  } satisfies Record<string, unknown>;

  const parsed = listQuerySchema.parse(raw);

  return {
    page: parsed.page,
    perPage: parsed.per_page,
  } satisfies ClientExecutionListParams;
}

export async function getClientExecutions(options?: ClientExecutionListOptions): Promise<ClientExecutionListResult> {
  const params =
    options?.params ??
    ({ page: 1, perPage: DEFAULT_CLIENT_EXECUTIONS_PER_PAGE } satisfies ClientExecutionListParams);
  const filters = options?.filters ?? {};
  const supabase = options?.supabase ?? (await getSupabaseServerClient());

  const profile = await getClientProfile({ supabase });

  if (!profile.clientId) {
    return {
      profile,
      executions: [],
      pagination: {
        page: params.page,
        perPage: params.perPage,
        total: 0,
        nextPage: null,
        prevPage: null,
      },
    } satisfies ClientExecutionListResult;
  }

  const from = (params.page - 1) * params.perPage;
  const to = from + params.perPage - 1;

  const statusFilter = normalizeStatusFilter(filters.status);

  let query = supabase
    .from("execution")
    .select(
      `
        id,
        workflow_id,
        status,
        started_at,
        finished_at,
        result_file_url,
        workflow:workflow (
          id,
          name
        )
      `,
      { count: "exact" },
    )
    .eq("client_id", profile.clientId);

  if (isNonEmptyString(filters.workflowId)) {
    query = query.eq("workflow_id", filters.workflowId);
  }

  if (statusFilter.length > 0) {
    query = query.in("status", statusFilter);
  }

  const { data, error, count } = await query
    .order("started_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as unknown as ExecutionRow[];

  const executions = rows.map<ClientExecutionListItem>((row) => ({
    id: row.id,
    workflowId: row.workflow?.id ?? row.workflow_id,
    workflowName:
      row.workflow?.name?.trim() && row.workflow.name.length > 0
        ? row.workflow.name
        : "Untitled workflow",
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: calculateDurationMs(row.started_at, row.finished_at),
    resultFileUrl: row.result_file_url,
  }));

  const total = count ?? executions.length;
  const totalPages = params.perPage > 0 ? Math.max(1, Math.ceil(total / params.perPage)) : 1;
  const nextPage = params.page < totalPages ? params.page + 1 : null;
  const prevPage = params.page > 1 ? params.page - 1 : null;

  return {
    profile,
    executions,
    pagination: {
      page: params.page,
      perPage: params.perPage,
      total,
      nextPage,
      prevPage,
    },
  } satisfies ClientExecutionListResult;
}
