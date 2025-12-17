import { z } from "zod";

import type { ResultFileValue } from "@/lib/result-files";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

const CLIENT_USAGE_LOOKBACK_DAYS = 30;
const CLIENT_WORKFLOW_USAGE_LIMIT = 6;

export const clientListSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  per_page: z.coerce.number().int().positive().max(100).default(20),
  q: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .optional(),
});

export type ClientListParams = z.input<typeof clientListSchema>;
export type ClientListNormalized = z.infer<typeof clientListSchema>;

type ClientListRow = {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  created_at: string;
  client_workflow_access:
    | { count: number | null }
    | Array<{ count: number | null }>
    | null;
  user_profile:
    | { count: number | null }
    | Array<{ count: number | null }>
    | null;
};

export type ClientListItem = {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  createdAt: string;
  assignedWorkflowCount: number;
  userCount: number;
};

export type ClientListResult = {
  data: ClientListItem[];
  page: number;
  perPage: number;
  total: number;
  nextPage: number | null;
  prevPage: number | null;
  search: string | null;
};

export const createClientSchema = z.object({
  name: z.string().trim().min(2).max(255),
  email: z
    .union([z.string().trim().email().max(255), z.literal("")])
    .optional()
    .transform((value) => {
      if (!value) return undefined;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : undefined;
    }),
  company: z
    .union([z.string().trim().min(1).max(255), z.literal("")])
    .optional()
    .transform((value) => {
      if (!value) return undefined;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : undefined;
    }),
});

type ClientDetailRow = {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  created_at: string;
  client_workflow_access:
    | { count: number | null }
    | Array<{ count: number | null }>
    | null;
};

type ClientAccessRow = {
  workflow_id: string;
  created_at: string;
  workflow: {
    id: string;
    name: string | null;
    is_published: boolean | null;
  } | null;
};

type WorkflowOptionRow = {
  id: string;
  name: string | null;
  is_published: boolean | null;
};

type ExecutionHistoryRow = {
  id: string;
  status: string;
  workflow_id: string;
  started_at: string;
  finished_at: string | null;
  result_file_url: ResultFileValue;
  workflow: {
    id: string;
    name: string | null;
  } | null;
};

type ClientUsageRow = {
  total_cost: number | string | null;
  execution_count: number | string | null;
  average_cost: number | string | null;
  currency: string | null;
};

type ClientUserRow = {
  id: string;
  email: string | null;
  role: "ADMIN" | "CLIENT" | null;
};

type ClientWorkflowUsageRow = {
  workflow_id: string | null;
  workflow_name: string | null;
  total_cost: number | string | null;
  execution_count: number | string | null;
  average_cost: number | string | null;
  currency: string | null;
};

export type ClientDetail = {
  client: {
    id: string;
    name: string;
    email: string | null;
    company: string | null;
    createdAt: string;
  };
  metrics: {
    executionsLast7d: number;
    successRateLast7d: number;
    lastRunAt: string | null;
    assignedWorkflowCount: number;
  };
  assignedWorkflows: Array<{
    id: string;
    name: string;
    isPublished: boolean;
    assignedAt: string;
  }>;
  assignableWorkflows: Array<{
    id: string;
    name: string;
  }>;
  usage: {
    totalCost: number | null;
    averageCost: number | null;
    executionCount: number;
    currency: string | null;
    rangeLabel: string;
  } | null;
  users: Array<{
    id: string;
    email: string | null;
    role: "ADMIN" | "CLIENT";
  }>;
  workflowUsage: Array<{
    id: string;
    name: string;
    totalCost: number | null;
    executions: number;
    averageCost: number | null;
    currency: string | null;
  }>;
  recentExecutions: Array<{
    id: string;
    status: string;
    workflowId: string;
    workflowName: string;
    startedAt: string;
    finishedAt: string | null;
    durationMs: number | null;
    resultFileUrl: ResultFileValue;
  }>;
};

function escapeForLike(value: string): string {
  return value.replace(/[%_\\]/g, (match) => `\\${match}`);
}

function calculateDurationMs(startedAt: string, finishedAt: string | null): number | null {
  const started = Date.parse(startedAt);
  if (Number.isNaN(started)) return null;

  if (!finishedAt) return null;

  const finished = Date.parse(finishedAt);
  if (Number.isNaN(finished) || finished < started) return null;

  return finished - started;
}

