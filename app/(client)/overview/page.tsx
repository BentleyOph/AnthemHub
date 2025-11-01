import Link from "next/link";
import { Suspense } from "react";
import {
  IconActivity,
  IconChevronRight,
  IconClock,
  IconPlayerPlay,
  IconRocket,
} from "@tabler/icons-react";

import {
  getClientOverviewData,
  type ClientOverviewAssignedWorkflow,
  type ClientOverviewData,
  type ClientOverviewExecution,
  type ClientOverviewMetrics,
} from "@/lib/client/overview";
import { ClientNav } from "@/components/client/client-nav";
import { RequestAccessButton } from "@/components/client/request-access-button";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const TIMEZONE = process.env.APP_TIMEZONE ?? "Africa/Nairobi";

export default function ClientOverviewPage() {
  return (
    <Suspense fallback={<OverviewSkeleton />}>
      <ClientOverviewContent />
    </Suspense>
  );
}

async function ClientOverviewContent() {
  const data = await getClientOverviewData();

  return (
    <div className="flex flex-col gap-8">
      <ClientNav
        clientName={data.clientName}
        clientCompany={data.clientCompany}
        userName={data.userName}
        activeHref="/overview"
      />

      {data.clientId ? (
        <>
          <AssignedWorkflowsSection
            clientName={data.clientName}
            assigned={data.assignedHero}
            totalAssigned={data.assignedWorkflowCount}
          />

          <MetricsSection metrics={data.metrics} />

          <div className="grid gap-6 lg:grid-cols-[1.75fr_minmax(0,1fr)]">
            <RecentActivitySection executions={data.recentExecutions} />
            <DiscoverSection discover={data.discover} canRequest={Boolean(data.clientId)} />
          </div>
        </>
      ) : (
        <UnassignedState />
      )}
    </div>
  );
}

