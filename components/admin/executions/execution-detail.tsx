"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import {
  IconAlertTriangle,
  IconArrowDown,
  IconCopy,
  IconFileExport,
  IconLoader,
  IconPlayerPlay,
  IconRefresh,
} from "@tabler/icons-react";

import type {
  ExecutionDetail,
  ExecutionEventItem,
  ExecutionEventsResult,
} from "@/lib/admin/executions/data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useExecutionStream } from "@/hooks/use-execution-stream";

type Props = {
  execution: ExecutionDetail;
  events: ExecutionEventsResult;
  timezone: string;
};

const LIVE_STATUSES = new Set(["PROCESSING", "PENDING"]);

function formatDateTime(value: string | null, timezone: string) {
  if (!value) return "—";

  try {
    const formatter = new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "long",
      timeZone: timezone,
    });
    return formatter.format(new Date(value));
  } catch (error) {
    console.error("Failed to format datetime", error);
    return value;
  }
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms < 0) return "—";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [] as string[];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0) parts.push(`${seconds}s`);
  return parts.length > 0 ? parts.join(" ") : "0s";
}

function statusBadgeVariant(status: ExecutionDetail["status"]): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "SUCCESS":
      return "secondary";
    case "ERROR":
      return "destructive";
    case "PROCESSING":
    case "PENDING":
      return "outline";
    default:
      return "default";
  }
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    console.error("Failed to stringify JSON", error);
    return String(value);
  }
}

type TimelineState = {
  items: ExecutionEventItem[];
  page: number;
  perPage: number;
  total: number;
  nextPage: number | null;
};

