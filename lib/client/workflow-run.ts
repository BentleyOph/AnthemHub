import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AccessRequestStatus } from "@/lib/access-requests/constants";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { parseJsonSchema, type JsonSchema } from "@/lib/schema/jsonschema";
import { resolveWorkflowIconUrl } from "@/lib/storage/workflow-icons";

import { getClientAccessContext } from "./access";
import type { ClientProfile } from "./profile";

type WorkflowRow = {
  id: string;
  name: string | null;
  public_desc: string | null;
  icon_url: string | null;
  input_schema: JsonSchema | null;
  is_published: boolean | null;
  n8n_webhook_url: string | null;
  updated_at: string;
};

type AccessRow = {
  created_at: string;
};

export interface WorkflowRunRequestState {
  id: string;
  status: AccessRequestStatus;
  createdAt: string;
  note: string | null;
}

export interface WorkflowRunData {
  profile: ClientProfile;
  workflow: {
    id: string;
    name: string;
    description: string;
    iconUrl: string | null;
    inputSchema: JsonSchema | null;
    isPublished: boolean;
    updatedAt: string;
  };
  hasAccess: boolean;
  assignedAt: string | null;
  request: WorkflowRunRequestState | null;
  canRequest: boolean;
}

async function mapWorkflow(row: WorkflowRow): Promise<WorkflowRunData["workflow"]> {
  let inputSchema: JsonSchema | null = null;

  if (row.input_schema) {
    try {
      inputSchema = parseJsonSchema(row.input_schema);
    } catch (error) {
      console.error("Failed to parse workflow input schema", error);
      inputSchema = null;
    }
  }

  const iconUrl = await resolveWorkflowIconUrl(row.icon_url ?? null);

  return {
    id: row.id,
    name:
      row.name?.trim() && row.name.length > 0
        ? row.name
        : "Untitled workflow",
    description:
      row.public_desc?.trim() && row.public_desc.length > 0
        ? row.public_desc
        : "No description provided yet.",
    iconUrl,
    inputSchema,
    isPublished: Boolean(row.is_published),
    updatedAt: row.updated_at,
  };
}

export async function getWorkflowRunData(
  workflowId: string,
  options?: { supabase?: SupabaseClient },
): Promise<WorkflowRunData | null> {
  const supabase = options?.supabase ?? (await getSupabaseServerClient());

  const accessContext = await getClientAccessContext({ supabase });

  const { data: workflowRow, error: workflowError } = await supabase
    .from("workflow")
    .select(
      `
        id,
        name,
        public_desc,
        icon_url,
        input_schema,
        is_published,
        n8n_webhook_url,
        updated_at
      `,
    )
    .eq("id", workflowId)
    .maybeSingle<WorkflowRow>();

  if (workflowError) {
    throw workflowError;
  }

  if (!workflowRow) {
    return null;
  }

  let assignment: AccessRow | null = null;

  if (accessContext.profile.clientId) {
    const { data: accessRow, error: accessError } = await supabase
      .from("client_workflow_access")
      .select("created_at")
      .eq("client_id", accessContext.profile.clientId)
      .eq("workflow_id", workflowId)
      .maybeSingle<AccessRow>();

    if (accessError && accessError.code !== "40600") {
      console.error("Failed to resolve workflow access mapping", accessError);
    }

    assignment = accessRow ?? null;
  }

  const request = accessContext.accessRequests.find(
    (candidate) => candidate.workflowId === workflowId,
  ) ?? null;

  const workflow = await mapWorkflow(workflowRow);

  return {
    profile: accessContext.profile,
    workflow,
    hasAccess: Boolean(assignment),
    assignedAt: assignment?.created_at ?? null,
    request: request
      ? {
          id: request.id,
          status: request.status,
          createdAt: request.createdAt,
          note: request.note ?? null,
        }
      : null,
    canRequest: Boolean(accessContext.profile.clientId),
  };
}
