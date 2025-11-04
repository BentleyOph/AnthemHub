"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  IconAlertTriangle,
  IconArrowDown,
  IconArrowUp,
  IconCircleCheck,
  IconFileExport,
  IconPlayerPlay,
  IconRefresh,
  IconSearch,
  IconSelector,
} from "@tabler/icons-react";

import type { ExecutionListResult, ExecutionSort, ExecutionStatus } from "@/lib/admin/executions/data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type FilterOptions = {
  workflows: Array<{ id: string; name: string }>;
  clients: Array<{ id: string; name: string }>;
  statuses: ExecutionStatus[];
};

type AppliedFilters = ExecutionListResult["appliedFilters"];

type FiltersState = {
  workflows: string[];
  statuses: ExecutionStatus[];
  clients: string[];
  from: string;
  to: string;
  search: string;
};

type Props = {
  result: ExecutionListResult;
  options: FilterOptions;
  timezone: string;
};

const PER_PAGE_OPTIONS = ["20", "50", "100"] as const;

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
  const parts = [] as string[];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 && hours === 0) parts.push(`${seconds}s`);
  return parts.join(" ") || "0s";
}

function isoToDateInput(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 10);
}

function dateInputToIso(value: string, endOfDay = false): string | null {
  if (!value) return null;
  const isoCandidate = endOfDay ? `${value}T23:59:59.999` : `${value}T00:00:00.000`;
  const date = new Date(isoCandidate);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function truncateId(id: string, length = 10): string {
  if (id.length <= length) return id;
  return `${id.slice(0, length)}…`;
}

function statusBadgeVariant(status: ExecutionStatus): "default" | "secondary" | "destructive" | "outline" {
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

function makeInitialFilters(applied: AppliedFilters): FiltersState {
  return {
    workflows: [...applied.workflowIds],
    statuses: [...applied.status],
    clients: [...applied.clientIds],
    from: isoToDateInput(applied.from),
    to: isoToDateInput(applied.to),
    search: applied.q ?? "",
  };
}

export function AdminExecutionsList({ result, options, timezone }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const [filters, setFilters] = useState<FiltersState>(() => makeInitialFilters(result.appliedFilters));
  const [perPage, setPerPage] = useState(String(result.perPage));
  const [sort, setSort] = useState<ExecutionSort>(result.sort);

  const totalPages = useMemo(() => {
    if (result.perPage === 0) return 1;
    return Math.max(1, Math.ceil(result.total / result.perPage));
  }, [result.perPage, result.total]);

  const submit = (next: {
    page?: number;
    perPage?: string;
    sort?: ExecutionSort;
    filters?: Partial<FiltersState>;
    resetPage?: boolean;
    search?: string;
  } = {}) => {
    const targetFilters = {
      ...filters,
      ...(next.filters ?? {}),
    } satisfies FiltersState;

    if (next.filters) {
      setFilters(targetFilters);
    }

    const targetPerPage = next.perPage ?? perPage;
    if (next.perPage) {
      setPerPage(next.perPage);
    }

    const targetSort = next.sort ?? sort;
    if (next.sort) {
      setSort(next.sort);
    }

    const page = next.page ?? (next.resetPage ? 1 : result.page);

    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("per_page", targetPerPage);
    params.set("sort", targetSort);

    targetFilters.workflows.forEach((workflowId) => {
      if (workflowId) params.append("workflow_id", workflowId);
    });

    targetFilters.statuses.forEach((status) => {
      if (status) params.append("status", status);
    });

    targetFilters.clients.forEach((clientId) => {
      if (clientId) params.append("client_id", clientId);
    });

    const fromIso = dateInputToIso(targetFilters.from, false);
    const toIso = dateInputToIso(targetFilters.to, true);

    if (fromIso) params.set("from", fromIso);
    if (toIso) params.set("to", toIso);

    const trimmedSearch = targetFilters.search.trim();
    if (trimmedSearch.length > 0) {
      params.set("q", trimmedSearch);
    }

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const resetFilters = () => {
    setFilters({
      workflows: [],
      statuses: [],
      clients: [],
      from: "",
      to: "",
      search: "",
    });
    setPerPage("20");
    setSort("started_at.desc");
    startTransition(() => {
      router.push(pathname);
    });
  };

  const toggleValue = <T extends string>(list: T[], value: T, enabled: boolean): T[] => {
    if (enabled) {
      return list.includes(value) ? list : [...list, value];
    }
    return list.filter((item) => item !== value);
  };

  const onStatusToggle = (status: ExecutionStatus, checked: boolean) => {
    const nextStatuses = toggleValue<ExecutionStatus>(filters.statuses, status, checked);
    setFilters((prev) => ({ ...prev, statuses: nextStatuses }));
  };

  const onWorkflowToggle = (id: string, checked: boolean) => {
    const nextWorkflows = toggleValue<string>(filters.workflows, id, checked);
    setFilters((prev) => ({ ...prev, workflows: nextWorkflows }));
  };

  const onClientToggle = (id: string, checked: boolean) => {
    const nextClients = toggleValue<string>(filters.clients, id, checked);
    setFilters((prev) => ({ ...prev, clients: nextClients }));
  };

  const changeSort = (column: "started_at" | "duration") => {
    const [currentColumn, direction] = sort.split(".") as [
      "started_at" | "duration",
      "asc" | "desc",
    ];

    let nextSort: ExecutionSort;
    if (currentColumn === column) {
      nextSort = `${column}.${direction === "asc" ? "desc" : "asc"}` as ExecutionSort;
    } else {
      nextSort = `${column}.desc` as ExecutionSort;
    }

    submit({ sort: nextSort, resetPage: true });
  };

  const gotoPage = (page: number) => {
    submit({ page });
  };

  const currentSort = useMemo(() => sort.split(".") as ["started_at" | "duration", "asc" | "desc"], [sort]);

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold">Executions</h1>
        <p className="text-sm text-muted-foreground">
          Investigate execution runs across all clients with filters and diagnostics.
        </p>
      </section>

      <div className="rounded-lg border bg-card p-4">
        <form
          className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            submit({ resetPage: true });
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="execution-search">Search</Label>
            <div className="relative">
              <IconSearch className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="execution-search"
                value={filters.search}
                onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
                className="pl-8 md:w-64"
                placeholder="Execution ID or n8n run ID"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Workflow</Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="w-48 justify-between">
                  <span>
                    {filters.workflows.length > 0
                      ? `${filters.workflows.length} selected`
                      : "All workflows"}
                  </span>
                  <IconSelector className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-72">
                <DropdownMenuItem disabled className="font-semibold">
                  Select workflows
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <div className="max-h-64 overflow-y-auto">
                  {options.workflows.map((workflow) => (
                    <DropdownMenuCheckboxItem
                      key={workflow.id}
                      className="capitalize"
                      checked={filters.workflows.includes(workflow.id)}
                      onCheckedChange={(checked) => onWorkflowToggle(workflow.id, Boolean(checked))}
                    >
                      {workflow.name}
                    </DropdownMenuCheckboxItem>
                  ))}
                  {options.workflows.length === 0 && (
                    <DropdownMenuItem disabled>No workflows available</DropdownMenuItem>
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Status</Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="w-48 justify-between">
                  <span>
                    {filters.statuses.length > 0
                      ? `${filters.statuses.length} selected`
                      : "All statuses"}
                  </span>
                  <IconSelector className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56">
                <DropdownMenuItem disabled className="font-semibold">
                  Select statuses
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {options.statuses.map((status) => (
                  <DropdownMenuCheckboxItem
                    key={status}
                    checked={filters.statuses.includes(status)}
                    onCheckedChange={(checked) => onStatusToggle(status, Boolean(checked))}
                  >
                    {status}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Client</Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="w-48 justify-between">
                  <span>
                    {filters.clients.length > 0
                      ? `${filters.clients.length} selected`
                      : "All clients"}
                  </span>
                  <IconSelector className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-72">
                <DropdownMenuItem disabled className="font-semibold">
                  Select clients
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <div className="max-h-64 overflow-y-auto">
                  {options.clients.map((client) => (
                    <DropdownMenuCheckboxItem
                      key={client.id}
                      checked={filters.clients.includes(client.id)}
                      onCheckedChange={(checked) => onClientToggle(client.id, Boolean(checked))}
                    >
                      {client.name}
                    </DropdownMenuCheckboxItem>
                  ))}
                  {options.clients.length === 0 && (
                    <DropdownMenuItem disabled>No clients available</DropdownMenuItem>
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex flex-col gap-2">
            <Label>From</Label>
            <Input
              type="date"
              value={filters.from}
              onChange={(event) => setFilters((prev) => ({ ...prev, from: event.target.value }))}
              max={filters.to || undefined}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>To</Label>
            <Input
              type="date"
              value={filters.to}
              onChange={(event) => setFilters((prev) => ({ ...prev, to: event.target.value }))}
              min={filters.from || undefined}
            />
          </div>

          <div className="flex gap-2">
            <Button
              type="submit"
              variant="default"
              size="sm"
              disabled={isPending}
            >
              <IconRefresh className="mr-2 size-4" />
              Apply
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              disabled={isPending}
            >
              Clear
            </Button>
          </div>
        </form>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
          <div className="text-sm text-muted-foreground">
            Showing {(result.page - 1) * result.perPage + 1}–
            {(result.page - 1) * result.perPage + result.data.length} of {result.total} executions
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs uppercase text-muted-foreground">Per page</Label>
            <Select
              value={perPage}
              onValueChange={(value) => submit({ perPage: value, resetPage: true })}
            >
              <SelectTrigger className="h-8 w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PER_PAGE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">Execution</TableHead>
                <TableHead className="w-[120px]">Status</TableHead>
                <TableHead>Workflow</TableHead>
                <TableHead>Client</TableHead>
                <TableHead className="w-[180px]">
                  <Button
                    type="button"
                    variant="ghost"
                    className="-ml-3 h-8 px-2 text-sm"
                    onClick={() => changeSort("started_at")}
                  >
                    Started
                    {currentSort[0] === "started_at" && (
                      currentSort[1] === "asc" ? (
                        <IconArrowUp className="ml-1 size-4" />
                      ) : (
                        <IconArrowDown className="ml-1 size-4" />
                      )
                    )}
                  </Button>
                </TableHead>
                <TableHead className="w-[140px]">
                  <Button
                    type="button"
                    variant="ghost"
                    className="-ml-3 h-8 px-2 text-sm"
                    onClick={() => changeSort("duration")}
                  >
                    Duration
                    {currentSort[0] === "duration" && (
                      currentSort[1] === "asc" ? (
                        <IconArrowUp className="ml-1 size-4" />
                      ) : (
                        <IconArrowDown className="ml-1 size-4" />
                      )
                    )}
                  </Button>
                </TableHead>
                <TableHead className="w-[120px]">Source</TableHead>
                <TableHead className="w-[120px]">Result</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-12 text-center text-sm text-muted-foreground">
                    No executions match the current filters.
                  </TableCell>
                </TableRow>
              )}
              {result.data.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer transition-colors hover:bg-muted/50"
                  onClick={() => router.push(`/admin/executions/${row.id}`)}
                >
                  <TableCell className="font-mono text-xs">{truncateId(row.id)}</TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(row.status)} className="gap-1">
                      {row.status === "SUCCESS" && <IconCircleCheck className="size-3" />}
                      {row.status === "ERROR" && <IconAlertTriangle className="size-3" />}
                      {row.status === "PROCESSING" && <IconPlayerPlay className="size-3" />}
                      {row.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{row.workflowName}</TableCell>
                  <TableCell>{row.clientName}</TableCell>
                  <TableCell>{formatDateTime(row.startedAt, timezone)}</TableCell>
                  <TableCell>{formatDuration(row.durationMs)}</TableCell>
                  <TableCell>{row.source ?? "—"}</TableCell>
                  <TableCell>
                    {row.resultFileUrl ? (
                      <Button
                        asChild
                        size="sm"
                        variant="link"
                        className="px-0"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <a href={row.resultFileUrl} target="_blank" rel="noreferrer">
                          <IconFileExport className="mr-1 size-4" />
                          Download
                        </a>
                      </Button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.errorMessage ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="line-clamp-1 text-sm text-destructive" onClick={(event) => event.stopPropagation()}>
                              {row.errorMessage}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs whitespace-pre-wrap">
                            {row.errorMessage}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between gap-2 border-t px-4 py-3">
          <div className="text-xs text-muted-foreground">
            Page {result.page} of {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending || result.page <= 1}
              onClick={() => gotoPage(result.page - 1)}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending || result.page >= totalPages}
              onClick={() => gotoPage(result.page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