export function AdminExecutionDetail({ execution, events, timezone }: Props) {
  const [timeline, setTimeline] = useState<TimelineState>({
    items: events.data,
    page: events.page,
    perPage: events.perPage,
    total: events.total,
    nextPage: events.nextPage,
  });
  const [isFetchingMore, startTransition] = useTransition();

  // Use the execution stream hook for live updates
  const isLive = LIVE_STATUSES.has(execution.status);
  const { connected, events: streamEvents } = useExecutionStream(isLive ? execution.id : undefined);

  const fetchEvents = useCallback(
    async (page: number) => {
      const response = await fetch(`/api/executions/${execution.id}/events?page=${page}&per_page=${timeline.perPage}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch execution events");
      }
      const payload = (await response.json()) as ExecutionEventsResult;
      return payload;
    },
    [execution.id, timeline.perPage],
  );

  const loadMore = () => {
    if (!timeline.nextPage) return;

    startTransition(async () => {
      try {
        const payload = await fetchEvents(timeline.nextPage!);
        setTimeline((prev) => ({
          items: [...prev.items, ...payload.data],
          page: payload.page,
          perPage: payload.perPage,
          total: payload.total,
          nextPage: payload.nextPage,
        }));
      } catch (error) {
        console.error(error);
      }
    });
  };

  // Merge stream events into timeline - compute derived state instead of setState in effect
  const allTimelineItems = useMemo(() => {
    if (streamEvents.length === 0) return timeline.items;

    const newItems = streamEvents.filter(
      (streamEvent) => !timeline.items.some((item) => item.id === streamEvent.id)
    );

    if (newItems.length === 0) return timeline.items;

    return [...timeline.items, ...newItems.map((e) => ({
      id: e.id,
      timestamp: e.timestamp,
      stage: e.stage,
      message: e.message,
      raw: e.raw,
    } as ExecutionEventItem))];
  }, [timeline.items, streamEvents]);

  const copyJson = async (value: unknown) => {
    if (!navigator?.clipboard) return;
    try {
      await navigator.clipboard.writeText(prettyJson(value));
    } catch (error) {
      console.error("Failed to copy payload", error);
    }
  };

  const sortedTimeline = useMemo(
    () =>
      [...allTimelineItems].sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      ),
    [allTimelineItems],
  );

  return (
    <div className="container mx-auto max-w-7xl space-y-6 px-4 md:px-6">
      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-3">
                <Badge variant={statusBadgeVariant(execution.status)} className="gap-1 text-base">
                  {execution.status === "ERROR" && <IconAlertTriangle className="size-4" />}
                  {execution.status === "PROCESSING" && <IconLoader className="size-4 animate-spin" />}
                  {execution.status === "PENDING" && <IconPlayerPlay className="size-4" />}
                  {execution.status}
                </Badge>
                {execution.n8nRunId && (
                  <span className="font-mono text-xs text-muted-foreground">
                    n8n run: {execution.n8nRunId}
                  </span>
                )}
              </div>
              <CardTitle className="text-2xl font-semibold">Execution {execution.id}</CardTitle>
              <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
                <div>
                  <span className="font-semibold text-foreground">Workflow:</span> {execution.workflowName}
                </div>
                <div>
                  <span className="font-semibold text-foreground">Client:</span> {execution.clientName}
                </div>
                <div>
                  <span className="font-semibold text-foreground">Started:</span> {formatDateTime(execution.startedAt, timezone)}
                </div>
                <div>
                  <span className="font-semibold text-foreground">Finished:</span> {formatDateTime(execution.finishedAt, timezone)}
                </div>
                <div>
                  <span className="font-semibold text-foreground">Duration:</span> {formatDuration(execution.durationMs)}
                </div>
                <div>
                  <span className="font-semibold text-foreground">Source:</span> {execution.source ?? "—"}
                </div>
              </div>
            </div>

            <div className="flex flex-col items-start gap-3 lg:items-end">
              {execution.resultFileUrl && (
                <Button asChild variant="secondary" size="sm">
                  <a href={execution.resultFileUrl} target="_blank" rel="noreferrer">
                    <IconFileExport className="mr-2 size-4" />
                    Download result
                  </a>
                </Button>
              )}
              {execution.errorMessage && (
                <Card className="border-destructive/40 bg-destructive/10">
                  <CardHeader className="py-2 pb-0">
                    <CardTitle className="flex items-center gap-2 text-sm font-medium text-destructive">
                      <IconAlertTriangle className="size-4" /> Error message
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="py-2 text-destructive">
                    <pre className="whitespace-pre-wrap break-all text-xs leading-relaxed">
                      {execution.errorMessage}
                    </pre>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      <Tabs defaultValue="timeline" className="space-y-4">
        <TabsList>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="input">Input payload</TabsTrigger>
          <TabsTrigger value="output">Output payload</TabsTrigger>
          <TabsTrigger value="metadata">Metadata</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Event timeline
                {isLive && (
                  <Badge variant="outline" className="gap-1 text-xs">
                    <IconRefresh className="size-3 animate-spin" /> {connected ? "Live" : "Connecting..."}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {sortedTimeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">No events recorded yet.</p>
              ) : (
                <ol className="space-y-3">
                  {sortedTimeline.map((event) => (
                    <li key={event.id} className="rounded-lg border bg-muted/40 p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-foreground">{event.stage}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {formatDateTime(event.timestamp, timezone)}
                        </span>
                      </div>
                      {event.message && (
                        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                          {event.message}
                        </p>
                      )}
                      {event.raw ? (
                        <pre className="mt-2 max-h-48 w-full max-w-full overflow-auto rounded bg-background p-2 text-xs text-muted-foreground whitespace-pre-wrap break-all">
                          {prettyJson(event.raw)}
                        </pre>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}

              {timeline.nextPage && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={isFetchingMore}
                  onClick={loadMore}
                >
                  {isFetchingMore ? (
                    <>
                      <IconLoader className="mr-2 size-4 animate-spin" /> Loading…
                    </>
                  ) : (
                    <>
                      <IconArrowDown className="mr-2 size-4" /> Load more events
                    </>
                  )}
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="input">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Input payload</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => copyJson(execution.inputPayload)}>
                <IconCopy className="mr-2 size-4" /> Copy JSON
              </Button>
            </CardHeader>
            <CardContent>
              <pre className="max-h-[480px] w-full max-w-full overflow-auto rounded-lg bg-muted/30 p-4 text-xs whitespace-pre-wrap break-all">
                {prettyJson(execution.inputPayload)}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="output">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Output payload</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => copyJson(execution.outputPayload)}>
                <IconCopy className="mr-2 size-4" /> Copy JSON
              </Button>
            </CardHeader>
            <CardContent>
              <pre className="max-h-[480px] w-full max-w-full overflow-auto rounded-lg bg-muted/30 p-4 text-xs whitespace-pre-wrap break-all">
                {execution.outputPayload ? prettyJson(execution.outputPayload) : "{}"}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="metadata">
          <Card>
            <CardHeader>
              <CardTitle>Execution metadata</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 text-sm md:grid-cols-2">
                <div>
                  <dt className="font-medium text-foreground">Execution ID</dt>
                  <dd className="font-mono text-xs text-muted-foreground">{execution.id}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">Workflow</dt>
                  <dd>{execution.workflowName}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">Client</dt>
                  <dd>{execution.clientName}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">Source</dt>
                  <dd>{execution.source ?? "—"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">n8n run ID</dt>
                  <dd>{execution.n8nRunId ?? "—"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">Result file</dt>
                  <dd>
                    {execution.resultFileUrl ? (
                      <a
                        className="text-primary underline"
                        href={execution.resultFileUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {execution.resultFileUrl}
                      </a>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <div className="md:col-span-2">
                  <dt className="font-medium text-foreground">Error message</dt>
                  <dd className="whitespace-pre-wrap break-all text-sm text-destructive">
                    {execution.errorMessage ?? "—"}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