function AssignedWorkflowsSection({
  clientName,
  assigned,
  totalAssigned,
}: {
  clientName: string;
  assigned: ClientOverviewAssignedWorkflow[];
  totalAssigned: number;
}) {
  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-2xl font-semibold">My Workflows</h1>
          <p className="text-sm text-muted-foreground">
            Quick access to what your team runs most, {clientName}.
          </p>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/workflows">
            See all {totalAssigned > assigned.length ? `(${totalAssigned})` : ""}
            <IconChevronRight className="size-4" />
          </Link>
        </Button>
      </header>

      {assigned.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {assigned.map((workflow) => (
            <Card
              key={workflow.id}
              className="flex h-full flex-col justify-between border border-primary/10 bg-gradient-to-br from-primary/5 via-card to-card shadow-sm"
            >
              <CardHeader className="flex flex-row items-start gap-3 space-y-0">
                <WorkflowIcon iconUrl={workflow.iconUrl} name={workflow.name} />
                <div className="space-y-1">
                  <CardTitle className="text-lg">{workflow.name}</CardTitle>
                  <CardDescription className="line-clamp-3 text-sm leading-relaxed">
                    {workflow.description}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardFooter className="flex items-center justify-between gap-2">
                <Button size="sm" asChild>
                  <Link href={workflow.runHref}>
                    <IconPlayerPlay className="size-4" />
                    Run
                  </Link>
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
      ) : (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>No workflows assigned yet</CardTitle>
            <CardDescription>
              Explore the catalog to request access to automations that fit your
              needs.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button asChild>
              <Link href="/catalog">
                Browse catalog
                <IconChevronRight className="size-4" />
              </Link>
            </Button>
          </CardFooter>
        </Card>
      )}
    </section>
  );
}

function MetricsSection({ metrics }: { metrics: ClientOverviewMetrics }) {
  const successRateValue =
    metrics.successRate30d === null
      ? "—"
      : `${formatPercentage(metrics.successRate30d)}%`;
  const successRateHint =
    metrics.successRate30d !== null && metrics.successRate30d > 0
      ? "Keep momentum going"
      : "Run a workflow to start tracking";

  const metricCards = [
    {
      label: "Executions (month)",
      value: formatNumber(metrics.executionsThisMonth),
      hint: metrics.lastRunAt
        ? `Last run ${formatRelative(metrics.lastRunAt)}`
        : "No runs recorded yet",
      icon: <IconClock className="size-4" />,
    },
    {
      label: "Success rate (30d)",
      value: successRateValue,
      hint: successRateHint,
      icon: <IconActivity className="size-4" />,
    },
    {
      label: "Time saved (est)",
      value: formatTimeSaved(70),
      hint: "Across successful runs this month",
      icon: <IconRocket className="size-4" />,
    },
  ];

  return (
    <section className="grid gap-4 md:grid-cols-3">
      {metricCards.map((metric) => (
        <Card
          key={metric.label}
          className="flex flex-col justify-between border border-border/60 shadow-xs"
        >
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              {metric.icon}
              {metric.label}
            </div>
            <CardTitle className="text-2xl font-semibold">
              {metric.value}
            </CardTitle>
            <CardDescription>{metric.hint}</CardDescription>
          </CardHeader>
        </Card>
      ))}
    </section>
  );
}

function RecentActivitySection({
  executions,
}: {
  executions: ClientOverviewExecution[];
}) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
        <CardDescription>Your latest workflow runs and outcomes.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        {executions.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Workflow</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {executions.map((execution) => (
                <TableRow key={execution.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {execution.workflowName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDuration(execution.durationMs)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(execution.status)}>
                      {statusLabel(execution.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDateTime(execution.startedAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" asChild>
                      <Link href={`/workflows/${execution.workflowId}/run`}>
                        Run again
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/80 bg-muted/40 p-6 text-center text-sm text-muted-foreground">
            <p>No executions yet</p>
            <p className="max-w-xs">
              Run one of your assigned workflows to see real-time progress and
              metrics here.
            </p>
            <Button size="sm" asChild>
              <Link href="/workflows">
                Go to My Workflows
                <IconChevronRight className="size-4" />
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DiscoverSection({
  discover,
  canRequest,
}: {
  discover: ClientOverviewData["discover"];
  canRequest: boolean;
}) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle>Discover</CardTitle>
        <CardDescription>
          Published workflows you can request to unlock more automation.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        {discover.length > 0 ? (
          <div className="flex gap-3 overflow-x-auto pb-3">
            {discover.map((workflow) => (
              <Card
                key={workflow.id}
                className="min-w-[220px] flex-1 border border-border/60 bg-card/80"
              >
                <CardHeader className="space-y-3">
                  <WorkflowIcon
                    iconUrl={workflow.iconUrl}
                    name={workflow.name}
                    size="sm"
                  />
                  <div>
                    <CardTitle className="text-base font-semibold">
                      {workflow.name}
                    </CardTitle>
                    <CardDescription className="line-clamp-3 text-sm">
                      {workflow.description}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardFooter>
                  <RequestAccessButton
                    workflowId={workflow.id}
                    workflowName={workflow.name}
                    status={workflow.requestStatus ?? null}
                    disabled={!canRequest}
                    disabledReason={
                      canRequest
                        ? null
                        : "You need to be linked to a client workspace before requesting access."
                    }
                  />
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/60 bg-muted/40 p-6 text-center text-sm text-muted-foreground">
            <p>All set for now</p>
            <p className="max-w-xs">
              You already have access to every published workflow. Check back
              soon—new automations land here first.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UnassignedState() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome to Anthem Hub</CardTitle>
        <CardDescription>
          Your account is active, but a client workspace has not been linked
          yet. Once an admin assigns you to a client, your workflows, metrics,
          and history will appear here.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>Need help?</span>
          <Button variant="outline" size="sm" asChild>
            <Link href="/catalog">Explore catalog</Link>
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <Link href="mailto:support@anthem.example">Contact support</Link>
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-24 rounded-xl" />
      <Skeleton className="h-12 w-2/3 max-w-sm" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
      <Skeleton className="h-72 rounded-xl" />
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatPercentage(rate: number | null): string {
  if (rate === null || Number.isNaN(rate)) return "—";
  return rate % 1 === 0 ? rate.toString() : rate.toFixed(1);
}

function formatTimeSaved(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes <= 0) return "0 min";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  return hours >= 10 ? `${Math.round(hours)} hr` : `${hours.toFixed(1)} hr`;
}

function formatRelative(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "recently";
  }
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.round(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  const diffHours = Math.round(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

function formatDateTime(value: string): string {
  try {
    const formatter = new Intl.DateTimeFormat(undefined, {
      timeZone: TIMEZONE,
      dateStyle: "medium",
      timeStyle: "short",
    });
    return formatter.format(new Date(value));
  } catch {
    return value;
  }
}

function formatDuration(durationMs: number | null): string {
  if (durationMs === null || durationMs <= 0) return "—";
  const totalSeconds = Math.round(durationMs / 1000);
  if (totalSeconds < 1) return "<1s";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (remainingMinutes > 0) parts.push(`${remainingMinutes}m`);
  if (seconds > 0 && hours === 0) parts.push(`${seconds}s`);
  return parts.join(" ");
}

function statusBadgeVariant(
  status: ClientOverviewExecution["status"],
): "default" | "secondary" | "destructive" | "outline" {
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

function statusLabel(status: ClientOverviewExecution["status"]): string {
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
