import Link from "next/link";
import { Suspense } from "react";
import {
  IconAlertTriangle,
  IconInfoCircle,
  IconRefresh,
} from "@tabler/icons-react";

import { ClientExecutionsTable } from "@/components/client/executions-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DEFAULT_CLIENT_EXECUTIONS_PER_PAGE,
  getClientExecutions,
  getClientWorkflowFilterOptions,
  parseClientExecutionQuery,
  resolveClientExecutionFilters,
  type ClientExecutionListParams,
} from "@/lib/client/executions";

const TIMEZONE = process.env.APP_TIMEZONE ?? "Africa/Nairobi";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default function ClientExecutionsPage({ searchParams }: PageProps) {
  return (
    <Suspense fallback={<ExecutionsPageSkeleton />}>
      <ExecutionsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ExecutionsContent({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  let params: ClientExecutionListParams;
  try {
    params = parseClientExecutionQuery(resolvedSearchParams);
  } catch (error) {
    console.error("Invalid execution list params", error);
    params = {
      page: 1,
      perPage: DEFAULT_CLIENT_EXECUTIONS_PER_PAGE,
    } satisfies ClientExecutionListParams;
  }

  const filters = resolveClientExecutionFilters(resolvedSearchParams);

  let data;
  try {
    data = await getClientExecutions({
      params,
      filters,
    });
  } catch (error) {
    console.error("Failed to load client executions", error);
    return <ErrorState />;
  }

  if (!data.profile.clientId) {
    return <NoClientAssignment profileName={data.profile.clientName} />;
  }

  const workflowFilterOptions = await getClientWorkflowFilterOptions({
    clientId: data.profile.clientId,
  });

  const { executions, pagination } = data;
  const range = computeRange(pagination.page, pagination.perPage, pagination.total);
  const prevHref = pagination.prevPage
    ? buildPageHref(pagination.prevPage, pagination.perPage, resolvedSearchParams)
    : null;
  const nextHref = pagination.nextPage
    ? buildPageHref(pagination.nextPage, pagination.perPage, resolvedSearchParams)
    : null;
  const hasActiveFilters =
    (filters.status?.length ?? 0) > 0 ||
    Boolean(filters.startedBy) ||
    Boolean(filters.startedFrom) ||
    Boolean(filters.startedTo) ||
    Boolean(filters.workflowId) ||
    Boolean(filters.mineOnly);
  const tableKey = JSON.stringify(resolvedSearchParams);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Executions</h1>
        <CardDescription>
          Review your recent workflow runs, monitor status, and download generated files.
        </CardDescription>
      </section>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg">History &amp; Results</CardTitle>
          <CardDescription>
            Only executions from your workspace appear here. Data refreshes automatically as runs complete.
          </CardDescription>
        </div>
          <Badge variant="outline">Latest first</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <ClientExecutionsTable
            key={tableKey}
            items={executions}
            timezone={TIMEZONE}
            workflowFilterOptions={workflowFilterOptions}
          />
          {executions.length === 0 && !hasActiveFilters ? <EmptyState /> : null}
        </CardContent>
        {pagination.total > 0 ? (
          <CardFooter className="flex flex-col gap-3 border-t pt-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              {pagination.total === 0
                ? "No executions yet."
                : `Showing ${range.from}-${range.to} of ${pagination.total} execution${pagination.total === 1 ? "" : "s"}.`}
            </span>
            <div className="flex items-center gap-2">
              <Button asChild size="sm" variant="outline" disabled={!prevHref}>
                <Link href={prevHref ?? "#"} prefetch={false}>
                  Previous
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline" disabled={!nextHref}>
                <Link href={nextHref ?? "#"} prefetch={false}>
                  Next
                </Link>
              </Button>
            </div>
          </CardFooter>
        ) : null}
      </Card>
    </div>
  );
}

function computeRange(page: number, perPage: number, total: number) {
  if (total === 0) {
    return { from: 0, to: 0 };
  }

  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  return { from, to };
}

function buildPageHref(
  targetPage: number,
  perPage: number,
  searchParams: Record<string, string | string[] | undefined>,
) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (!value) continue;
    if (Array.isArray(value)) {
      value.forEach((entry) => params.append(key, entry));
    } else {
      params.set(key, value);
    }
  }

  if (targetPage <= 1) {
    params.delete("page");
  } else {
    params.set("page", String(targetPage));
  }

  if (perPage === DEFAULT_CLIENT_EXECUTIONS_PER_PAGE) {
    params.delete("per_page");
  } else {
    params.set("per_page", String(perPage));
  }

  const query = params.toString();
  return query ? `/executions?${query}` : "/executions";
}

function EmptyState() {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
      <div className="flex items-center gap-2 text-muted-foreground">
        <IconInfoCircle className="size-4" />
        <span>No executions recorded yet.</span>
      </div>
      <p>
        Run a workflow from the <Link href="/overview" className="underline">My Workflows</Link> page to see your execution history here.
      </p>
    </div>
  );
}

function ErrorState() {
  return (
    <Card className="border-destructive/40 bg-destructive/10">
      <CardHeader className="flex flex-row items-center gap-2">
        <IconAlertTriangle className="size-5 text-destructive" />
        <div>
          <CardTitle className="text-lg">Unable to load executions</CardTitle>
          <CardDescription className="text-sm">
            Please refresh the page. If the problem persists, contact your administrator.
          </CardDescription>
        </div>
      </CardHeader>
      <CardFooter className="pl-16">
        <Button variant="outline" size="sm" asChild>
          <Link href="/executions">
            <IconRefresh className="mr-2 size-4" />
            Try again
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

function NoClientAssignment({ profileName }: { profileName: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">No client workspace assigned</CardTitle>
        <CardDescription>
          {profileName} does not belong to a client account yet. Ask an administrator to link your user to a client to view execution history.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function ExecutionsPageSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-6 w-48" />
      <Card>
        <CardHeader className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[...Array(3)].map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
