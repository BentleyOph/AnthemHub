import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AccessRequestStatus } from "@/lib/access-requests/constants";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { resolveWorkflowIconUrl } from "@/lib/storage/workflow-icons";

import {
  getClientAccessContext,
  type ClientAccessContext,
} from "./access";

type WorkflowRow = {
  id: string;
  name: string | null;
  public_desc: string | null;
  icon_url: string | null;
  is_published: boolean | null;
  updated_at: string;
};

export interface CatalogWorkflowItem {
  id: string;
  name: string;
  description: string;
  iconUrl: string | null;
  isAssigned: boolean;
  requestId: string | null;
  requestStatus: AccessRequestStatus | null;
  requestedAt: string | null;
}

export interface ClientCatalogData {
  profile: ClientAccessContext["profile"];
  workflows: CatalogWorkflowItem[];
  totalAssigned: number;
}

async function mapWorkflowRow(
  row: WorkflowRow,
  assignedSet: Set<string>,
  requestMap: Map<string, ClientAccessContext["accessRequests"][number]>,
): Promise<CatalogWorkflowItem> {
  const request = requestMap.get(row.id ?? "");
  const iconUrl = await resolveWorkflowIconUrl(row.icon_url);

  return {
    id: row.id,
    name: row.name?.trim() && row.name.length > 0 ? row.name : "Untitled workflow",
    description:
      row.public_desc?.trim() && row.public_desc.length > 0
        ? row.public_desc
        : "No description provided yet.",
    iconUrl,
    isAssigned: assignedSet.has(row.id),
    requestId: request?.id ?? null,
    requestStatus: request?.status ?? null,
    requestedAt: request?.createdAt ?? null,
  };
}

async function loadWorkflows(
  supabase: SupabaseClient,
  context: ClientAccessContext,
): Promise<CatalogWorkflowItem[]> {
  const assignedSet = new Set(context.assignedWorkflowIds);
  const requestMap = new Map(
    context.accessRequests.map((request) => [request.workflowId, request]),
  );

  const { data, error } = await supabase
    .from("workflow")
    .select("id, name, public_desc, icon_url, is_published, updated_at")
    .eq("is_published", true)
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  const rows = (data ?? []).filter((row): row is WorkflowRow => Boolean(row?.id));

  return Promise.all(rows.map((row) => mapWorkflowRow(row, assignedSet, requestMap)));
}

export async function getClientCatalogData(options?: {
  supabase?: SupabaseClient;
}): Promise<ClientCatalogData> {
  const supabase = options?.supabase ?? (await getSupabaseServerClient());
  const context = await getClientAccessContext({ supabase });

  const workflows = await loadWorkflows(supabase, context);

  return {
    profile: context.profile,
    workflows,
    totalAssigned: context.assignedWorkflowIds.length,
  };
}
