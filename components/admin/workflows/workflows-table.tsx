"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { IconCirclePlus, IconSearch } from "@tabler/icons-react";

import type { WorkflowListResult } from "@/lib/admin/workflows/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Props = {
  result: WorkflowListResult;
  timeZone: string;
};

const STATUS_OPTIONS: Array<{ label: string; value: WorkflowListResult["status"] }> = [
  { label: "All", value: "ALL" },
  { label: "Published", value: "PUBLISHED" },
  { label: "Draft", value: "DRAFT" },
];

const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const integerFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const percentFormatter = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

function getDateFormatter(timeZone: string) {
  if (!dateFormatters.has(timeZone)) {
    dateFormatters.set(
      timeZone,
      new Intl.DateTimeFormat(undefined, {
        timeZone,
        dateStyle: "medium",
        timeStyle: "short",
      }),
    );
  }
  return dateFormatters.get(timeZone)!;
}

function formatDate(value: string, timeZone: string) {
  try {
    return getDateFormatter(timeZone).format(new Date(value));
  } catch {
    return value;
  }
}

function formatInteger(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return integerFormatter.format(value);
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${percentFormatter.format(value)}%`;
}

function formatRuntime(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined) return "—";
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds - minutes * 60);
  if (remaining <= 0) {
    return `${minutes}m`;
  }
  return `${minutes}m ${remaining}s`;
}

function stringifySearch(params: URLSearchParams) {
  const entries = Array.from(params.entries());
  if (entries.length === 0) return "";
  return `?${entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&")}`;
}

export function AdminWorkflowsTable({ result, timeZone }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(result.search ?? "");
  const [status, setStatus] = useState<WorkflowListResult["status"]>(result.status);

  const totalPages = useMemo(() => {
    if (result.perPage === 0) return 1;
    return Math.max(1, Math.ceil(result.total / result.perPage));
  }, [result.perPage, result.total]);

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (search.trim()) {
      params.set("q", search.trim());
    } else {
      params.delete("q");
    }
    params.delete("page");
    startTransition(() => {
      router.push(`${pathname}${stringifySearch(params)}`);
    });
  };

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("page", String(page));
    if (search.trim()) {
      params.set("q", search.trim());
    } else {
      params.delete("q");
    }
    if (status) {
      params.set("status", status);
    }
    startTransition(() => {
      router.push(`${pathname}${stringifySearch(params)}`);
    });
  };

  const handleStatusChange = (value: WorkflowListResult["status"]) => {
    setStatus(value);
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.delete("page");
    if (search.trim()) {
      params.set("q", search.trim());
    } else {
      params.delete("q");
    }
    if (value === "ALL") {
      params.delete("status");
    } else {
      params.set("status", value);
    }
    startTransition(() => {
      router.push(`${pathname}${stringifySearch(params)}`);
    });
  };

  const currentPage = result.page;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Workflows</h1>
          <p className="text-sm text-muted-foreground">
            Manage automation metadata, publication status, and input schemas.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/workflows/new">
            <IconCirclePlus className="mr-2 size-4" />
            New workflow
          </Link>
        </Button>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <form onSubmit={handleSearchSubmit} className="flex w-full max-w-md items-center gap-2">
          <div className="relative flex-1">
            <IconSearch className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search workflows…"
              className="pl-8"
              name="q"
            />
          </div>
          <Button type="submit" variant="outline" disabled={isPending}>
            Search
          </Button>
        </form>
        <Select value={status} onValueChange={(value) => handleStatusChange(value as Props["result"]["status"])}>
          <SelectTrigger className="w-[160px] justify-between">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[240px]">Workflow</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Visibility</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Total runs (30d)</TableHead>
              <TableHead className="text-right">Success rate (30d)</TableHead>
              <TableHead className="text-right">Avg runtime</TableHead>
              <TableHead className="text-right">Active schedules</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">
                  {search || status !== "ALL"
                    ? "No workflows match the current filters."
                    : "No workflows created yet. Start by creating your first workflow."}
                </TableCell>
              </TableRow>
            ) : (
              result.data.map((workflow) => (
                <TableRow key={workflow.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center overflow-hidden rounded-md border bg-muted/40">
                        {workflow.iconUrl ? (
                          <Image
                            src={workflow.iconUrl}
                            alt={`${workflow.name} icon`}
                            width={40}
                            height={40}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">No icon</span>
                        )}
                      </div>
                      <div>
                        <div className="font-medium">{workflow.name}</div>
                        <div className="text-xs text-muted-foreground line-clamp-2">
                          {workflow.description}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={workflow.isPublished ? "default" : "secondary"}>
                      {workflow.isPublished ? "Published" : "Draft"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={workflow.visibility === "PRIVATE" ? "secondary" : "outline"}>
                      {workflow.visibility === "PRIVATE" ? "🔒 Private" : "📢 Catalog"}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(workflow.updatedAt, timeZone)}</TableCell>
                  <TableCell>{formatDate(workflow.createdAt, timeZone)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatInteger(workflow.totalRuns30d)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPercent(workflow.successRate30d)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatRuntime(workflow.avgRuntimeSeconds)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatInteger(workflow.activeSchedules)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="link" size="sm" asChild>
                      <Link href={`/admin/workflows/${workflow.id}`}>View</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {currentPage} of {totalPages} • {result.total} total
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1 || isPending}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages || isPending}
            >
              Next
            </Button>
          </div>
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">
          Showing {result.data.length} of {result.total} workflows
        </div>
      )}
    </div>
  );
}
