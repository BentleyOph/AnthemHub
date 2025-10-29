import "server-only";

import { z } from "zod";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

import {
  ACCESS_REQUEST_STATUS_FILTERS,
  ACCESS_REQUEST_STATUSES,
  type AccessRequestStatus,
  type AccessRequestStatusFilter,
} from "./schema";

function coerceSingleValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return undefined;
    }
    return coerceSingleValue(value[0]);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  return undefined;
}

const accessRequestListSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  per_page: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(ACCESS_REQUEST_STATUS_FILTERS).default("PENDING"),
  client_id: z.string().uuid().optional(),
  workflow_id: z.string().uuid().optional(),
});

export type AccessRequestListNormalized = {
  page: number;
  perPage: number;
  status: AccessRequestStatusFilter;
  clientId: string | null;
  workflowId: string | null;
};

type AccessRequestRow = {
  id: string;
  status: string;
  note: string | null;
  created_at: string;
  workflow_id: string;
  client_id: string;
  requester_id: string;
  requester?:
    | {
        id: string;
        email: string | null;
        name: string | null;
      }
    | null;
  client?:
    | {
        id: string;
        name: string | null;
      }
    | null;
  workflow?:
    | {
        id: string;
        name: string | null;
      }
    | null;
};

export type AccessRequestListItem = {
  id: string;
  status: AccessRequestStatus;
  note: string | null;
  createdAt: string;
  workflowId: string;
  workflowName: string;
  clientId: string;
  clientName: string;
  requesterId: string;
  requesterEmail: string | null;
  requesterName: string | null;
};

export type AccessRequestListResult = {
  data: AccessRequestListItem[];
  page: number;
  perPage: number;
  total: number;
  nextPage: number | null;
  prevPage: number | null;
  status: AccessRequestStatusFilter;
  appliedFilters: {
    clientId: string | null;
    workflowId: string | null;
  };
};

export class AccessRequestActionError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "AccessRequestActionError";
    this.status = status;
  }
}

function normalizeStatus(status: string | null | undefined): AccessRequestStatus {
  if (status && ACCESS_REQUEST_STATUSES.includes(status as AccessRequestStatus)) {
    return status as AccessRequestStatus;
  }

  return "PENDING";
}

export function normalizeAccessRequestListParams(
  params: Record<string, string | string[] | undefined>,
): AccessRequestListNormalized {
  const statusRaw = coerceSingleValue(params.status)?.toUpperCase();
  const status =
    statusRaw && ACCESS_REQUEST_STATUS_FILTERS.includes(statusRaw as AccessRequestStatusFilter)
      ? (statusRaw as AccessRequestStatusFilter)
      : undefined;

  const clientId = coerceSingleValue(params.client_id);
  const workflowId = coerceSingleValue(params.workflow_id);

  const parsed = accessRequestListSchema.parse({
    page: params.page,
    per_page: params.per_page,
    status: status ?? "PENDING",
    client_id: clientId,
    workflow_id: workflowId,
  });

  return {
    page: parsed.page,
    perPage: parsed.per_page,
    status: parsed.status,
    clientId: parsed.client_id ?? null,
    workflowId: parsed.workflow_id ?? null,
  };
}

export async function listAccessRequests(
  params: AccessRequestListNormalized,
): Promise<AccessRequestListResult> {
  const service = getSupabaseServiceRoleClient();

  let query = service
    .from("access_request")
    .select(
      `
        id,
        status,
        note,
        created_at,
        workflow_id,
        client_id,
        requester_id,
        requester:user_profile!access_request_requester_id_fkey (
          id,
          email,
          name
        ),
        client:client!access_request_client_id_fkey (
          id,
          name
        ),
        workflow:workflow!access_request_workflow_id_fkey (
          id,
          name
        )
      `,
      { count: "exact" },
    )
    .order("created_at", { ascending: false });

  if (params.status !== "ALL") {
    query = query.eq("status", params.status);
  }

  if (params.clientId) {
    query = query.eq("client_id", params.clientId);
  }

  if (params.workflowId) {
    query = query.eq("workflow_id", params.workflowId);
  }

  const fromIndex = (params.page - 1) * params.perPage;
  const toIndex = fromIndex + params.perPage - 1;

  const { data, error, count } = await query.range(fromIndex, toIndex);

  if (error) {
    throw error;
  }

  const total = count ?? 0;
  const items: AccessRequestListItem[] = (data ?? []).map((row: AccessRequestRow) => ({
    id: row.id,
    status: normalizeStatus(row.status),
    note: row.note ?? null,
    createdAt: row.created_at,
    workflowId: row.workflow_id,
    workflowName: row.workflow?.name ?? "Unknown workflow",
    clientId: row.client_id,
    clientName: row.client?.name ?? "Unknown client",
    requesterId: row.requester_id,
    requesterEmail: row.requester?.email ?? null,
    requesterName: row.requester?.name ?? null,
  }));

  const nextPage = fromIndex + items.length < total ? params.page + 1 : null;
  const prevPage = params.page > 1 ? params.page - 1 : null;

  return {
    data: items,
    page: params.page,
    perPage: params.perPage,
    total,
    nextPage,
    prevPage,
    status: params.status,
    appliedFilters: {
      clientId: params.clientId,
      workflowId: params.workflowId,
    },
  };
}

export async function approveAccessRequest(id: string, adminUserId: string): Promise<void> {
  const service = getSupabaseServiceRoleClient();
  const { error } = await service.rpc("approve_access_request", {
    request_id: id,
    admin_user_id: adminUserId,
  });

  if (error) {
    const message = error.message ?? "Failed to approve access request.";
    const normalized = message.toLowerCase();

    if (normalized.includes("not found") || normalized.includes("processed")) {
      throw new AccessRequestActionError(message, 409);
    }

    throw new AccessRequestActionError(message);
  }
}

export async function rejectAccessRequest(id: string): Promise<void> {
  const service = getSupabaseServiceRoleClient();

  const { data, error } = await service
    .from("access_request")
    .update({
      status: "DENIED",
    })
    .eq("id", id)
    .eq("status", "PENDING")
    .select("id")
    .maybeSingle();

  if (error) {
    throw new AccessRequestActionError(error.message ?? "Failed to reject access request.");
  }

  if (!data) {
    throw new AccessRequestActionError(
      "Access request not found or already processed.",
      409,
    );
  }
}
