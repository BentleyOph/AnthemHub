import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  IconArrowLeft,
  IconChevronRight,
} from "@tabler/icons-react";

import { ClientNav } from "@/components/client/client-nav";
import { RequestAccessButton } from "@/components/client/request-access-button";
import { WorkflowIcon } from "@/components/client/workflow-icon";
import { WorkflowRunForm } from "@/components/client/workflow-run-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getWorkflowRunData } from "@/lib/client/workflow-run";

const TIMEZONE = process.env.APP_TIMEZONE ?? "Africa/Nairobi";

type WorkflowRunData = NonNullable<Awaited<ReturnType<typeof getWorkflowRunData>>>;

interface WorkflowRunPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function WorkflowRunPage({ params }: WorkflowRunPageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<RunSkeleton />}>
      <WorkflowRunContent workflowId={id} />
    </Suspense>
  );
}

async function WorkflowRunContent({ workflowId }: { workflowId: string }) {
  const data = await getWorkflowRunData(workflowId);

  if (!data) {
    notFound();
  }

  const { workflow, hasAccess, request, assignedAt, profile, canRequest } = data;

  return (
    <div className="flex flex-col gap-6">
      <ClientNav
        clientName={profile.clientName}
        clientCompany={profile.clientCompany}
        activeHref="/workflows"
      />

      <Button variant="ghost" size="sm" asChild>
        <Link href="/workflows">
          <IconArrowLeft className="mr-2 size-4" /> Back to workflows
        </Link>
      </Button>

      <Card>
        <CardHeader className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-3">
              <WorkflowIcon iconUrl={workflow.iconUrl} name={workflow.name} />
              <div className="space-y-2">
                <CardTitle className="text-2xl font-semibold leading-tight">
                  {workflow.name}
                </CardTitle>
                <CardDescription className="text-base leading-relaxed">
                  {workflow.description}
                </CardDescription>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>Workflow ID: {workflow.id}</span>
                  <span>•</span>
                  <span>Updated {formatDate(workflow.updatedAt) ?? "recently"}</span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {workflow.isPublished ? (
                <Badge variant="default">Published</Badge>
              ) : (
                <Badge variant="secondary">Draft</Badge>
              )}
              {hasAccess ? <Badge variant="outline">Assigned</Badge> : null}
              {request ? <RequestStatusBadge status={request.status} /> : null}
            </div>
          </div>
          <MetadataList
            hasAccess={hasAccess}
            assignedAt={assignedAt}
            request={request}
          />
        </CardHeader>
      </Card>

      {!hasAccess ? (
        <Card className="border-dashed">
          <CardHeader className="space-y-3">
            <CardTitle>Access required</CardTitle>
            <CardDescription>
              You do not currently have permission to run this workflow. Request access and an admin will review it.
            </CardDescription>
            <div className="flex flex-wrap items-center gap-3">
              <RequestAccessButton
                workflowId={workflow.id}
                workflowName={workflow.name}
                status={request?.status ?? null}
                disabled={!canRequest}
                disabledReason={
                  canRequest
                    ? null
                    : "A client workspace must be linked to your account before requesting access."
                }
              />
              <Button variant="ghost" size="sm" asChild>
                <Link href="/catalog">
                  View catalog
                  <IconChevronRight className="size-3.5" />
                </Link>
              </Button>
            </div>
          </CardHeader>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Input payload</CardTitle>
          <CardDescription>
            Provide the fields defined by this workflow&apos;s JSON schema. Validation happens client-side before we queue an execution.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WorkflowRunForm
            key={workflow.id}
            workflowId={workflow.id}
            workflowName={workflow.name}
            schema={workflow.inputSchema}
            disabled={!hasAccess}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function RequestStatusBadge({
  status,
}: {
  status: NonNullable<WorkflowRunData["request"]>["status"];
}) {
  if (status === "PENDING") {
    return <Badge variant="secondary">Request pending</Badge>;
  }

  if (status === "APPROVED") {
    return <Badge variant="outline">Request approved</Badge>;
  }

  if (status === "DENIED") {
    return <Badge variant="destructive">Request denied</Badge>;
  }

  return null;
}

function MetadataList({
  hasAccess,
  assignedAt,
  request,
}: {
  hasAccess: boolean;
  assignedAt: string | null;
  request: WorkflowRunData["request"];
}) {
  if (!hasAccess && !request) {
    return null;
  }

  return (
    <dl className="grid gap-4 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
      {hasAccess ? (
        <div>
          <dt className="font-medium text-foreground">Assigned</dt>
          <dd>{assignedAt ? formatDate(assignedAt) : "Awaiting assignment"}</dd>
        </div>
      ) : null}
      {request ? (
        <div>
          <dt className="font-medium text-foreground">Access request</dt>
          <dd>{formatDate(request.createdAt) ?? "Pending"}</dd>
        </div>
      ) : null}
    </dl>
  );
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

function RunSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-24 rounded-xl" />
      <Skeleton className="h-8 w-32" />
      <Card>
        <CardHeader className="space-y-4">
          <div className="flex items-start gap-3">
            <Skeleton className="size-12 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-6 w-64" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
