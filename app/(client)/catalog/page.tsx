import Link from "next/link";
import { Suspense } from "react";
import { IconChevronRight } from "@tabler/icons-react";

import { Fades } from "@/components/animate-ui/primitives/effects/fade";
import { RequestAccessButton } from "@/components/client/request-access-button";
import { WorkflowIcon } from "@/components/client/workflow-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getClientCatalogData } from "@/lib/client/catalog";

const TIMEZONE = process.env.APP_TIMEZONE ?? "Africa/Nairobi";

export default function CatalogPage() {
  return (
    <Suspense fallback={<CatalogSkeleton />}>
      <CatalogContent />
    </Suspense>
  );
}

async function CatalogContent() {
  const data = await getClientCatalogData();
  const canRequest = Boolean(data.profile.clientId);
  const workflowsToShow = data.workflows.slice(0, 6);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Workflow Catalog</h1>
        <p className="text-muted-foreground text-sm">
          Browse published automations. Request access to add them to your workspace.
        </p>
      </header>

      {!canRequest ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>No client workspace linked</CardTitle>
            <CardDescription>
              An admin must link your user to a client before you can request access to workflows.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">
            Published workflows
          </h2>
          <Badge variant="outline">
            {data.totalAssigned} assigned • {data.workflows.length} available
          </Badge>
        </div>

        {data.workflows.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Fades holdDelay={140} className="h-full">
              {workflowsToShow.map((workflow) => (
                <WorkflowCard
                  key={workflow.id}
                  workflow={workflow}
                  canRequest={canRequest}
                />
              ))}
            </Fades>
          </div>
        ) : (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>No published workflows yet</CardTitle>
              <CardDescription>
                Check back soon—new automations will appear here as they are published by the Anthem team.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </section>
    </div>
  );
}

function WorkflowCard({
  workflow,
  canRequest,
}: {
  workflow: Awaited<ReturnType<typeof getClientCatalogData>>["workflows"][number];
  canRequest: boolean;
}) {
  const statusBadge = resolveStatusBadge(workflow);
  const requestedAtLabel = formatDate(workflow.requestedAt);
  const hasRequest = Boolean(workflow.requestStatus);

  return (
    <Card className="flex h-full flex-col justify-between border border-border/70">
      <CardHeader className="flex flex-row items-start gap-3 space-y-0">
        <WorkflowIcon iconUrl={workflow.iconUrl} name={workflow.name} size="lg" />
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base font-semibold leading-snug">
              {workflow.name}
            </CardTitle>
            {statusBadge}
          </div>
          <CardDescription className="line-clamp-3 text-sm leading-relaxed">
            {workflow.description}
          </CardDescription>
          {hasRequest && requestedAtLabel ? (
            <p className="text-xs text-muted-foreground">
              Requested {requestedAtLabel}
            </p>
          ) : null}
        </div>
      </CardHeader>
      <CardFooter className="flex flex-wrap items-center gap-2">
        {workflow.isAssigned ? (
          <Button size="sm" asChild>
            <Link href={`/workflows/${workflow.id}/run`}>
              Run
            </Link>
          </Button>
        ) : (
          <RequestAccessButton
            workflowId={workflow.id}
            workflowName={workflow.name}
            status={workflow.requestStatus}
            disabled={!canRequest}
            disabledReason={
              canRequest
                ? null
                : "You need to be linked to a client workspace before requesting access."
            }
          />
        )}

        <Drawer direction="right">
          <DrawerTrigger asChild>
            <Button variant="ghost" size="sm" type="button">
              Details
              <IconChevronRight className="size-3.5" />
            </Button>
          </DrawerTrigger>

          <DrawerContent className="sm:max-w-md">
            <DrawerHeader className="border-b">
              <div className="flex items-start gap-3">
                <WorkflowIcon iconUrl={workflow.iconUrl} name={workflow.name} size="lg" />
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <DrawerTitle className="text-lg font-semibold leading-tight">
                      {workflow.name}
                    </DrawerTitle>
                    {statusBadge}
                  </div>
                  <DrawerDescription>
                    {workflow.isAssigned
                      ? "Assigned to your workspace"
                      : "Available in catalog"}
                  </DrawerDescription>
                  {hasRequest && requestedAtLabel ? (
                    <p className="text-xs text-muted-foreground">
                      Requested {requestedAtLabel}
                    </p>
                  ) : null}
                </div>
              </div>
            </DrawerHeader>

            <div className="space-y-3 px-4 py-4">
              <p className="text-sm leading-relaxed text-foreground">
                {workflow.description || "No description provided yet."}
              </p>
            </div>

            <DrawerFooter className="border-t">
              {workflow.isAssigned ? (
                <Button size="sm" asChild>
                  <Link href={`/workflows/${workflow.id}/run`}>
                    Run workflow
                  </Link>
                </Button>
              ) : (
                <RequestAccessButton
                  workflowId={workflow.id}
                  workflowName={workflow.name}
                  status={workflow.requestStatus}
                  disabled={!canRequest}
                  disabledReason={
                    canRequest
                      ? null
                      : "You need to be linked to a client workspace before requesting access."
                  }
                />
              )}

              <DrawerClose asChild>
                <Button variant="outline" size="sm" type="button">
                  Close
                </Button>
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      </CardFooter>
    </Card>
  );
}

function resolveStatusBadge(workflow: Awaited<ReturnType<typeof getClientCatalogData>>["workflows"][number]) {
  if (workflow.isAssigned) {
    return <Badge>Assigned</Badge>;
  }

  if (workflow.requestStatus === "PENDING") {
    return <Badge variant="secondary">Requested</Badge>;
  }

  if (workflow.requestStatus === "APPROVED") {
    return <Badge variant="outline">Approved</Badge>;
  }

  if (workflow.requestStatus === "DENIED") {
    return <Badge variant="destructive">Denied</Badge>;
  }

  return null;
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

function CatalogSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Card key={index} className="border border-border/70">
            <CardHeader className="space-y-3">
              <div className="flex items-start gap-3">
                <Skeleton className="size-12 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              </div>
            </CardHeader>
            <CardFooter>
              <Skeleton className="h-8 w-28" />
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
