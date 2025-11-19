import Link from "next/link";
import { notFound } from "next/navigation";
import {
  IconArrowLeft,
  IconCalendarTime,
  IconClockHour4,
  IconMail,
  IconTie,
} from "@tabler/icons-react";

import { ClientAccessManager } from "@/components/admin/clients/client-access-manager";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getClientDetail } from "@/lib/admin/clients/data";
import { formatCostAmount } from "@/lib/costs";

type RouteParams = {
  params: Promise<{ id: string }> | { id: string };
};

const TIMEZONE = process.env.APP_TIMEZONE ?? "Africa/Nairobi";

const integerFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const percentFormatter = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  timeZone: TIMEZONE,
  dateStyle: "medium",
  timeStyle: "short",
});

function isPromiseLike<T>(value: Promise<T> | T): value is Promise<T> {
  return typeof value === "object" && value !== null && "then" in value;
}

function formatDate(value: string, fallback = "—") {
  if (!value) return fallback;
  try {
    return dateTimeFormatter.format(new Date(value));
  } catch (error) {
    console.error("Failed to format date value", error);
    return fallback;
  }
}

function formatDuration(durationMs: number | null) {
  if (durationMs === null || durationMs < 0) return "—";
  const totalSeconds = Math.floor(durationMs / 1000);
  if (totalSeconds < 1) return "<1s";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [] as string[];
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds && hours === 0) parts.push(`${seconds}s`);
  return parts.join(" ") || "0s";
}

