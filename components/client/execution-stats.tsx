"use client";

import { useMemo } from "react";
import { IconDownload } from "@tabler/icons-react";

import { useExecutionStream } from "@/hooks/use-execution-stream";
import { Button } from "@/components/ui/button";
import {
  getPrimaryResultFileUrl,
  normalizeResultFileUrls,
  type ResultFileValue,
} from "@/lib/result-files";

type Props = {
  executionId: string;
  timezone: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  resultFileUrl: ResultFileValue;
  outputPayload: unknown;
  isLive: boolean;
};

export function ExecutionStats({
  executionId,
  timezone,
  startedAt,
  finishedAt: initialFinishedAt,
  durationMs: initialDurationMs,
  resultFileUrl: initialResultFileUrl,
  outputPayload: initialOutput,
  isLive,
}: Props) {
  const { update } = useExecutionStream(isLive ? executionId : undefined);

  const liveFinishedAt = update?.finished_at ?? initialFinishedAt;
  const liveOutput = update?.output_payload ?? initialOutput;

  const resultUrlFromUpdate = update?.result_file_url;
  const resultFileUrls = useMemo(() => {
    if (resultUrlFromUpdate !== undefined) {
      return normalizeResultFileUrls(resultUrlFromUpdate);
    }
    return normalizeResultFileUrls(initialResultFileUrl);
  }, [initialResultFileUrl, resultUrlFromUpdate]);

  const durationMs = useMemo(() => {
    if (liveFinishedAt) {
      const end = new Date(liveFinishedAt).getTime();
      const start = new Date(startedAt).getTime();
      return Math.max(0, end - start);
    }
    return initialDurationMs;
  }, [initialDurationMs, liveFinishedAt, startedAt]);

  const hasOutput = liveOutput !== null && liveOutput !== undefined;
  const primaryResultFileUrl = getPrimaryResultFileUrl(resultFileUrls);
  const additionalFileCount = resultFileUrls.length > 1 ? resultFileUrls.length - 1 : 0;

  return (
    <dl className="grid gap-6 text-sm sm:grid-cols-2 xl:grid-cols-4">
      <div className="space-y-2">
        <dt className="font-semibold text-foreground">Started</dt>
        <dd className="text-muted-foreground">{formatDateTime(startedAt, timezone)}</dd>
      </div>
      <div className="space-y-2">
        <dt className="font-semibold text-foreground">Finished</dt>
        <dd className="text-muted-foreground">{formatDateTime(liveFinishedAt, timezone)}</dd>
      </div>
      <div className="space-y-2">
        <dt className="font-semibold text-foreground">Duration</dt>
        <dd className="text-muted-foreground">{formatDuration(durationMs)}</dd>
      </div>
      <div className="space-y-2">
        <dt className="font-semibold text-foreground">Result</dt>
        <dd>
          {primaryResultFileUrl ? (
            <Button asChild size="sm" variant="outline">
              <a href={primaryResultFileUrl} target="_blank" rel="noreferrer">
                <IconDownload className="mr-2 size-4" />
                Download file
              </a>
            </Button>
          ) : hasOutput ? (
            <span className="text-muted-foreground">Displayed below</span>
          ) : (
            <span className="text-muted-foreground">Not available</span>
          )}
          {additionalFileCount > 0 && (
            <div className="mt-1 text-xs text-muted-foreground">
              {additionalFileCount} more file{additionalFileCount > 1 ? "s" : ""} available below.
            </div>
          )}
        </dd>
      </div>
    </dl>
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
