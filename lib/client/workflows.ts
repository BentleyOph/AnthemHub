import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ExecutionStatus } from "./overview";
import type { AccessRequestStatus } from "@/lib/access-requests/constants";
import { getClientAccessContext } from "./access";
import type { ClientProfile } from "./profile";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type AccessRow = {
  workflow_id: string;
  created_at: string;
  workflow: {
    id: string;
    name: string | null;
    public_desc: string | null;
    icon_url: string | null;
    is_published: boolean | null;
    updated_at: string;
  } | null;
};

type ExecutionRow = {
  workflow_id: string;
  status: ExecutionStatus;
  started_at: string;
  finished_at: string | null;
};

export interface ClientWorkflowListItem {
  id: string;
  name: string;
  description: string;
  iconUrl: string | null;
  isPublished: boolean;
  assignedAt: string;
  runHref: string;
  detailsHref: string;
  lastRunAt: string | null;
  lastRunStatus: ExecutionStatus | null;
}

type WorkflowSummaryRow = {
  id: string;
  name: string | null;
  public_desc: string | null;
  icon_url: string | null;
};

export interface ClientPendingRequest {
  id: string;
  workflowId: string;
  status: AccessRequestStatus;
  createdAt: string;
  workflowName: string;
  workflowDescription: string | null;
  iconUrl: string | null;
}

export interface ClientWorkflowsData {
  profile: ClientProfile;
  workflows: ClientWorkflowListItem[];
  pendingRequests: ClientPendingRequest[];
}

function mapAssignedWorkflow(
  row: AccessRow,
  lastRunMap: Map<string, ExecutionRow>,
): ClientWorkflowListItem {
  const workflow = row.workflow;
  const detailsHref = workflow ? `/workflows/${workflow.id}` : "#";
  const runHref = workflow ? `/workflows/${workflow.id}/run` : "#";
  const lastRun = workflow ? lastRunMap.get(workflow.id) ?? null : null;

  return {
    id: workflow?.id ?? row.workflow_id,
    name:
      workflow?.name?.trim() && workflow.name.length > 0
        ? workflow.name
        : "Untitled workflow",
    description:
      workflow?.public_desc?.trim() && workflow.public_desc.length > 0
        ? workflow.public_desc
        : "No description provided yet.",
    iconUrl: workflow?.icon_url ?? null,
    isPublished: Boolean(workflow?.is_published),
    assignedAt: row.created_at,
    runHref,
    detailsHref,
    lastRunAt: lastRun?.started_at ?? null,
    lastRunStatus: lastRun?.status ?? null,
  };
}

async function loadAssignedWorkflows(
  supabase: SupabaseClient,
  profile: ClientProfile,
): Promise<ClientWorkflowListItem[]> {
  if (!profile.clientId) {
    return [];
  }

  const { data, error } = await supabase
    .from("client_workflow_access")
    .select(
      `
        workflow_id,
        created_at,
        workflow:workflow (
          id,
          name,
          public_desc,
          icon_url,
          is_published,
          updated_at
        )
      `,
    )
    .eq("client_id", profile.clientId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  const assignedRows = (data ?? []).filter((row): row is AccessRow =>
    Boolean(row?.workflow_id),
  );

  if (assignedRows.length === 0) {
    return [];
  }

  const workflowIds = assignedRows
    .map((row) => row.workflow?.id ?? row.workflow_id)
    .filter((value): value is string => Boolean(value));

  const lastRunMap = await loadLastRuns(supabase, profile.clientId, workflowIds);

  return assignedRows.map((row) => mapAssignedWorkflow(row, lastRunMap));
}

async function loadLastRuns(
  supabase: SupabaseClient,
  clientId: string,
  workflowIds: string[],
): Promise<Map<string, ExecutionRow>> {
  if (workflowIds.length === 0) {
    return new Map();
  }

  const uniqueWorkflowIds = Array.from(new Set(workflowIds));

  const { data, error } = await supabase
    .from("execution")
    .select("workflow_id, status, started_at, finished_at")
    .eq("client_id", clientId)
    .in("workflow_id", uniqueWorkflowIds)
    .order("started_at", { ascending: false })
    .limit(uniqueWorkflowIds.length * 5);

  if (error) {
    console.error("Failed to load last execution runs", error);
    return new Map();
  }

  const map = new Map<string, ExecutionRow>();

  for (const row of data ?? []) {
    const workflowId = row.workflow_id;
    if (workflowId && !map.has(workflowId)) {
      map.set(workflowId, row as ExecutionRow);
    }
  }

  return map;
}

export async function getClientWorkflowsData(options?: {
  supabase?: SupabaseClient;
}): Promise<ClientWorkflowsData> {
  const supabase = options?.supabase ?? (await getSupabaseServerClient());
  const accessContext = await getClientAccessContext({ supabase });

  const workflows = await loadAssignedWorkflows(supabase, accessContext.profile);

  // Pending requests exclude workflows the client already has access to.
  const assignedSet = new Set(accessContext.assignedWorkflowIds);
  const pendingRequestsRaw = accessContext.accessRequests.filter((request) =>
    request.status === "PENDING" && !assignedSet.has(request.workflowId),
  );

  const pendingRequests = await enrichPendingRequests(
    supabase,
    pendingRequestsRaw,
  );

  return {
    profile: accessContext.profile,
    workflows,
    pendingRequests,
  };
}

async function enrichPendingRequests(
  supabase: SupabaseClient,
  requests: Array<{
    id: string;
    workflowId: string;
    status: AccessRequestStatus;
    createdAt: string;
  }>,
): Promise<ClientPendingRequest[]> {
  if (requests.length === 0) {
    return [];
  }

  const workflowIds = Array.from(
    new Set(requests.map((request) => request.workflowId)),
  );

  const { data, error } = await supabase
    .from("workflow")
    .select("id, name, public_desc, icon_url")
    .in("id", workflowIds);

  if (error) {
    console.error("Failed to load workflow metadata for pending requests", error);
  }

  const workflowMap = new Map<string, WorkflowSummaryRow>();
  for (const row of data ?? []) {
    if (row?.id) {
      workflowMap.set(row.id, row as WorkflowSummaryRow);
    }
  }

  return requests.map((request) => {
    const workflow = workflowMap.get(request.workflowId) ?? null;
    return {
      id: request.id,
      workflowId: request.workflowId,
      status: request.status,
      createdAt: request.createdAt,
      workflowName:
        workflow?.name?.trim() && workflow.name.length > 0
          ? workflow.name
          : "Untitled workflow",
      workflowDescription: workflow?.public_desc ?? null,
      iconUrl: workflow?.icon_url ?? null,
    } satisfies ClientPendingRequest;
  });
}
