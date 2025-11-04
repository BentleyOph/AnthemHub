import { AdminWorkflowsTable } from "@/components/admin/workflows/workflows-table";
import {
  listWorkflows,
  normalizeWorkflowListParams,
  type WorkflowListParams,
} from "@/lib/admin/workflows/data";

type SearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  searchParams?: SearchParams | Promise<SearchParams>;
};

const TIMEZONE = process.env.APP_TIMEZONE ?? "Africa/Nairobi";
const WORKFLOW_STATUS_FILTERS = ["ALL", "PUBLISHED", "DRAFT"] as const;
type WorkflowStatusFilter = (typeof WORKFLOW_STATUS_FILTERS)[number];
const WORKFLOW_STATUS_SET = new Set<WorkflowStatusFilter>(WORKFLOW_STATUS_FILTERS);

function isPromiseLike<T>(value: Promise<T> | T): value is Promise<T> {
  return typeof value === "object" && value !== null && "then" in value;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function firstStatus(value: string | string[] | undefined): WorkflowStatusFilter | undefined {
  const raw = firstValue(value);
  if (!raw) return undefined;
  return WORKFLOW_STATUS_SET.has(raw as WorkflowStatusFilter) ? (raw as WorkflowStatusFilter) : undefined;
}

function coerceParams(searchParams?: SearchParams): WorkflowListParams {
  return {
    page: firstValue(searchParams?.page),
    per_page: firstValue(searchParams?.per_page),
    q: firstValue(searchParams?.q),
    status: firstStatus(searchParams?.status),
  };
}

export default async function AdminWorkflowsPage({ searchParams }: PageProps) {
  const resolvedSearchParams = searchParams
    ? isPromiseLike(searchParams)
      ? await searchParams
      : searchParams
    : {};

  let normalized;
  try {
    normalized = normalizeWorkflowListParams(coerceParams(resolvedSearchParams));
  } catch (error) {
    console.error("Invalid workflow list query parameters", error);
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Workflows</h1>
          <p className="text-sm text-muted-foreground">
            Build, publish, and govern workflows available to clients.
          </p>
        </div>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          Invalid filters supplied. Please adjust the query parameters and try again.
        </div>
      </div>
    );
  }

  const result = await listWorkflows(normalized).catch((error) => {
    console.error("Failed to load workflows", error);
    return null;
  });

  if (!result) {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Workflows</h1>
          <p className="text-sm text-muted-foreground">
            Build, publish, and govern workflows available to clients.
          </p>
        </div>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          We could not load workflow data at this time. Please refresh to try again.
        </div>
      </div>
    );
  }

  const key = [result.page, result.perPage, result.search ?? "", result.status].join("|");

  return <AdminWorkflowsTable key={key} result={result} timeZone={TIMEZONE} />;
}
