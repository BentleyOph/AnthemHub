"use client";

import { useMemo } from "react";
import { IconRefresh } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ClientExecutionEvent } from "@/lib/client/execution-detail";
import { useExecutionStream } from "@/hooks/use-execution-stream";

type Props = {
  executionId: string;
  initialEvents: ClientExecutionEvent[];
  isLive: boolean;
  timezone: string;
};

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

function EmptyTimeline({ isLive, connected }: { isLive: boolean; connected: boolean }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed p-6 text-sm text-muted-foreground">
      {isLive ? (
        <>
          <span>
            {connected
              ? "Connected. Waiting for updates from the workflow..."
              : "Connecting to live updates..."}
          </span>
          <span>Leave this page open to see new events in real-time.</span>
        </>
      ) : (
        <span>No events were recorded for this execution.</span>
      )}
    </div>
  );
}

export function ClientExecutionTimeline({ executionId, initialEvents, isLive, timezone }: Props) {
  const { connected, events: streamEvents } = useExecutionStream(isLive ? executionId : undefined);

  // Merge initial events with streamed events
  const allEvents = useMemo(() => {
    if (streamEvents.length === 0) return initialEvents;

    const newEvents = streamEvents.filter(
      (streamEvent) => !initialEvents.some((item) => item.id === streamEvent.id)
    );

    if (newEvents.length === 0) return initialEvents;

    return [...initialEvents, ...newEvents];
  }, [initialEvents, streamEvents]);

  // Sort by timestamp
  const sortedEvents = useMemo(() => {
    return [...allEvents].sort((a, b) => {
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    });
  }, [allEvents]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle>Live progress</CardTitle>
          <CardDescription>
            {isLive
              ? "Events from the workflow while it runs."
              : "Events "}
          </CardDescription>
        </div>
        {isLive && (
          <Badge variant="outline" className="gap-1.5">
            <IconRefresh className="size-3 animate-spin" />
            {connected ? "Live" : "Connecting..."}
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        {sortedEvents.length > 0 ? (
          <ol className="space-y-4">
            {sortedEvents.map((event) => (
              <li key={event.id} className="space-y-1 rounded-md border p-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{formatDateTime(event.timestamp, timezone)}</span>
                  <span className="font-mono uppercase">{event.stage}</span>
                </div>
                {event.message ? (
                  <p className="text-sm text-foreground">{event.message}</p>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <EmptyTimeline isLive={isLive} connected={connected} />
        )}
      </CardContent>
    </Card>
  );
}
