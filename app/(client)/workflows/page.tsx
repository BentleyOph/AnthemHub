import Link from "next/link";
import { Suspense } from "react";
import {
  IconChevronRight,
  IconClock,
  IconInfoCircle,
} from "@tabler/icons-react";

import { ClientNav } from "@/components/client/client-nav";
import { WorkflowIcon } from "@/components/client/workflow-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getClientWorkflowsData,
  type ClientPendingRequest,
  type ClientWorkflowListItem,
} from "@/lib/client/workflows";
import type { ExecutionStatus } from "@/lib/client/overview";

const TIMEZONE = process.env.APP_TIMEZONE ?? "Africa/Nairobi";

export default function ClientWorkflowsPage() {
  return (
    <Suspense fallback={<WorkflowsSkeleton />}>
      <WorkflowsContent />
    </Suspense>
  );
}

async function WorkflowsContent() {
  const data = await getClientWorkflowsData();

  return (
    <div className="flex flex-col gap-6">
      <ClientNav
        clientName={data.profile.clientName}
        clientCompany={data.profile.clientCompany}
        activeHref="/workflows"
      />

      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">My Workflows</h1>
        <p className="text-muted-foreground text-sm">
          Review and run the automations your team has access to. Keep tabs on recent runs and pending access requests.
        </p>
      </section>

      <AssignedWorkflowsSection workflows={data.workflows} />

      <PendingRequestsSection pending={data.pendingRequests} />
    </div>
  );
}

function AssignedWorkflowsSection({
  workflows,
}: {
  workflows: ClientWorkflowListItem[];
}) {
  if (workflows.length === 0) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle>No workflows assigned yet</CardTitle>
          <CardDescription>
            Explore the catalog to request access to automations that match your processes.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button size="sm" asChild>
            <Link href="/catalog">
              Browse catalog
              <IconChevronRight className="size-3.5" />
            </Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Assigned workflows</h2>
        <Badge variant="outline">{workflows.length} total</Badge>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {workflows.map((workflow) => (
          <Card key={workflow.id} className="flex h-full flex-col justify-between">
            <CardHeader className="space-y-3">
              <div className="flex items-start gap-3">
                <WorkflowIcon iconUrl={workflow.iconUrl} name={workflow.name} />
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base font-semibold leading-snug">
                      {workflow.name}
                    </CardTitle>
                    {!workflow.isPublished ? (
                      <Badge variant="secondary">Unpublished</Badge>
                    ) : null}
                  </div>
                  <CardDescription className="text-sm leading-relaxed">
                    {workflow.description}
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <IconClock className="size-3.5" />
                <span>
                  Last run: {formatDate(workflow.lastRunAt) ?? "No runs yet"}
                </span>
                {workflow.lastRunStatus ? (
                  <StatusBadge status={workflow.lastRunStatus} />
                ) : null}
              </div>
            </CardHeader>
            <CardFooter className="flex flex-wrap items-center gap-2">
              <Button size="sm" asChild>
                <Link href={workflow.runHref}>Run</Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href={workflow.detailsHref}>
                  Details
                  <IconChevronRight className="size-3.5" />
                </Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </section>
  );
}

function PendingRequestsSection({ pending }: { pending: ClientPendingRequest[] }) {
  if (pending.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <IconInfoCircle className="size-4 text-muted-foreground" />
          <CardTitle className="text-base">Pending access requests</CardTitle>
          <Badge variant="secondary">{pending.length}</Badge>
        </div>
        <CardDescription>
          We&apos;ll email you once an admin approves these requests. You can also follow up with your account manager.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {pending.map((request) => (
          <div
            key={request.id}
            className="flex flex-col gap-3 rounded-lg border border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-3">
              <WorkflowIcon iconUrl={request.iconUrl} name={request.workflowName} size="sm" />
              <div>
                <p className="text-sm font-medium leading-snug">
                  {request.workflowName}
                </p>
                {request.workflowDescription ? (
                  <p className="text-xs text-muted-foreground">
                    {request.workflowDescription}
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  Requested {formatDate(request.createdAt) ?? "recently"}
                </p>
              </div>
            </div>
            <Badge variant="secondary" className="w-fit">
              Pending
            </Badge>
          </div>
        ))}
      </CardContent>
      <CardFooter className="flex justify-end">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/catalog">
            View catalog
            <IconChevronRight className="size-3.5" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

function StatusBadge({ status }: { status: ExecutionStatus }) {
  const label = formatStatus(status);
  const variant = statusVariant(status);

  return (
    <Badge variant={variant} className="uppercase">
      {label}
    </Badge>
  );
}

function statusVariant(status: ExecutionStatus): React.ComponentProps<
  typeof Badge
>["variant"] {
  switch (status) {
    case "SUCCESS":
      return "default";
    case "PROCESSING":
    case "PENDING":
      return "secondary";
    case "ERROR":
      return "destructive";
    default:
      return "secondary";
  }
}

function formatStatus(status: ExecutionStatus): string {
  switch (status) {
    case "SUCCESS":
      return "Success";
    case "ERROR":
      return "Error";
    case "PROCESSING":
      return "Processing";
    case "PENDING":
      return "Pending";
    default:
      return status;
  }
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

function WorkflowsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-24 rounded-xl" />
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Card key={index}>
            <CardHeader className="space-y-3">
              <div className="flex items-start gap-3">
                <Skeleton className="size-12 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              </div>
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardFooter>
              <Skeleton className="h-8 w-28" />
            </CardFooter>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-56" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-6 w-20" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