function extractRelationCount(
  value:
    | { count: number | null }
    | Array<{ count: number | null }>
    | null
    | undefined,
): number {
  if (Array.isArray(value)) {
    return value.at(0)?.count ?? 0;
  }
  if (value && typeof value === "object") {
    return value.count ?? 0;
  }
  return 0;
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toNumberOrNull(value: number | string | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function normalizeClientListParams(params: ClientListParams): ClientListNormalized {
  return clientListSchema.parse(params);
}

export async function listClients(params: ClientListNormalized): Promise<ClientListResult> {
  const service = getSupabaseServiceRoleClient();

  let query = service
    .from("client")
    .select(
      `
        id,
        name,
        email,
        company,
        created_at,
        client_workflow_access(count),
        user_profile!user_profile_client_id_fkey(count)
      `,
      { count: "exact" },
    )
    .order("created_at", { ascending: false });

  if (params.q) {
    const sanitized = escapeForLike(params.q);
    query = query.or(
      [
        `name.ilike.%${sanitized}%`,
        `email.ilike.%${sanitized}%`,
        `company.ilike.%${sanitized}%`,
      ].join(","),
    );
  }

  const fromIndex = (params.page - 1) * params.per_page;
  const toIndex = fromIndex + params.per_page - 1;

  const { data, error, count } = await query.range(fromIndex, toIndex);

  if (error) {
    throw error;
  }

  const total = count ?? 0;
  const items: ClientListItem[] = (data ?? []).map((row: ClientListRow) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    company: row.company,
    createdAt: row.created_at,
    assignedWorkflowCount: extractRelationCount(row.client_workflow_access),
    userCount: extractRelationCount(row.user_profile),
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
    search: params.q ?? null,
  };
}

export async function createClient(input: unknown): Promise<{ id: string }> {
  const payload = createClientSchema.parse(input);
  const service = getSupabaseServiceRoleClient();

  const { data, error } = await service
    .from("client")
    .insert({
      name: payload.name,
      email: payload.email ?? null,
      company: payload.company ?? null,
    })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return { id: data.id };
}

export async function setClientAccess(clientId: string, workflowIds: string[]) {
  const service = getSupabaseServiceRoleClient();
  const { error } = await service.rpc("set_client_access", {
    p_client: clientId,
    p_workflows: workflowIds,
  });

  if (error) {
    throw error;
  }
}

export async function getClientDetail(clientId: string): Promise<ClientDetail | null> {
  const service = getSupabaseServiceRoleClient();

  const clientPromise = service
    .from("client")
    .select(
      `
        id,
        name,
        email,
        company,
        created_at,
        client_workflow_access(count)
      `,
    )
    .eq("id", clientId)
    .single<ClientDetailRow>();

  const accessPromise = service
    .from("client_workflow_access")
    .select(
      `
        workflow_id,
        created_at,
        workflow:workflow (
          id,
          name,
          is_published
        )
      `,
    )
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });

  const workflowsPromise = service
    .from("workflow")
    .select("id, name, is_published")
    .eq("is_published", true)
    .order("name", { ascending: true });

  const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const executionsCountPromise = service
    .from("execution")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .gte("started_at", sevenDaysAgoIso);

  const executionsSuccessPromise = service
    .from("execution")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .eq("status", "SUCCESS")
    .gte("started_at", sevenDaysAgoIso);

  const latestRunPromise = service
    .from("execution")
    .select("started_at")
    .eq("client_id", clientId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ started_at: string | null }>();

  const recentExecutionsPromise = service
    .from("execution")
    .select(
      `
        id,
        status,
        workflow_id,
        started_at,
        finished_at,
        result_file_url,
        workflow:workflow (
          id,
          name
        )
      `,
    )
    .eq("client_id", clientId)
    .order("started_at", { ascending: false })
    .limit(20);

  const usageRangeEnd = new Date();
  const usageRangeStart = new Date(
    usageRangeEnd.getTime() - CLIENT_USAGE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  );
  const usagePromise = service.rpc("get_client_usage_cost_summary", {
    p_client: clientId,
    p_from: usageRangeStart.toISOString(),
    p_to: usageRangeEnd.toISOString(),
  });

  const usersPromise = service
    .from("user_profile")
    .select("id,email,role")
    .eq("client_id", clientId)
    .order("email", { ascending: true });

  const workflowUsagePromise = service.rpc("get_client_workflow_usage_breakdown", {
    p_client: clientId,
    p_from: usageRangeStart.toISOString(),
    p_to: usageRangeEnd.toISOString(),
    p_limit: CLIENT_WORKFLOW_USAGE_LIMIT,
  });

  const [
    clientResult,
    accessResult,
    workflowsResult,
    executionsCountResult,
    executionsSuccessResult,
    latestRunResult,
    recentExecutionsResult,
    usageResult,
    usersResult,
    workflowUsageResult,
  ] = await Promise.all([
    clientPromise,
    accessPromise,
    workflowsPromise,
    executionsCountPromise,
    executionsSuccessPromise,
    latestRunPromise,
    recentExecutionsPromise,
    usagePromise,
    usersPromise,
    workflowUsagePromise,
  ]);

  if (clientResult.error) {
    if ((clientResult.error as { code?: string }).code === "PGRST116") {
      return null;
    }
    throw clientResult.error;
  }

  if (accessResult.error) {
    throw accessResult.error;
  }

  if (workflowsResult.error) {
    throw workflowsResult.error;
  }

  if (executionsCountResult.error) {
    throw executionsCountResult.error;
  }

  if (executionsSuccessResult.error) {
    throw executionsSuccessResult.error;
  }

  if (latestRunResult.error) {
    throw latestRunResult.error;
  }

  if (recentExecutionsResult.error) {
    throw recentExecutionsResult.error;
  }

  if (usageResult.error) {
    throw usageResult.error;
  }

  if (usersResult.error) {
    throw usersResult.error;
  }

  if (workflowUsageResult.error) {
    throw workflowUsageResult.error;
  }

  const clientRow = clientResult.data;
  if (!clientRow) {
    return null;
  }

  const totalExecutions = executionsCountResult.count ?? 0;
  const successExecutions = executionsSuccessResult.count ?? 0;
  const successRate = totalExecutions > 0 ? (successExecutions / totalExecutions) * 100 : 0;

  const assignedRows = (accessResult.data ?? []) as unknown as ClientAccessRow[];
  const assignedWorkflows = assignedRows.map((row) => ({
    id: row.workflow?.id ?? row.workflow_id,
    name: row.workflow?.name ?? "Unnamed workflow",
    isPublished: Boolean(row.workflow?.is_published),
    assignedAt: row.created_at,
  }));

  const workflowRows = (workflowsResult.data ?? []) as unknown as WorkflowOptionRow[];
  const assignableWorkflows = workflowRows
    .filter((row) => row.is_published)
    .map((row) => ({
      id: row.id,
      name: row.name ?? "Unnamed workflow",
    }));

  const recentRows = (recentExecutionsResult.data ?? []) as unknown as ExecutionHistoryRow[];
  const recentExecutions = recentRows.map((row) => ({
    id: row.id,
    status: row.status,
    workflowId: row.workflow_id,
    workflowName: row.workflow?.name ?? "Unnamed workflow",
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: calculateDurationMs(row.started_at, row.finished_at),
    resultFileUrl: row.result_file_url,
  }));

  const usageRangeLabel = `Last ${CLIENT_USAGE_LOOKBACK_DAYS} days`;
  const usageRow = (usageResult.data ?? [])?.[0] as ClientUsageRow | undefined;
  const usageSummary = usageRow
    ? {
        totalCost: toNumberOrNull(usageRow.total_cost),
        averageCost: toNumberOrNull(usageRow.average_cost),
        executionCount: toNumber(usageRow.execution_count ?? 0),
        currency: usageRow.currency ?? null,
        rangeLabel: usageRangeLabel,
      }
    : null;

  const userRows = (usersResult.data ?? []) as ClientUserRow[];
  const users = userRows.map((row) => {
    const role: "ADMIN" | "CLIENT" = row.role === "ADMIN" ? "ADMIN" : "CLIENT";
    return {
      id: row.id,
      email: row.email,
      role,
    };
  });

  const workflowUsageRows = (workflowUsageResult.data ?? []) as ClientWorkflowUsageRow[];
  const workflowUsage = workflowUsageRows.map((row, index) => {
    const safeName = row.workflow_name?.trim() ?? "";
    return {
      id: row.workflow_id ?? `workflow-${index}`,
      name: safeName.length > 0 ? safeName : "Unnamed workflow",
      totalCost: toNumberOrNull(row.total_cost),
      executions: toNumber(row.execution_count ?? 0),
      averageCost: toNumberOrNull(row.average_cost),
      currency: row.currency ?? null,
    };
  });

  return {
    client: {
      id: clientRow.id,
      name: clientRow.name,
      email: clientRow.email,
      company: clientRow.company,
      createdAt: clientRow.created_at,
    },
    metrics: {
      executionsLast7d: totalExecutions,
      successRateLast7d: successRate,
      lastRunAt: latestRunResult.data?.started_at ?? null,
      assignedWorkflowCount: extractRelationCount(clientRow.client_workflow_access),
    },
    assignedWorkflows,
    assignableWorkflows,
    usage: usageSummary,
    users,
    workflowUsage,
    recentExecutions,
  };
}

export function parseClientListSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): ClientListNormalized {
  const getValue = (value: string | string[] | undefined) => {
    if (Array.isArray(value)) return value.at(-1);
    return value;
  };

  return normalizeClientListParams({
    page: getValue(searchParams.page),
    per_page: getValue(searchParams.per_page),
    q: getValue(searchParams.q),
  });
}
