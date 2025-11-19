import "server-only";

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseServerClient, getSupabaseServiceRoleClient } from "@/lib/supabase/server";

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
  mineOnly?: boolean;
  startedBy?: string;
  startedFrom?: string;
  startedTo?: string;
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
  startedByUserId: string | null;
  startedByUserName: string | null;
  startedByUserEmail: string | null;
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

export interface ClientExecutionUserOption {
  id: string;
  name: string;
}

export interface ClientExecutionFilterOptions {
  workflows: ClientWorkflowFilterOption[];
  statuses: ClientExecutionStatus[];
  users: ClientExecutionUserOption[];
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
  user: {
    id: string;
    name: string | null;
    email: string | null;
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

function escapeForLike(value: string): string {
  return value.replace(/[%_\\]/g, (match) => `\\${match}`);
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

function getSingleQueryValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function parseDateBoundary(value: string | undefined, boundary: "from" | "to"): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return undefined;
  }

  const date = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  if (boundary === "to") {
    date.setUTCHours(23, 59, 59, 999);
  }

  return date.toISOString();
}

function parseStatusParam(value: string | string[] | undefined): ClientExecutionStatus[] {
  const list = Array.isArray(value) ? value : value ? [value] : [];

  if (list.length === 0) {
    return [];
  }

  const normalized = list
    .map((entry) => (typeof entry === "string" ? entry.toUpperCase() : ""))
    .filter((entry): entry is ClientExecutionStatus =>
      EXECUTION_STATUSES.includes(entry as ClientExecutionStatus),
    );

  return normalizeStatusFilter(normalized);
}

export function resolveClientExecutionFilters(
  searchParams: Record<string, string | string[] | undefined>,
): ClientExecutionListFilters {
  const status = parseStatusParam(searchParams.status);
  const startedByRaw = getSingleQueryValue(searchParams.started_by);
  const workflowRaw = getSingleQueryValue(searchParams.workflow);
  const startedFrom = parseDateBoundary(getSingleQueryValue(searchParams.started_from), "from");
  const startedTo = parseDateBoundary(getSingleQueryValue(searchParams.started_to), "to");
  const viewValue = getSingleQueryValue(searchParams.view);
  const mineOnly = typeof viewValue === "string" && viewValue.toLowerCase() === "mine";

  const startedBy = startedByRaw?.trim().length ? startedByRaw.trim() : undefined;
  const workflowId = workflowRaw?.trim().length ? workflowRaw.trim() : undefined;

  return {
    status,
    mineOnly,
    startedBy,
    startedFrom,
    startedTo,
    workflowId,
  } satisfies ClientExecutionListFilters;
}

async function resolveStartedByUserIds(options: {
  search: string;
  clientId: string | null;
}): Promise<string[]> {
  const trimmed = options.search.trim();
  if (!trimmed || !options.clientId) {
    return [];
  }

  const service = getSupabaseServiceRoleClient();
  const sanitized = escapeForLike(trimmed);

  const { data, error } = await service
    .from("user_profile")
    .select("id")
    .eq("client_id", options.clientId)
    .or([
      `email.ilike.%${sanitized}%`,
      `name.ilike.%${sanitized}%`,
    ].join(","));

  if (error) {
    console.error("Failed to resolve started_by filter", error);
    return [];
  }

  const rows = (data ?? []) as Array<{ id: string }>;
  return rows.map((row) => row.id);
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
        user:user_profile!execution_user_id_fkey (
          id,
          name,
          email
        ),
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

  if (filters.mineOnly && profile.userId) {
    query = query.eq("user_id", profile.userId);
  }

  const startedBy = filters.startedBy?.trim();
  if (startedBy && startedBy.length > 0) {
    const userIds = await resolveStartedByUserIds({
      search: startedBy,
      clientId: profile.clientId,
    });

    if (userIds.length === 0) {
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

    query = query.in("user_id", userIds);
  }

  if (isNonEmptyString(filters.startedFrom)) {
    query = query.gte("started_at", filters.startedFrom);
  }

  if (isNonEmptyString(filters.startedTo)) {
    query = query.lte("started_at", filters.startedTo);
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
    startedByUserId: row.user?.id ?? null,
    startedByUserName: row.user?.name ?? null,
    startedByUserEmail: row.user?.email ?? null,
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

export interface ClientWorkflowFilterOption {
  id: string;
  name: string;
}

export async function getClientWorkflowFilterOptions(options: {
  clientId: string | null;
  supabase?: SupabaseClient;
}): Promise<ClientWorkflowFilterOption[]> {
  if (!options.clientId) {
    return [];
  }

  const supabase = options.supabase ?? (await getSupabaseServerClient());

  const { data, error } = await supabase
    .from("client_workflow_access")
    .select(
      `
        workflow_id,
        workflow:workflow (
          id,
          name
        )
      `,
    )
    .eq("client_id", options.clientId);

  if (error) {
    console.error("Failed to load workflow filter options", error);
    return [];
  }

  const rows = (data ?? []) as unknown as Array<{
    workflow_id: string;
    workflow: { id: string; name: string | null } | null;
  }>;

  return rows
    .map((row) => {
      const workflowId = row.workflow?.id ?? row.workflow_id;
      if (!workflowId) {
        return null;
      }
      const workflowName =
        row.workflow?.name?.trim() && row.workflow.name.length > 0
          ? row.workflow.name
          : "Untitled workflow";
      return { id: workflowId, name: workflowName } satisfies ClientWorkflowFilterOption;
    })
    .filter((value): value is ClientWorkflowFilterOption => Boolean(value))
    .sort((a, b) => a.name.localeCompare(b.name));
}
