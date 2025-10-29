import Link from "next/link";
import { Suspense } from "react";
import {
  IconArrowLeft,
  IconChevronRight,
} from "@tabler/icons-react";

import { ClientExecutionsTable } from "@/components/client/executions-table";
import { ClientNav } from "@/components/client/client-nav";
import { RequestAccessButton } from "@/components/client/request-access-button";
import { WorkflowIcon } from "@/components/client/workflow-icon";
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
  parseClientExecutionQuery,
  type ClientExecutionListParams,
} from "@/lib/client/executions";
import { getWorkflowRunData } from "@/lib/client/workflow-run";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const TIMEZONE = process.env.APP_TIMEZONE ?? "Africa/Nairobi";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function WorkflowExecutionHistoryPage({ params, searchParams }: PageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<HistorySkeleton />}>
      <HistoryContent workflowId={id} searchParams={searchParams} />
    </Suspense>
  );
}

async function HistoryContent({
  workflowId,
  searchParams,
}: {
  workflowId: string;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await getSupabaseServerClient();
  const resolvedSearchParams = (await searchParams) ?? {};

  const workflowData = await getWorkflowRunData(workflowId, { supabase });

  if (!workflowData) {
    return (
      <div className="flex flex-col gap-6">
        <ClientNav clientName="My Workspace" clientCompany={null} activeHref="/workflows" />
        <Card>
          <CardHeader>
            <CardTitle>Workflow not found</CardTitle>
            <CardDescription>
              The requested workflow could not be located or you no longer have access to it.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button variant="outline" size="sm" asChild>
              <Link href="/workflows">
                <IconArrowLeft className="mr-2 size-4" />
                Back to workflows
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const {
    profile,
    workflow,
    hasAccess,
    request,
    assignedAt,
    canRequest,
  } = workflowData;

  if (!hasAccess) {
    return (
      <div className="flex flex-col gap-6">
        <ClientNav
          clientName={profile.clientName}
          clientCompany={profile.clientCompany}
          activeHref="/workflows"
        />

        <Button variant="ghost" size="sm" asChild>
          <Link href="/workflows">
            <IconArrowLeft className="mr-2 size-4" />
            Back to workflows
          </Link>
        </Button>

        <WorkflowSummaryCard
          workflowName={workflow.name}
          workflowDescription={workflow.description}
          iconUrl={workflow.iconUrl}
          workflowId={workflow.id}
          isPublished={workflow.isPublished}
          assignedAt={assignedAt}
          requestStatus={request?.status ?? null}
        />

        <Card className="border-dashed">
          <CardHeader className="space-y-3">
            <CardTitle>Access required</CardTitle>
            <CardDescription>
              You do not currently have permission to view the history for this workflow.
            </CardDescription>
            <div className="flex flex-wrap items-center gap-3">
              <RequestAccessButton
                workflowId={workflow.id}
                workflowName={workflow.name}
                status={request?.status ?? null}
                disabled={!canRequest}
                disabledReason={
                  canRequest
                    ? null
                    : "You must be linked to a client workspace before requesting access."
                }
              />
              <Button variant="ghost" size="sm" asChild>
                <Link href="/catalog">
                  View catalog
                  <IconChevronRight className="ml-1 size-3.5" />
                </Link>
              </Button>
            </div>
          </CardHeader>
        </Card>
      </div>
    );
  }

  let params: ClientExecutionListParams;
  try {
    params = parseClientExecutionQuery(resolvedSearchParams);
  } catch (error) {
    console.error("Invalid execution list params", error);
    params = {
      page: 1,
      perPage: DEFAULT_CLIENT_EXECUTIONS_PER_PAGE,
    };
  }

  let executionsResult;
  try {
    executionsResult = await getClientExecutions({
      params,
      filters: { workflowId },
      supabase,
    });
  } catch (error) {
    console.error("Failed to load workflow execution history", error);
    return (
      <ErrorState
        workflowId={workflow.id}
        workflowName={workflow.name}
        profileName={profile.clientName}
        profileCompany={profile.clientCompany}
      />
    );
  }

  const { executions, pagination } = executionsResult;
  const range = computeRange(pagination.page, pagination.perPage, pagination.total);
  const prevHref = pagination.prevPage
    ? buildPageHref(workflowId, pagination.prevPage, pagination.perPage, resolvedSearchParams)
    : null;
  const nextHref = pagination.nextPage
    ? buildPageHref(workflowId, pagination.nextPage, pagination.perPage, resolvedSearchParams)
    : null;

  return (
    <div className="flex flex-col gap-6">
      <ClientNav
        clientName={profile.clientName}
        clientCompany={profile.clientCompany}
        activeHref="/workflows"
      />

      <Button variant="ghost" size="sm" asChild>
        <Link href="/workflows">
          <IconArrowLeft className="mr-2 size-4" />
          Back to workflows
        </Link>
      </Button>

      <WorkflowSummaryCard
        workflowName={workflow.name}
        workflowDescription={workflow.description}
        iconUrl={workflow.iconUrl}
        workflowId={workflow.id}
        isPublished={workflow.isPublished}
        assignedAt={assignedAt}
        requestStatus={request?.status ?? null}
      />

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg">Run history</CardTitle>
            <CardDescription>
              All executions for this workflow in your workspace.
            </CardDescription>
          </div>
          <Button asChild size="sm">
            <Link href={`/workflows/${workflow.id}/run`}>
              Run workflow
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {executions.length > 0 ? (
            <ClientExecutionsTable items={executions} timezone={TIMEZONE} />
          ) : (
            <div className="flex flex-col gap-2 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              <span>No executions recorded for this workflow yet.</span>
              <span>
                Start a run to see activity here.
              </span>
            </div>
          )}
        </CardContent>
        {executions.length > 0 ? (
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

interface WorkflowSummaryCardProps {
  workflowName: string;
  workflowDescription: string;
  iconUrl: string | null;
  workflowId: string;
  isPublished: boolean;
  assignedAt: string | null;
  requestStatus: string | null;
}

function WorkflowSummaryCard({
  workflowName,
  workflowDescription,
  iconUrl,
  workflowId,
  isPublished,
  assignedAt,
  requestStatus,
}: WorkflowSummaryCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <WorkflowIcon iconUrl={iconUrl} name={workflowName} />
          <div className="space-y-2">
            <CardTitle className="text-2xl font-semibold leading-tight">
              {workflowName}
            </CardTitle>
            <CardDescription className="text-base leading-relaxed">
              {workflowDescription}
            </CardDescription>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>Workflow ID:</span>
              <code className="rounded bg-muted px-2 py-1 font-mono text-[11px]">{workflowId}</code>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={isPublished ? "default" : "secondary"}>
            {isPublished ? "Published" : "Draft"}
          </Badge>
          {assignedAt ? (
            <Badge variant="outline">Assigned: {formatDateShort(assignedAt)}</Badge>
          ) : null}
          {requestStatus ? <Badge variant="outline">Request: {requestStatus.toLowerCase()}</Badge> : null}
        </div>
      </CardHeader>
    </Card>
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
  workflowId: string,
  targetPage: number,
  perPage: number,
  searchParams: Record<string, string | string[] | undefined>,
) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "page" || key === "per_page") continue;
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
  return query ? `/workflows/${workflowId}/executions?${query}` : `/workflows/${workflowId}/executions`;
}

function formatDateShort(iso: string | null): string {
  if (!iso) {
    return "Pending";
  }

  try {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeZone: TIMEZONE,
    });
    return formatter.format(new Date(iso));
  } catch (error) {
    console.error("Failed to format date", error);
    return "Pending";
  }
}

function ErrorState({
  workflowId,
  workflowName,
  profileName,
  profileCompany,
}: {
  workflowId: string;
  workflowName: string;
  profileName: string;
  profileCompany: string | null;
}) {
  return (
    <div className="flex flex-col gap-6">
      <ClientNav clientName={profileName} clientCompany={profileCompany} activeHref="/workflows" />
      <Card className="border-destructive/40 bg-destructive/10">
        <CardHeader>
          <CardTitle className="text-lg">Unable to load history</CardTitle>
          <CardDescription>
            Something went wrong while loading executions for {workflowName}. Please try again later.
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/workflows/${workflowId}/executions`}>
              Retry
            </Link>
          </Button>
          <Button variant="secondary" size="sm" asChild>
            <Link href={`/workflows/${workflowId}/run`}>
              Start a run
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

function HistorySkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-20 rounded-xl" />
      <Skeleton className="h-8 w-36" />
      <Card>
        <CardHeader className="flex items-center gap-3">
          <Skeleton className="size-12 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader className="space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
