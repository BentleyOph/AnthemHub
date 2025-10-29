"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  IconCircleCheck,
  IconCircleX,
  IconClock,
} from "@tabler/icons-react";

import type { AccessRequestListResult } from "@/lib/admin/access-requests/data";
import {
  ACCESS_REQUEST_STATUS_FILTERS,
  type AccessRequestStatus,
  type AccessRequestStatusFilter,
} from "@/lib/admin/access-requests/schema";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/spinner";

type PendingAction =
  | {
      id: string;
      type: "approve" | "reject";
    }
  | null;

const STATUS_LABELS: Record<AccessRequestStatusFilter, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  DENIED: "Denied",
  ALL: "All",
};

const STATUS_TAB_VALUES = ACCESS_REQUEST_STATUS_FILTERS;

type AccessRequestsTableProps = {
  initialData: AccessRequestListResult;
  timeZone: string;
};

function formatDisplayName(name: string | null, email: string | null): string {
  if (name) return name;
  if (email) return email;
  return "Unknown requester";
}

function mapStatusToBadgeVariant(status: AccessRequestStatus): "default" | "secondary" | "destructive" {
  switch (status) {
    case "APPROVED":
      return "default";
    case "DENIED":
      return "destructive";
    default:
      return "secondary";
  }
}

function parseResponseError(response: Response): Promise<string> {
  return response
    .json()
    .then((payload) => {
      if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") {
        return payload.error;
      }
      return response.statusText || "Request failed.";
    })
    .catch(() => response.statusText || "Request failed.");
}