export default async function AdminClientDetailPage({ params }: RouteParams) {
  const resolvedParams = isPromiseLike(params) ? await params : params;
  const clientId = resolvedParams.id;

  if (!clientId) {
    notFound();
  }

  const detail = await getClientDetail(clientId);

  if (!detail) {
    notFound();
  }

  const {
    client,
    metrics,
    assignedWorkflows,
    assignableWorkflows,
    usage,
    users,
    workflowUsage,
    recentExecutions,
  } = detail;

  const accessKey = assignedWorkflows
    .map((workflow) => workflow.id)
    .sort()
    .join("|");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <Button variant="ghost" className="w-fit gap-2 px-0" asChild>
          <Link href="/admin/clients">
            <IconArrowLeft className="size-4" />
            Back to clients
          </Link>
        </Button>
        <h1 className="text-3xl font-semibold">{client.name}</h1>
        <p className="text-sm text-muted-foreground">
          Manage workflow assignments and review activity for this client.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Client profile</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-center gap-2 text-sm">
              <IconTie className="text-muted-foreground size-4" />
              <div>
                <div className="font-medium">Company</div>
                <div className="text-muted-foreground">{client.company ?? "—"}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <IconMail className="text-muted-foreground size-4" />
              <div>
                <div className="font-medium">Primary email</div>
                <div className="text-muted-foreground">{client.email ?? "—"}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <IconCalendarTime className="text-muted-foreground size-4" />
              <div>
                <div className="font-medium">Created</div>
                <div className="text-muted-foreground">{formatDate(client.createdAt)}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <IconClockHour4 className="text-muted-foreground size-4" />
              <div>
                <div className="font-medium">Last run</div>
                <div className="text-muted-foreground">
                  {metrics.lastRunAt ? formatDate(metrics.lastRunAt) : "—"}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-1">
          <Card>
            <CardHeader>
              <CardTitle>Executions (7d)</CardTitle>
              <CardDescription>Runs launched by this client in the past week.</CardDescription>
            </CardHeader>
            <CardContent className="text-3xl font-semibold">
              {integerFormatter.format(metrics.executionsLast7d)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Success rate (7d)</CardTitle>
              <CardDescription>Share of successful runs during the same period.</CardDescription>
            </CardHeader>
            <CardContent className="text-3xl font-semibold">
              {metrics.executionsLast7d === 0
                ? "—"
                : `${percentFormatter.format(metrics.successRateLast7d)}%`}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Assigned workflows</CardTitle>
              <CardDescription>Current number of entitled workflows.</CardDescription>
            </CardHeader>
            <CardContent className="text-3xl font-semibold">
              {integerFormatter.format(metrics.assignedWorkflowCount)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Usage</CardTitle>
              <CardDescription>
                {usage?.rangeLabel ?? "Recent cost activity for this client."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="text-3xl font-semibold">
                {usage
                  ? formatCostAmount(usage.totalCost, usage.currency ?? undefined)
                  : "—"}
              </div>
              <div className="text-sm text-muted-foreground">
                {usage
                  ? `${integerFormatter.format(usage.executionCount)} executions${
                      usage.averageCost !== null
                        ? ` · Avg ${formatCostAmount(
                            usage.averageCost,
                            usage.currency ?? undefined,
                          )}`
                        : ""
                    }`
                  : "No usage recorded for this period."}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Workflow usage</CardTitle>
          <CardDescription>
            {usage?.rangeLabel ?? "Recent usage broken down per workflow."}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {workflowUsage.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No workflow usage data recorded for this period.
            </p>
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-2 py-2">Workflow</th>
                  <th className="px-2 py-2 text-right">Executions</th>
                  <th className="px-2 py-2 text-right">Total cost</th>
                  <th className="px-2 py-2 text-right">Avg cost</th>
                </tr>
              </thead>
              <tbody>
                {workflowUsage.map((item) => (
                  <tr key={item.id} className="border-b last:border-b-0">
                    <td className="px-2 py-2 font-medium">{item.name}</td>
                    <td className="px-2 py-2 text-right">{integerFormatter.format(item.executions)}</td>
                    <td className="px-2 py-2 text-right">
                      {item.totalCost !== null
                        ? formatCostAmount(item.totalCost, item.currency ?? undefined)
                        : "—"}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {item.averageCost !== null
                        ? formatCostAmount(item.averageCost, item.currency ?? undefined)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Access control</CardTitle>
          <CardDescription>Grant or revoke workflow access for this client.</CardDescription>
        </CardHeader>
        <CardContent>
          <ClientAccessManager
            key={accessKey}
            clientId={client.id}
            workflows={assignableWorkflows}
            initialSelection={assignedWorkflows.map((workflow) => workflow.id)}
            assignedWorkflows={assignedWorkflows}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>People associated with this client.</CardDescription>
          <CardAction>
            <Button variant="secondary" size="sm" asChild>
              <Link href="/admin/users">Manage users</Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No users are mapped to this client yet.
            </p>
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-2 py-2">Email</th>
                  <th className="px-2 py-2">Role</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b last:border-b-0">
                    <td className="px-2 py-2">{user.email ?? "—"}</td>
                    <td className="px-2 py-2">
                      {user.role === "ADMIN" ? "Admin" : "Client"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent executions</CardTitle>
          <CardDescription>Latest activity.</CardDescription>
          <CardAction>
            <Button variant="secondary" size="sm" asChild>
              <Link
                href={{
                  pathname: "/admin/executions",
                  query: { client_id: client.id },
                }}
              >
                View all
              </Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-2 py-2">Workflow</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Started</th>
                <th className="px-2 py-2">Duration</th>
                <th className="px-2 py-2">Result</th>
              </tr>
            </thead>
            <tbody>
              {recentExecutions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-2 py-6 text-center text-muted-foreground">
                    No executions recorded yet for this client.
                  </td>
                </tr>
              ) : (
                recentExecutions.map((execution) => (
                  <tr key={execution.id} className="border-b last:border-b-0">
                    <td className="px-2 py-2 font-medium">{execution.workflowName}</td>
                    <td className="px-2 py-2">{execution.status}</td>
                    <td className="px-2 py-2">{formatDate(execution.startedAt)}</td>
                    <td className="px-2 py-2">{formatDuration(execution.durationMs)}</td>
                    <td className="px-2 py-2">
                      {execution.resultFileUrl ? (
                        <a
                          href={execution.resultFileUrl}
                          className="text-primary hover:underline"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Download
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
