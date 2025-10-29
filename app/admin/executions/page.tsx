import { AdminExecutionsList } from "@/components/admin/executions/executions-table";
import {
  fetchExecutionFilterOptions,
  listExecutions,
  parseExecutionListSearchParams,
} from "@/lib/admin/executions/data";

type SearchParamsRecord = Record<string, string | string[] | undefined>;

type PageProps = {
  searchParams?: SearchParamsRecord | Promise<SearchParamsRecord>;
};

const TIMEZONE = process.env.APP_TIMEZONE ?? "Africa/Nairobi";

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as Promise<T>).then === "function"
  );
}

export default async function AdminExecutionsPage({ searchParams }: PageProps) {
  const resolvedSearchParams: SearchParamsRecord = searchParams
    ? isPromiseLike(searchParams)
      ? await searchParams
      : searchParams
    : {};

  let normalizedParams;
  try {
    normalizedParams = parseExecutionListSearchParams(resolvedSearchParams);
  } catch (error) {
    console.error("Invalid execution query parameters", error);
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Executions</h1>
          <p className="text-sm text-muted-foreground">
            Investigate execution runs across all clients with filters and diagnostics.
          </p>
        </div>
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Invalid filters supplied. Please adjust the query and try again.
        </div>
      </div>
    );
  }

  const data = await Promise.all([
    fetchExecutionFilterOptions(),
    listExecutions(normalizedParams),
  ]).catch((error) => {
    console.error("Failed to load executions", error);
    return null;
  });

  if (!data) {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Executions</h1>
          <p className="text-sm text-muted-foreground">
            Investigate execution runs across all clients with filters and diagnostics.
          </p>
        </div>
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          We could not load execution data at this time. Please refresh to try again.
        </div>
      </div>
    );
  }

  const [options, result] = data;

  const componentKey = [
    result.page,
    result.perPage,
    result.sort,
    result.appliedFilters.workflowIds.join(","),
    result.appliedFilters.status.join(","),
    result.appliedFilters.clientIds.join(","),
    result.appliedFilters.from,
    result.appliedFilters.to,
    result.appliedFilters.q ?? "",
  ].join("|");

  return (
    <AdminExecutionsList
      key={componentKey}
      result={result}
      options={options}
      timezone={TIMEZONE}
    />
  );
}