export function AccessRequestsTable({ initialData, timeZone }: AccessRequestsTableProps) {
  const router = useRouter();
  const pathname = usePathname() || "/admin/access-requests";
  const searchParams = useSearchParams();

  const [pendingAction, setPendingAction] = React.useState<PendingAction>(null);
  const [isRouting, startTransition] = React.useTransition();

  const formatter = React.useMemo(() => {
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone,
      });
    } catch (error) {
      console.error("Failed to create date formatter", error);
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    }
  }, [timeZone]);

  const formatDateTime = React.useCallback(
    (value: string | null): string => {
      if (!value) return "—";
      try {
        return formatter.format(new Date(value));
      } catch (error) {
        console.error("Failed to format date", error);
        return value;
      }
    },
    [formatter],
  );

  const statusValue = initialData.status;
  const totalPages = Math.max(1, Math.ceil(initialData.total / initialData.perPage));

  const goToPage = React.useCallback(
    (page: number) => {
      const params = new URLSearchParams(searchParams.toString());
      if (page <= 1) {
        params.delete("page");
      } else {
        params.set("page", String(page));
      }
      const next = params.toString();

      startTransition(() => {
        router.push(next ? `${pathname}?${next}` : pathname);
      });
    },
    [pathname, router, searchParams, startTransition],
  );

  const updateStatusFilter = React.useCallback(
    (nextStatus: AccessRequestStatusFilter) => {
      if (nextStatus === statusValue) return;
      const params = new URLSearchParams(searchParams.toString());
      if (nextStatus === "PENDING") {
        params.delete("status");
      } else {
        params.set("status", nextStatus.toLowerCase());
      }
      params.delete("page");
      const next = params.toString();

      startTransition(() => {
        router.push(next ? `${pathname}?${next}` : pathname);
      });
    },
    [pathname, router, searchParams, startTransition, statusValue],
  );

  const handleApprove = React.useCallback(
    async (id: string) => {
      const confirmed = window.confirm("Approve this access request and grant workflow access?");
      if (!confirmed) return;

      setPendingAction({ id, type: "approve" });
      try {
        const response = await fetch(`/api/requests/access/${id}/approve`, {
          method: "POST",
        });

        if (!response.ok) {
          const message = await parseResponseError(response);
          throw new Error(message);
        }

        toast.success("Access request approved.");
        startTransition(() => {
          router.refresh();
        });
      } catch (error) {
        console.error("Failed to approve access request", error);
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to approve access request.",
        );
      } finally {
        setPendingAction(null);
      }
    },
    [router, startTransition],
  );

  const handleReject = React.useCallback(
    async (id: string) => {
      const confirmed = window.confirm("Reject this access request?");
      if (!confirmed) return;

      setPendingAction({ id, type: "reject" });
      try {
        const response = await fetch(`/api/requests/access/${id}/reject`, {
          method: "POST",
        });

        if (!response.ok) {
          const message = await parseResponseError(response);
          throw new Error(message);
        }

        toast.success("Access request rejected.");
        startTransition(() => {
          router.refresh();
        });
      } catch (error) {
        console.error("Failed to reject access request", error);
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to reject access request.",
        );
      } finally {
        setPendingAction(null);
      }
    },
    [router, startTransition],
  );

  const isLoading = isRouting || pendingAction !== null;

  return (
    <div className="space-y-4">
      <Tabs
        value={statusValue}
        onValueChange={(value) => updateStatusFilter(value as AccessRequestStatusFilter)}
      >
        <TabsList className="flex w-full justify-start gap-2 overflow-x-auto">
          {STATUS_TAB_VALUES.map((status) => (
            <TabsTrigger
              key={status}
              value={status}
              className="px-3 py-1 text-sm font-medium"
            >
              {STATUS_LABELS[status]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div
        className={cn(
          "rounded-lg border bg-card text-card-foreground shadow-sm",
          isRouting && "opacity-60 transition-opacity",
        )}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Requester</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Workflow</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && initialData.data.length === 0 ? (
              Array.from({ length: 3 }).map((_, index) => (
                <TableRow key={`skeleton-${index}`}>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-40" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-48" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell className="text-right">
                    <Skeleton className="ml-auto h-8 w-32" />
                  </TableCell>
                </TableRow>
              ))
            ) : initialData.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="flex flex-col items-center justify-center space-y-2 py-10 text-center text-sm text-muted-foreground">
                    <IconClock className="size-6" />
                    <p>No {STATUS_LABELS[statusValue].toLowerCase()} access requests right now.</p>
                    <p className="max-w-md text-xs">
                      When clients request workflow access, they will appear here for review.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              initialData.data.map((item) => {
                const rowBusy = pendingAction?.id === item.id;
                const disableActions = rowBusy || isRouting;
                const requesterLabel = formatDisplayName(item.requesterName, item.requesterEmail);
                const statusLabel = STATUS_LABELS[item.status];

                return (
                  <TableRow key={item.id} className={cn(rowBusy && "opacity-70")}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{formatDateTime(item.createdAt)}</span>
                        {item.note ? (
                          <span className="text-xs text-muted-foreground">
                            Note: {item.note}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{requesterLabel}</span>
                        {item.requesterEmail && item.requesterName ? (
                          <span className="text-xs text-muted-foreground">{item.requesterEmail}</span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{item.clientName}</span>
                        <span className="text-xs text-muted-foreground">{item.clientId}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{item.workflowName}</span>
                        <span className="text-xs text-muted-foreground">{item.workflowId}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={mapStatusToBadgeVariant(item.status)}>
                        {statusLabel}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {item.status === "PENDING" ? (
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleApprove(item.id)}
                            disabled={disableActions}
                          >
                            {rowBusy && pendingAction?.type === "approve" ? (
                              <Spinner className="size-4" />
                            ) : (
                              <IconCircleCheck className="size-4" />
                            )}
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleReject(item.id)}
                            disabled={disableActions}
                          >
                            {rowBusy && pendingAction?.type === "reject" ? (
                              <Spinner className="size-4" />
                            ) : (
                              <IconCircleX className="size-4" />
                            )}
                            Reject
                          </Button>
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">{statusLabel}</div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3 text-sm md:flex-row md:items-center md:justify-between">
        <div className="text-muted-foreground">
          Page {initialData.page} of {totalPages} · {initialData.total} total requests
        </div>
        <div className="flex items-center gap-2 self-end md:self-auto">
          <Button
            size="sm"
            variant="outline"
            onClick={() => goToPage(Math.max(1, initialData.page - 1))}
            disabled={initialData.prevPage === null || isRouting}
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => goToPage(initialData.nextPage ?? initialData.page + 1)}
            disabled={initialData.nextPage === null || isRouting}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
