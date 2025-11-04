"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconClock,
  IconEye,
  IconFileDownload,
} from "@tabler/icons-react";

import type {
  ClientExecutionListItem,
  ClientExecutionStatus,
} from "@/lib/client/executions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STATUS_META: Record<
  ClientExecutionStatus,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    icon: ReactNode;
  }
> = {
  SUCCESS: {
    label: "Complete",
    variant: "secondary",
    icon: <IconCircleCheck className="size-3" />, 
  },
  ERROR: {
    label: "Failed",
    variant: "destructive",
    icon: <IconAlertTriangle className="size-3" />, 
  },
  PROCESSING: {
    label: "Processing",
    variant: "outline",
    icon: <IconClock className="size-3" />, 
  },
  PENDING: {
    label: "Processing",
    variant: "outline",
    icon: <IconClock className="size-3" />, 
  },
};

function formatDateTime(value: string, timezone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat(undefined, {
      timeZone: timezone,
      dateStyle: "medium",
      timeStyle: "short",
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
  if (totalSeconds < 1) return "<1s";

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 && hours === 0) parts.push(`${seconds}s`);

  return parts.join(" ") || "0s";
}

interface ClientExecutionsTableProps {
  items: ClientExecutionListItem[];
  timezone: string;
}

export function ClientExecutionsTable({ items, timezone }: ClientExecutionsTableProps) {
  const router = useRouter();

  const gotoDetails = (executionId: string) => {
    router.push(`/executions/${executionId}`);
  };

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[200px]">Date</TableHead>
            <TableHead>Workflow</TableHead>
            <TableHead className="w-[140px]">Status</TableHead>
            <TableHead className="w-[120px] text-right">Duration</TableHead>
            <TableHead className="w-[160px] text-right">Result</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const meta = STATUS_META[item.status];

            return (
              <TableRow
                key={item.id}
                role="button"
                tabIndex={0}
                className="cursor-pointer transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => gotoDetails(item.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    gotoDetails(item.id);
                  }
                }}
              >
                <TableCell className="align-middle font-medium">
                  {formatDateTime(item.startedAt, timezone)}
                </TableCell>
                <TableCell className="align-middle">
                  <div className="flex flex-col gap-1">
                    <span className="font-medium leading-tight">{item.workflowName}</span>
                    <span className="text-xs text-muted-foreground">
                      ID: <code className="font-mono text-[10px]">{item.id}</code>
                    </span>
                  </div>
                </TableCell>
                <TableCell className="align-middle">
                  <Badge variant={meta?.variant ?? "outline"} className="inline-flex items-center gap-1">
                    {meta?.icon}
                    {meta?.label ?? item.status}
                  </Badge>
                </TableCell>
                <TableCell className="align-middle text-right font-mono text-xs text-muted-foreground">
                  {formatDuration(item.durationMs)}
                </TableCell>
                <TableCell className="align-middle text-right">
                  {item.resultFileUrl ? (
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <a href={item.resultFileUrl} target="_blank" rel="noreferrer">
                        <IconFileDownload className="mr-1 size-4" />
                        Download
                      </a>
                    </Button>
                  ) : (
                    <Button
                      asChild
                      size="sm"
                      variant="ghost"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Link href={`/executions/${item.id}`}>
                        <IconEye className="mr-1 size-4" />
                        View Details
                      </Link>
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                No executions found.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
