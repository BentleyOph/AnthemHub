import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  IconArrowLeft,
  IconDownload,
  IconHistory,
  IconPlayerPlay,
} from "@tabler/icons-react";

import { ClientExecutionTimeline } from "@/components/client/execution-timeline";
import { ClientExecutionStatusBadge } from "@/components/client/execution-status-badge";
import { ExecutionResult } from "@/components/client/execution-result";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getClientExecutionDetail,
  getClientExecutionEvents,
  type ClientExecutionEvent,
} from "@/lib/client/execution-detail";
import type { ClientExecutionStatus } from "@/lib/client/executions";

const TIMEZONE = process.env.APP_TIMEZONE ?? "Africa/Nairobi";
const LIVE_STATUSES = new Set<ClientExecutionStatus>(["PENDING", "PROCESSING"]);

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ClientExecutionDetailPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<ExecutionDetailSkeleton />}>
      <ExecutionDetailContent executionId={id} />
    </Suspense>
  );
}

async function ExecutionDetailContent({ executionId }: { executionId: string }) {
  const detail = await getClientExecutionDetail(executionId);

  if (!detail) {
    notFound();
  }

  const { profile, execution } = detail;
  let events: ClientExecutionEvent[] = [];

  try {
    events = await getClientExecutionEvents(executionId);
  } catch (error) {
    console.error("Failed to load execution events", error);
  }

  const isLive = LIVE_STATUSES.has(execution.status);

  return (
    <div className="flex flex-col gap-8">
      <Button variant="ghost" size="sm" asChild className="w-fit">
        <Link href="/executions">
          <IconArrowLeft className="mr-2 size-4" />
          Back to executions
        </Link>
      </Button>

      <Card className="overflow-hidden">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex-1 space-y-3">
              <CardTitle className="text-2xl font-semibold leading-tight">
                {execution.workflowName}
              </CardTitle>
              <CardDescription className="max-w-3xl leading-relaxed">
                {execution.workflowDescription ?? "No public description provided for this workflow yet."}
              </CardDescription>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span>Execution ID:</span>
                <code className="rounded bg-muted px-2 py-1 font-mono text-[11px]">
                  {execution.id}
                </code>
                <span className="hidden md:inline">•</span>
                <span>Workflow ID:</span>
                <code className="rounded bg-muted px-2 py-1 font-mono text-[11px]">
                  {execution.workflowId}
                </code>
              </div>
            </div>
            <div className="flex flex-col items-start gap-3 lg:items-end">
              <ClientExecutionStatusBadge
                executionId={execution.id}
                initialStatus={execution.status}
                isLive={isLive}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  asChild
                >
                  <Link href={`/workflows/${execution.workflowId}/run`}>
                    <IconPlayerPlay className="mr-2 size-4" />
                    Run again
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                >
                  <Link href={`/workflows/${execution.workflowId}/executions`}>
                    <IconHistory className="mr-2 size-4" />
                    Workflow history
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <dl className="grid gap-6 text-sm sm:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <dt className="font-semibold text-foreground">Started</dt>
              <dd className="text-muted-foreground">{formatDateTime(execution.startedAt, TIMEZONE)}</dd>
            </div>
            <div className="space-y-2">
              <dt className="font-semibold text-foreground">Finished</dt>
              <dd className="text-muted-foreground">{formatDateTime(execution.finishedAt, TIMEZONE)}</dd>
            </div>
            <div className="space-y-2">
              <dt className="font-semibold text-foreground">Duration</dt>
              <dd className="text-muted-foreground">{formatDuration(execution.durationMs)}</dd>
            </div>
            <div className="space-y-2">
              <dt className="font-semibold text-foreground">Result</dt>
              <dd>
                {execution.resultFileUrl ? (
                  <Button asChild size="sm" variant="outline">
                    <a href={execution.resultFileUrl} target="_blank" rel="noreferrer">
                      <IconDownload className="mr-2 size-4" />
                      Download file
                    </a>
                  </Button>
                ) : execution.outputPayload != null ? (
                  <span className="text-muted-foreground">Displayed below</span>
                ) : (
                  <span className="text-muted-foreground">Not available</span>
                )}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
        <ClientExecutionTimeline
          executionId={execution.id}
          initialEvents={events}
          isLive={isLive}
          timezone={TIMEZONE}
        />

        <Card>
          <CardHeader>
            <CardTitle>Input summary</CardTitle>
            <CardDescription>
              Values provided when starting this run.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="max-h-96 w-full max-w-full overflow-auto rounded-md bg-muted p-4 text-xs leading-relaxed whitespace-pre-wrap break-all">
              {prettyJson(execution.inputPayload)}
            </pre>
          </CardContent>
        </Card>
      </div>

      <ExecutionResult
        executionId={execution.id}
        isLive={isLive}
        initialOutput={execution.outputPayload}
        initialFileUrl={execution.resultFileUrl}
      />
    </div>
  );
}

function formatDateTime(value: string | null, timezone: string): string {
  if (!value) {
    return "--";
  }

  try {
    const formatter = new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    });
    return formatter.format(new Date(value));
  } catch (error) {
    console.error("Failed to format datetime", error);
    return value;
  }
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms < 0) {
    return "--";
  }

  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 1) {
    return "<1s";
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 && hours === 0) parts.push(`${seconds}s`);

  return parts.join(" ") || "0s";
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    console.error("Failed to stringify JSON", error);
    return String(value);
  }
}

function ExecutionDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-40" />
      <Card>
        <CardHeader className="space-y-3">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-44" />
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-40" />
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-60" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-36" />
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
