import { z } from "zod";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const EXECUTION_STATUSES = [
  "PENDING",
  "PROCESSING",
  "SUCCESS",
  "ERROR",
] as const;

export const EXECUTION_SORT_OPTIONS = [
  "started_at.desc",
  "started_at.asc",
  "duration.desc",
  "duration.asc",
] as const;

export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];
export type ExecutionSort = (typeof EXECUTION_SORT_OPTIONS)[number];

// Type guard exported in case callers want to narrow user input before parsing
export function isExecutionSort(value: unknown): value is ExecutionSort {
  return typeof value === "string" && (EXECUTION_SORT_OPTIONS as readonly string[]).includes(value);
}

export const executionListSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  per_page: z.coerce
    .number()
    .int()
    .positive()
    .max(100)
    .default(20),
  workflow_id: z.array(z.string().uuid()).default([]),
  status: z.array(z.enum(EXECUTION_STATUSES)).default([]),
  client_id: z.array(z.string().uuid()).default([]),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  q: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .optional(),
  sort: z.enum(EXECUTION_SORT_OPTIONS).default("started_at.desc"),
});

const DEFAULT_LOOKBACK_DAYS = 90;

export type ExecutionListNormalized = z.infer<typeof executionListSchema> & {
  from: string;
  to: string;
};

type ExecutionRow = {
  id: string;
  status: ExecutionStatus;
  source: string | null;
  workflow_id: string;
  client_id: string;
  started_at: string;
  finished_at: string | null;
  result_file_url: string | null;
  error_message: string | null;
  n8n_run_id: string | null;
  workflow: { id: string; name: string | null } | null;
  client: { id: string; name: string | null } | null;
};

type ExecutionEventRow = {
  id: string;
  execution_id: string;
  timestamp: string;
  stage: string;
  message: string | null;
  raw: unknown;
};

export type ExecutionListItem = {
  id: string;
  status: ExecutionStatus;
  source: string;
  workflowId: string;
  workflowName: string;
  clientId: string;
  clientName: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  resultFileUrl: string | null;
  errorMessage: string | null;
  n8nRunId: string | null;
};

export type ExecutionDetail = {
  id: string;
  status: ExecutionStatus;
  source: string | null;
  workflowId: string;
  workflowName: string;
  clientId: string;
  clientName: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  resultFileUrl: string | null;
  errorMessage: string | null;
  n8nRunId: string | null;
  inputPayload: unknown;
  outputPayload: unknown;
};

export type ExecutionEventItem = {
  id: string;
  executionId: string;
  timestamp: string;
  stage: string;
  message: string | null;
  raw: unknown;
};

export type ExecutionListResult = {
  data: ExecutionListItem[];
  page: number;
  perPage: number;
  total: number;
  nextPage: number | null;
  prevPage: number | null;
  sort: ExecutionSort;
  appliedFilters: {
    workflowIds: string[];
    status: ExecutionStatus[];
    clientIds: string[];
    from: string;
    to: string;
    q: string | null;
  };
};

export type ExecutionEventsResult = {
  data: ExecutionEventItem[];
  page: number;
  perPage: number;
  total: number;
  nextPage: number | null;
  prevPage: number | null;
};

