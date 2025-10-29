import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { ACCESS_REQUEST_STATUSES, type AccessRequestStatus } from "@/lib/access-requests/constants";
import { getSupabaseServerClient } from "@/lib/supabase/server";

import { getClientProfile, type ClientProfile } from "./profile";

type AccessRequestRow = {
  id: string;
  workflow_id: string;
  status: string | null;
  note: string | null;
  created_at: string;
};

type AccessRow = {
  workflow_id: string;
};

export interface ClientAccessRequest {
  id: string;
  workflowId: string;
  status: AccessRequestStatus;
  note: string | null;
  createdAt: string;
}

export interface ClientAccessContext {
  profile: ClientProfile;
  assignedWorkflowIds: string[];
  accessRequests: ClientAccessRequest[];
}

function normalizeStatus(value: string | null | undefined): AccessRequestStatus {
  if (!value) {
    return "PENDING";
  }

  if (ACCESS_REQUEST_STATUSES.includes(value as AccessRequestStatus)) {
    return value as AccessRequestStatus;
  }

  return "PENDING";
}

export async function getClientAccessContext(options?: {
  supabase?: SupabaseClient;
}): Promise<ClientAccessContext> {
  const supabase = options?.supabase ?? (await getSupabaseServerClient());
  const profile = await getClientProfile({ supabase });

  if (!profile.clientId) {
    return {
      profile,
      assignedWorkflowIds: [],
      accessRequests: [],
    };
  }

  const [accessResult, requestsResult] = await Promise.all([
    supabase
      .from("client_workflow_access")
      .select("workflow_id")
      .eq("client_id", profile.clientId),
    supabase
      .from("access_request")
      .select("id, workflow_id, status, note, created_at")
      .eq("client_id", profile.clientId)
      .eq("requester_id", profile.userId)
      .order("created_at", { ascending: false }),
  ]);

  if (accessResult.error) {
    throw accessResult.error;
  }

  if (requestsResult.error && requestsResult.error.code !== "42501") {
    // Log unexpected failures but do not break the page for permission issues.
    console.error("Failed to load client access requests", requestsResult.error);
  }

  const assignedWorkflowIds = (accessResult.data ?? [])
    .map((row: AccessRow) => row.workflow_id)
    .filter((value): value is string => Boolean(value));

  const accessRequests = (requestsResult.data ?? []).map<ClientAccessRequest>(
    (row: AccessRequestRow) => ({
      id: row.id,
      workflowId: row.workflow_id,
      status: normalizeStatus(row.status),
      note: row.note ?? null,
      createdAt: row.created_at,
    }),
  );

  return {
    profile,
    assignedWorkflowIds,
    accessRequests,
  };
}
