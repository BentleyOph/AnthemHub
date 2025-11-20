import "server-only";

import type {
  PostgrestError,
  PostgrestSingleResponse,
  SupabaseClient,
} from "@supabase/supabase-js";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getClientProfile } from "./profile";
import type { AccessRequestStatus } from "@/lib/access-requests/constants";
import { resolveWorkflowIconUrl } from "@/lib/storage/workflow-icons";

export type ExecutionStatus = "PENDING" | "PROCESSING" | "SUCCESS" | "ERROR";

export type ClientOverviewAssignedWorkflow = {
  id: string;
  name: string;
  description: string;
  iconUrl: string | null;
  isPublished: boolean;
  runHref: string;
  detailsHref: string;
};

export type ClientOverviewMetrics = {
  executionsThisMonth: number;
  successRate30d: number | null;
  timeSavedMinutes30d: number | null;
  lastRunAt: string | null;
};

export type ClientOverviewExecution = {
  id: string;
  workflowId: string;
  workflowName: string;
  status: ExecutionStatus;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
};

export type ClientOverviewDiscoverItem = {
  id: string;
  name: string;
  description: string;
  iconUrl: string | null;
  requestStatus: AccessRequestStatus | null;
};

export type ClientOverviewData = {
  userName: string | null;
  userEmail: string | null;
  clientId: string | null;
  clientName: string;
  clientCompany: string | null;
  assignedWorkflowCount: number;
  assignedHero: ClientOverviewAssignedWorkflow[];
  metrics: ClientOverviewMetrics;
  recentExecutions: ClientOverviewExecution[];
  discover: ClientOverviewDiscoverItem[];
};

type AssignedWorkflowRow = {
  workflow_id: string;
  created_at: string;
  workflow: {
    id: string;
    name: string | null;
    public_desc: string | null;
    icon_url: string | null;
    is_published: boolean | null;
  } | null;
};

type RecentExecutionRow = {
  id: string;
  status: ExecutionStatus;
  workflow_id: string;
  started_at: string;
  finished_at: string | null;
  workflow: {
    id: string;
    name: string | null;
  } | null;
};

type DiscoverWorkflowRow = {
  id: string;
  name: string | null;
  public_desc: string | null;
  icon_url: string | null;
};

type ExecutionWithEstimateRow = {
  workflow: {
    estimated_minutes_saved: number | null;
  } | null;
};

function computeDurationMs(
  startedAt: string,
  finishedAt: string | null,
): number | null {
  const started = Date.parse(startedAt);
  if (Number.isNaN(started)) return null;

  if (!finishedAt) return null;

  const finished = Date.parse(finishedAt);
  if (Number.isNaN(finished) || finished < started) return null;

  return finished - started;
}

function isMissingColumnError(
  error: PostgrestError | null | undefined,
  column: string,
): boolean {
  if (!error) {
    return false;
  }

  const message = error?.message?.toLowerCase() ?? "";

  return (
    error?.code === "42703" ||
    (message.includes("column") && message.includes(column.toLowerCase()))
  );
}

async function computeEstimatedTimeSavedMinutes(
  supabase: SupabaseClient,
  clientId: string,
  sinceIso: string,
): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from("execution")
      .select(
        `
          workflow:workflow (
            estimated_minutes_saved
          )
        `,
      )
      .eq("client_id", clientId)
      .eq("status", "SUCCESS")
      .gte("started_at", sinceIso);

    if (error) {
      if (isMissingColumnError(error, "estimated_minutes_saved")) {
        return null;
      }

      console.error("Failed to resolve estimated minutes saved", error);
      return null;
    }

    const rows = (data ?? []) as ExecutionWithEstimateRow[];
    if (rows.length === 0) {
      return 0;
    }

    let hasEstimate = false;
    const totalMinutes = rows.reduce((acc, row) => {
      const minutes = row.workflow?.estimated_minutes_saved;
      if (minutes === null || minutes === undefined) {
        return acc;
      }
      const numeric = Number(minutes);
      if (!Number.isFinite(numeric)) {
        return acc;
      }
      hasEstimate = true;
      return acc + numeric;
    }, 0);

    if (!hasEstimate) {
      return null;
    }

    return totalMinutes > 0 ? totalMinutes : 0;
  } catch (error) {
    console.error("Unexpected failure while computing time saved", error);
    return null;
  }
}