function escapeForLike(value: string): string {
  return value.replace(/[%_\\]/g, (match) => `\\${match}`);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function computeDurationMs(row: Pick<ExecutionRow, "started_at" | "finished_at">): number | null {
  if (!row.started_at) return null;

  const started = Date.parse(row.started_at);
  if (Number.isNaN(started)) return null;

  if (!row.finished_at) {
    return null;
  }

  const finished = Date.parse(row.finished_at);
  if (Number.isNaN(finished) || finished < started) {
    return null;
  }

  return finished - started;
}

export function normalizeExecutionListParams(
  params: z.input<typeof executionListSchema>,
): ExecutionListNormalized {
  const parsed = executionListSchema.parse(params);

  const now = new Date();
  const defaultFrom = new Date(now.getTime() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const fromIso = parsed.from ?? defaultFrom.toISOString();
  const toIso = parsed.to ?? now.toISOString();

  if (Date.parse(fromIso) > Date.parse(toIso)) {
    throw new Error("Invalid date range: `from` must be before `to`.");
  }

  return {
    ...parsed,
    from: fromIso,
    to: toIso,
  };
}

export async function listExecutions(
  params: ExecutionListNormalized,
): Promise<ExecutionListResult> {
  const service = getSupabaseServiceRoleClient();

  let query = service
    .from("execution")
    .select(
      `
        id,
        status,
        source,
        workflow_id,
        client_id,
        started_at,
        finished_at,
        result_file_url,
        error_message,
        n8n_run_id,
        workflow:workflow ( id, name ),
        client:client ( id, name )
      `,
      { count: "exact" },
    )
    .gte("started_at", params.from)
    .lte("started_at", params.to);

  if (params.workflow_id.length > 0) {
    query = query.in("workflow_id", params.workflow_id);
  }

  if (params.status.length > 0) {
    query = query.in("status", params.status);
  }

  if (params.client_id.length > 0) {
    query = query.in("client_id", params.client_id);
  }

  if (params.q) {
    const sanitized = escapeForLike(params.q);
    const conditions = new Set<string>();

    if (isUuid(params.q)) {
      // For UUID searches, use exact match only
      conditions.add(`id.eq.${params.q}`);
    } else {
      // For non-UUID searches, search in n8n_run_id only
      // Note: Cannot use id::text.ilike with PostgREST's .or() syntax
      conditions.add(`n8n_run_id.ilike.%${sanitized}%`);
    }

    query = query.or(Array.from(conditions).join(","));
  }

  const [field, direction] = params.sort.split(".") as [
    "started_at" | "duration",
    "asc" | "desc",
  ];
  const ascending = direction === "asc";

  if (field === "started_at") {
    query = query.order("started_at", { ascending });
  } else {
    query = query
      .order("finished_at", { ascending, nullsFirst: ascending })
      .order("started_at", { ascending: !ascending });
  }

  const fromIndex = (params.page - 1) * params.per_page;
  const toIndex = fromIndex + params.per_page - 1;

  const { data, error, count } = await query.range(fromIndex, toIndex);

  if (error) {
    throw error;
  }

  const total = count ?? 0;
  const rows = (data ?? []) as unknown as ExecutionRow[];
  const items: ExecutionListItem[] = rows.map((row) => ({
    id: row.id,
    status: row.status,
    source: row.source ?? "USER",
    workflowId: row.workflow_id,
    workflowName: row.workflow?.name ?? "Unknown workflow",
    clientId: row.client_id,
    clientName: row.client?.name ?? "Unknown client",
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: computeDurationMs(row),
    resultFileUrl: row.result_file_url,
    errorMessage: row.error_message,
    n8nRunId: row.n8n_run_id,
  }));

  const nextPage = fromIndex + items.length < total ? params.page + 1 : null;
  const prevPage = params.page > 1 ? params.page - 1 : null;

  return {
    data: items,
    page: params.page,
    perPage: params.per_page,
    total,
    nextPage,
    prevPage,
    sort: params.sort,
    appliedFilters: {
      workflowIds: params.workflow_id,
      status: params.status,
      clientIds: params.client_id,
      from: params.from,
      to: params.to,
      q: params.q ?? null,
    },
  };
}

export async function getExecutionDetail(id: string): Promise<ExecutionDetail | null> {
  const service = getSupabaseServiceRoleClient();

  const { data, error } = await service
    .from("execution")
    .select(
      `
        id,
        status,
        source,
        workflow_id,
        client_id,
        started_at,
        finished_at,
        result_file_url,
        error_message,
        n8n_run_id,
        input_payload,
        output_payload,
        workflow:workflow ( id, name ),
        client:client ( id, name )
      `,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const row = data as unknown as ExecutionRow & {
    input_payload: unknown;
    output_payload: unknown;
  };

  return {
    id: row.id,
    status: row.status,
    source: row.source,
    workflowId: row.workflow_id,
    workflowName: row.workflow?.name ?? "Unknown workflow",
    clientId: row.client_id,
    clientName: row.client?.name ?? "Unknown client",
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: computeDurationMs(row),
    resultFileUrl: row.result_file_url,
    errorMessage: row.error_message,
    n8nRunId: row.n8n_run_id,
    inputPayload: row.input_payload,
    outputPayload: row.output_payload,
  };
}

export async function listExecutionEvents(
  executionId: string,
  page: number,
  perPage: number,
): Promise<ExecutionEventsResult> {
  const service = getSupabaseServiceRoleClient();
  const fromIndex = (page - 1) * perPage;
  const toIndex = fromIndex + perPage - 1;

  const { data, error, count } = await service
    .from("execution_event")
    .select(
      `
        id,
        execution_id,
        timestamp,
        stage,
        message,
        raw
      `,
      { count: "exact" },
    )
    .eq("execution_id", executionId)
    .order("timestamp", { ascending: true })
    .range(fromIndex, toIndex);

  if (error) {
    throw error;
  }

  const total = count ?? 0;
  const rows = (data ?? []) as unknown as ExecutionEventRow[];
  const items: ExecutionEventItem[] = rows.map((row) => ({
    id: row.id,
    executionId: row.execution_id,
    timestamp: row.timestamp,
    stage: row.stage,
    message: row.message,
    raw: row.raw,
  }));

  const nextPage = fromIndex + items.length < total ? page + 1 : null;
  const prevPage = page > 1 ? page - 1 : null;

  return {
    data: items,
    page,
    perPage,
    total,
    nextPage,
    prevPage,
  };
}

export async function fetchExecutionFilterOptions() {
  const service = getSupabaseServiceRoleClient();

  const [workflows, clients] = await Promise.all([
    service
      .from("workflow")
      .select("id, name")
      .order("name", { ascending: true }),
    service
      .from("client")
      .select("id, name")
      .order("name", { ascending: true }),
  ]);

  if (workflows.error) {
    throw workflows.error;
  }

  if (clients.error) {
    throw clients.error;
  }

  return {
    workflows: (workflows.data ?? []).map((wf) => ({
      id: wf.id,
      name: wf.name ?? "Unnamed workflow",
    })),
    clients: (clients.data ?? []).map((client) => ({
      id: client.id,
      name: client.name ?? "Unnamed client",
    })),
    statuses: EXECUTION_STATUSES.slice(),
  };
}

export function parseExecutionListSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): ExecutionListNormalized {
  const toArray = (value: string | string[] | undefined) => {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") return [value];
    return undefined;
  };

  const toValue = (value: string | string[] | undefined) => {
    if (Array.isArray(value)) return value.at(-1);
    return value;
  };

  return normalizeExecutionListParams({
    page: toValue(searchParams.page),
    per_page: toValue(searchParams.per_page),
    workflow_id: toArray(searchParams.workflow_id),
    status: toArray(searchParams.status) as unknown as ExecutionStatus[] | undefined,
    client_id: toArray(searchParams.client_id),
    from: toValue(searchParams.from),
    to: toValue(searchParams.to),
    q: toValue(searchParams.q),
    sort: toValue(searchParams.sort) as unknown as ExecutionSort | undefined,
  });
}
