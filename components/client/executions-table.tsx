"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import {
  getPrimaryResultFileUrl,
  normalizeResultFileUrls,
} from "@/lib/result-files";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SingleDatePicker } from "@/components/ui/date-picker";
import { formatDateOnlyParam, parseDateOnlyString } from "@/lib/dates";

const STATUS_META: Record<
  ClientExecutionStatus,
  {
    label: string;
    variant: BadgeVariant;
    icon: ReactNode;
  }
> = {
  SUCCESS: {
    label: "Complete",
    variant: "success",
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

interface WorkflowFilterOption {
  id: string;
  name: string;
}

interface ClientExecutionsTableProps {
  items: ClientExecutionListItem[];
  timezone: string;
  workflowFilterOptions?: WorkflowFilterOption[];
  showWorkflowFilter?: boolean;
}

export function ClientExecutionsTable({
  items,
  timezone,
  workflowFilterOptions = [],
  showWorkflowFilter = true,
}: ClientExecutionsTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const viewParam = searchParams?.get("view");
  const viewMode: "all" | "mine" = viewParam === "mine" ? "mine" : "all";
  const [statusFilter, setStatusFilter] = useState(() => searchParams?.get("status") ?? "all");
  const [startedByFilter, setStartedByFilter] = useState(() => searchParams?.get("started_by") ?? "");
  const [dateFrom, setDateFrom] = useState<Date | null>(() =>
    parseDateOnlyString(searchParams?.get("started_from") ?? undefined)
  );
  const [dateTo, setDateTo] = useState<Date | null>(() =>
    parseDateOnlyString(searchParams?.get("started_to") ?? undefined)
  );
  const [workflowFilter, setWorkflowFilter] = useState(() => searchParams?.get("workflow") ?? "all");

  const gotoDetails = (executionId: string) => {
    router.push(`/executions/${executionId}`);
  };

  const setViewMode = (mode: "all" | "mine") => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (mode === "mine") {
      params.set("view", "mine");
    } else {
      params.delete("view");
    }
    params.delete("page");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  const handleFilterSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    const trimmedStartedBy = startedByFilter.trim();

    if (statusFilter && statusFilter !== "all") {
      params.set("status", statusFilter);
    } else {
      params.delete("status");
    }

    if (trimmedStartedBy.length > 0) {
      params.set("started_by", trimmedStartedBy);
    } else {
      params.delete("started_by");
    }

    const formattedFrom = formatDateOnlyParam(dateFrom);
    const formattedTo = formatDateOnlyParam(dateTo);

    if (formattedFrom) {
      params.set("started_from", formattedFrom);
    } else {
      params.delete("started_from");
    }

    if (formattedTo) {
      params.set("started_to", formattedTo);
    } else {
      params.delete("started_to");
    }

    if (showWorkflowFilter) {
      if (workflowFilter && workflowFilter !== "all") {
        params.set("workflow", workflowFilter);
      } else {
        params.delete("workflow");
      }
    } else {
      params.delete("workflow");
    }

    params.delete("page");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  const handleResetFilters = () => {
    setStatusFilter("all");
    setStartedByFilter("");
    setDateFrom(null);
    setDateTo(null);
    setWorkflowFilter("all");

    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.delete("status");
    params.delete("started_by");
    params.delete("started_from");
    params.delete("started_to");
    params.delete("workflow");
    params.delete("page");

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={viewMode === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("all")}
          >
            All activity
          </Button>
          <Button
            type="button"
            variant={viewMode === "mine" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("mine")}
          >
            My runs
          </Button>
        </div>
      </div>
      <form onSubmit={handleFilterSubmit} className="space-y-3 rounded-lg border bg-muted/10 p-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="status-filter">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger id="status-filter" className="w-full justify-between">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="SUCCESS">Complete</SelectItem>
                <SelectItem value="PROCESSING">Processing</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="ERROR">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="started-by-filter">Started by</Label>
            <Input
              id="started-by-filter"
              type="text"
              placeholder="Name or email"
              value={startedByFilter}
              onChange={(event) => setStartedByFilter(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="date-range-from">From</Label>
            <SingleDatePicker
              id="date-range-from"
              value={dateFrom}
              onChange={setDateFrom}
              className="w-full"
              maxDate={dateTo ?? undefined}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="date-range-to">To</Label>
            <SingleDatePicker
              id="date-range-to"
              value={dateTo}
              onChange={setDateTo}
              className="w-full"
              minDate={dateFrom ?? undefined}
            />
          </div>
          {showWorkflowFilter ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="workflow-filter">Workflow</Label>
              <Select
                value={workflowFilter}
                onValueChange={setWorkflowFilter}
                disabled={workflowFilterOptions.length === 0}
              >
                <SelectTrigger id="workflow-filter" className="w-full justify-between">
                  <SelectValue placeholder="All workflows" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All workflows</SelectItem>
                  {workflowFilterOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={handleResetFilters}>
            Reset
          </Button>
          <Button type="submit" size="sm">
            Apply filters
          </Button>
        </div>
      </form>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">Date</TableHead>
              <TableHead>Workflow</TableHead>
              <TableHead className="w-[140px]">Status</TableHead>
              <TableHead className="w-[120px] text-right">Duration</TableHead>
              <TableHead className="w-[160px] text-right">Result</TableHead>
              <TableHead className="w-[200px]">Started by</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
          {items.map((item) => {
            const meta = STATUS_META[item.status];
            const resultFileUrls = normalizeResultFileUrls(item.resultFileUrl);
            const primaryResultFileUrl = getPrimaryResultFileUrl(resultFileUrls);
            const additionalFileCount = resultFileUrls.length > 1 ? resultFileUrls.length - 1 : 0;

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
                  {primaryResultFileUrl ? (
                    <div className="space-y-1">
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <a href={primaryResultFileUrl} target="_blank" rel="noreferrer">
                          <IconFileDownload className="mr-1 size-4" />
                          Download
                        </a>
                      </Button>
                      {additionalFileCount > 0 && (
                        <div className="text-[11px] text-muted-foreground">
                          +{additionalFileCount} more file{additionalFileCount > 1 ? "s" : ""} in details
                        </div>
                      )}
                    </div>
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
                <TableCell className="align-middle text-sm text-muted-foreground">
                  {item.startedByUserName?.trim()
                    ? item.startedByUserName
                    : item.startedByUserEmail ?? "—"}
                </TableCell>
              </TableRow>
            );
          })}
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                No executions found.
              </TableCell>
            </TableRow>
          ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