export async function getClientOverviewData(): Promise<ClientOverviewData> {
  const supabase = await getSupabaseServerClient();
  const profile = await getClientProfile({ supabase });
  const clientId = profile.clientId;
  const clientName = profile.clientName;
  const clientCompany = profile.clientCompany;

  if (!clientId) {
    return {
      userName: profile.userName,
      userEmail: profile.userEmail,
      clientId: null,
      clientName,
      clientCompany,
      assignedWorkflowCount: 0,
      assignedHero: [],
      metrics: {
        executionsThisMonth: 0,
        successRate30d: null,
        timeSavedMinutes30d: null,
        lastRunAt: null,
      },
      recentExecutions: [],
      discover: [],
    };
  }

  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const lookback30 = new Date(now);
  lookback30.setUTCDate(lookback30.getUTCDate() - 30);

  const monthStartIso = startOfMonth.toISOString();
  const last30Iso = lookback30.toISOString();

  const [
    assignedResult,
    monthCountResult,
    total30Result,
    success30Result,
    lastRunResult,
    recentExecutionsResult,
    timeSavedMinutes,
  ] = await Promise.all([
    supabase
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
            is_published
          )
        `,
      )
      .eq("client_id", clientId)
      .order("created_at", { ascending: false }),
    supabase
      .from("execution")
      .select("*", { head: true, count: "exact" })
      .eq("client_id", clientId)
      .gte("started_at", monthStartIso),
    supabase
      .from("execution")
      .select("*", { head: true, count: "exact" })
      .eq("client_id", clientId)
      .gte("started_at", last30Iso),
    supabase
      .from("execution")
      .select("*", { head: true, count: "exact" })
      .eq("client_id", clientId)
      .eq("status", "SUCCESS")
      .gte("started_at", last30Iso),
    supabase
      .from("execution")
      .select("started_at")
      .eq("client_id", clientId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("execution")
      .select(
        `
          id,
          status,
          workflow_id,
          started_at,
          finished_at,
          workflow:workflow (
            id,
            name
          )
        `,
      )
      .eq("client_id", clientId)
      .order("started_at", { ascending: false })
      .limit(10),
    computeEstimatedTimeSavedMinutes(supabase, clientId, last30Iso),
  ]);

  if (assignedResult.error) {
    throw assignedResult.error;
  }

  if (monthCountResult.error) {
    throw monthCountResult.error;
  }

  if (total30Result.error) {
    throw total30Result.error;
  }

  if (success30Result.error) {
    throw success30Result.error;
  }

  if (lastRunResult.error) {
    throw lastRunResult.error;
  }

  if (recentExecutionsResult.error) {
    throw recentExecutionsResult.error;
  }

  const assignedRows = (assignedResult.data ?? []) as unknown as AssignedWorkflowRow[];
  const assignedWorkflowCount = assignedRows.length;
  const assignedWorkflowIds = assignedRows
    .map((row) => row.workflow_id)
    .filter(Boolean);

  const assignedHero = await Promise.all(
    assignedRows
      .filter((row) => row.workflow && row.workflow.id)
      .slice(0, 3)
      .map(async (row): Promise<ClientOverviewAssignedWorkflow> => {
        const workflow = row.workflow!;
        const iconUrl = await resolveWorkflowIconUrl(workflow.icon_url ?? null);
        return {
          id: workflow.id,
          name: workflow.name ?? "Untitled workflow",
          description:
            workflow.public_desc?.trim() ?? "No description provided.",
          iconUrl,
          isPublished: Boolean(workflow.is_published),
          runHref: `/workflows/${workflow.id}/run`,
          detailsHref: `/workflows/${workflow.id}`,
        };
      }),
  );

  const total30 = total30Result.count ?? 0;
  const success30 = success30Result.count ?? 0;
  const successRate30d =
    total30 > 0 ? Number(((success30 / total30) * 100).toFixed(1)) : 0;

  const monthExecutions = monthCountResult.count ?? 0;
  const lastRunAt = (lastRunResult as PostgrestSingleResponse<{ started_at: string }>).data
    ?.started_at ?? null;

  const recentRows = (recentExecutionsResult.data ?? []) as unknown as RecentExecutionRow[];
  const recentExecutions = recentRows.map(
    (row): ClientOverviewExecution => ({
      id: row.id,
      workflowId: row.workflow_id,
      workflowName: row.workflow?.name ?? "Unnamed workflow",
      status: row.status,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      durationMs: computeDurationMs(row.started_at, row.finished_at),
    }),
  );

  // Fetch pending/previous access requests for the current user to decorate Discover items
  const { data: requestsData, error: requestsError } = await supabase
    .from("access_request")
    .select("workflow_id, status, created_at")
    .eq("client_id", clientId)
    .eq("requester_id", profile.userId)
    .order("created_at", { ascending: false });

  if (requestsError && requestsError.code !== "42501") {
    console.error("Failed to load access requests for discover", requestsError);
  }

  const requestMap = new Map<string, { status: AccessRequestStatus | null; created_at: string }>();
  (requestsData ?? []).forEach((row: { workflow_id: string; status: string | null; created_at: string }) => {
    requestMap.set(row.workflow_id, {
      status: (row.status as AccessRequestStatus) ?? null,
      created_at: row.created_at,
    });
  });

  const { data: discoverData, error: discoverError } = await supabase
    .from("workflow")
    .select(
      `
        id,
        name,
        public_desc,
        icon_url,
        is_published
      `,
    )
    .eq("is_published", true)
    .order("updated_at", { ascending: false })
    .limit(20);

  if (discoverError) {
    throw discoverError;
  }

  const discover = await Promise.all(
    (discoverData ?? [])
      .filter(
        (row: DiscoverWorkflowRow & { is_published?: boolean | null }) =>
          Boolean(row) && !assignedWorkflowIds.includes(row.id),
      )
      .slice(0, 10)
      .map(async (row): Promise<ClientOverviewDiscoverItem> => {
        const req = requestMap.get(row.id);
        const iconUrl = await resolveWorkflowIconUrl(row.icon_url ?? null);
        return {
          id: row.id,
          name: row.name ?? "Untitled workflow",
          description: row.public_desc?.trim() ?? "Discover what's possible.",
          iconUrl,
          requestStatus: req?.status ?? null,
        };
      }),
  );

  return {
    userName: profile.userName,
    userEmail: profile.userEmail,
    clientId,
    clientName,
    clientCompany,
    assignedWorkflowCount,
    assignedHero,
    metrics: {
      executionsThisMonth: monthExecutions,
      successRate30d,
      timeSavedMinutes30d: timeSavedMinutes,
      lastRunAt,
    },
    recentExecutions,
    discover,
  };
}
