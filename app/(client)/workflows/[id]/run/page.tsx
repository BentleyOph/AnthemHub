import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  IconArrowLeft,
  IconChevronRight,
} from "@tabler/icons-react";

import { RequestAccessButton } from "@/components/client/request-access-button";
import { WorkflowIcon } from "@/components/client/workflow-icon";
import { WorkflowRunForm } from "@/components/client/workflow-run-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getClientExecutionDetail } from "@/lib/client/execution-detail";
import { getWorkflowRunData } from "@/lib/client/workflow-run";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const TIMEZONE = process.env.APP_TIMEZONE ?? "Africa/Nairobi";

type WorkflowRunData = NonNullable<Awaited<ReturnType<typeof getWorkflowRunData>>>;

interface WorkflowRunPageProps {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function WorkflowRunPage({ params, searchParams }: WorkflowRunPageProps) {
  const { id } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const prefillExecutionId = firstValue(resolvedSearchParams.prefill);

  return (
    <Suspense fallback={<RunSkeleton />}>
      <WorkflowRunContent workflowId={id} prefillExecutionId={prefillExecutionId} />
    </Suspense>
  );
}

async function WorkflowRunContent({
  workflowId,
  prefillExecutionId,
}: {
  workflowId: string;
  prefillExecutionId?: string | undefined;
}) {
  const supabase = await getSupabaseServerClient();
  const data = await getWorkflowRunData(workflowId, { supabase });

  if (!data) {
    notFound();
  }

  const { workflow, hasAccess, request, assignedAt, canRequest, presets } =
    data;
  let prefillInput: unknown = null;

  if (prefillExecutionId) {
    try {
      const executionDetail = await getClientExecutionDetail(prefillExecutionId, { supabase });
      if (executionDetail?.execution.workflowId === workflowId) {
        prefillInput = executionDetail.execution.inputPayload ?? null;
      }
    } catch (error) {
      console.error("Failed to resolve workflow run prefill input", error);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <Button variant="ghost" size="sm" asChild className="w-fit">
        <Link href="/workflows">
          <IconArrowLeft className="mr-2 size-4" /> Back to workflows
        </Link>
      </Button>

      <Card>
        <CardHeader className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
            <div className="flex flex-1 items-start gap-3">
              <WorkflowIcon iconUrl={workflow.iconUrl} name={workflow.name} />
              <div className="space-y-2">
                <CardTitle className="text-2xl font-semibold leading-tight">
                  {workflow.name}
                </CardTitle>
                <CardDescription className="text-base leading-relaxed">
                  {workflow.description}
                </CardDescription>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>Workflow ID: {workflow.id}</span>
                  <span>•</span>
                  <span>Updated {formatDate(workflow.updatedAt) ?? "recently"}</span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 md:justify-end md:self-start">
              {workflow.isPublished ? (
                <Badge variant="default">Published</Badge>
              ) : (
                <Badge variant="secondary">Draft</Badge>
              )}
              {hasAccess ? <Badge variant="outline">Assigned</Badge> : null}
              {request ? <RequestStatusBadge status={request.status} /> : null}
            </div>
          </div>
          <MetadataList
            hasAccess={hasAccess}
            assignedAt={assignedAt}
            request={request}
          />
          <SchedulingSummary presets={presets} />
        </CardHeader>
      </Card>

      {!hasAccess ? (
        <Card className="border-dashed">
          <CardHeader className="space-y-3">
            <CardTitle>Access required</CardTitle>
            <CardDescription>
              You do not currently have permission to run this workflow. Request access and an admin will review it.
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
                    : "A client workspace must be linked to your account before requesting access."
                }
              />
              <Button variant="ghost" size="sm" asChild>
                <Link href="/catalog">
                  View catalog
                  <IconChevronRight className="size-3.5" />
                </Link>
              </Button>
            </div>
          </CardHeader>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Input </CardTitle>
          <CardDescription>
            Provide the fields required by this workflow
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WorkflowRunForm
            key={workflow.id}
            workflowId={workflow.id}
            workflowName={workflow.name}
            schema={workflow.inputSchema}
            disabled={!hasAccess}
            prefillInput={prefillInput ?? undefined}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function firstValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function RequestStatusBadge({
  status,
}: {
  status: NonNullable<WorkflowRunData["request"]>["status"];
}) {
  if (status === "PENDING") {
    return <Badge variant="secondary">Request pending</Badge>;
  }

  if (status === "APPROVED") {
    return <Badge variant="outline">Request approved</Badge>;
  }

  if (status === "DENIED") {
    return <Badge variant="destructive">Request denied</Badge>;
  }

  return null;
}

function MetadataList({
  hasAccess,
  assignedAt,
  request,
}: {
  hasAccess: boolean;
  assignedAt: string | null;
  request: WorkflowRunData["request"];
}) {
  if (!hasAccess && !request) {
    return null;
  }

  return (
    <dl className="grid gap-4 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
      {hasAccess ? (
        <div>
          <dt className="font-medium text-foreground">Assigned</dt>
          <dd>{assignedAt ? formatDate(assignedAt) : "Awaiting assignment"}</dd>
        </div>
      ) : null}
      {request ? (
        <div>
          <dt className="font-medium text-foreground">Access request</dt>
          <dd>{formatDate(request.createdAt) ?? "Pending"}</dd>
        </div>
      ) : null}
    </dl>
  );
}

function SchedulingSummary({
  presets,
}: {
  presets: WorkflowRunData["presets"];
}) {
  const entries = presets.flatMap((preset) =>
    preset.schedules.map((schedule) => ({
      presetName: preset.name,
      schedule,
    })),
  );

  if (entries.length === 0) {
    return (
      <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
        This workflow is not scheduled. Use the form below to run it on-demand.
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground space-y-1.5">
      <div className="text-foreground font-medium text-sm">Scheduled runs</div>
      {entries.map(({ presetName, schedule }) => (
        <div
          key={schedule.id}
          className="flex flex-wrap items-center gap-2"
        >
          <span className="font-medium text-foreground">{presetName}</span>
          <span>·</span>
          <span>{schedule.name}</span>
          <span>·</span>
          <span>
            next:{" "}
            {schedule.nextRunAt
              ? formatDate(schedule.nextRunAt) ?? "pending"
              : "pending"}
          </span>
        </div>
      ))}
    </div>
  );
}

function formatDate(iso: string | null): string | null {
  if (!iso) {
    return null;
  }

  try {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: TIMEZONE,
    });

    return formatter.format(new Date(iso));
  } catch (error) {
    console.error("Failed to format date", error);
    return null;
  }
}

function RunSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-32" />
      <Card>
        <CardHeader className="space-y-4">
          <div className="flex items-start gap-3">
            <Skeleton className="size-12 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-6 w-64" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
