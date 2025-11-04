import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostgrestSingleResponse } from "@supabase/postgrest-js";
import { IconChartDonutFilled, IconClock, IconHourglass, IconUsers } from "@tabler/icons-react";
import { redirect } from "next/navigation";

import { OverviewCards, type OverviewMetric } from "@/components/dashboard/overview-cards";
import {
  ExecutionsChart,
  type ExecutionSeriesBuckets,
  type ExecutionSeriesPoint,
} from "@/components/dashboard/executions-chart";
import { TopWorkflows, type TopWorkflowItem } from "@/components/dashboard/top-workflows";
import { RecentExecutions, type RecentExecutionItem } from "@/components/dashboard/recent-executions";
import { TopClients, type TopClientItem } from "@/components/dashboard/top-clients";
import {
  getSupabaseServerClient,
  getSupabaseServiceRoleClient,
} from "@/lib/supabase/server";

export const revalidate = 30;

type AdminOverviewKpis = {
  executions_today: number | string | null;
  success_rate_7d: number | string | null;
  active_clients_today: number | string | null;
  pending_requests_count: number | string | null;
};

type ExecutionRow = { started_at: string | null };
type DailyAggregateRow = { day: string | null; total: number | string | null };
type ExecutionDetailRow = {
  id: string;
  status: string | null;
  started_at: string | null;
  client_name: string | null;
  workflow_name: string | null;
};
type RpcResult<T> = PostgrestSingleResponse<T>;

const TIME_ZONE = process.env.APP_TIMEZONE ?? "Africa/Nairobi";

const numberFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
});

const percentFormatter = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  timeZone: TIME_ZONE,
  dateStyle: "medium",
  timeStyle: "short",
});

async function ensureAdminSession() {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    console.error("Failed to retrieve authenticated user for admin overview", error);
    redirect("/login");
  }

  const user = data.user;

  if (!user) {
    redirect("/login");
  }

  const metadataRole = user.app_metadata?.role;
  if (metadataRole === "ADMIN") {
    return;
  }

  const admin = getSupabaseServiceRoleClient();
  const { data: profile } = await admin
    .from("user_profile")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: "ADMIN" | "CLIENT" | null }>();

  if (profile?.role !== "ADMIN") {
    redirect("/overview");
  }
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatInteger(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const num = toNumber(value);
  return numberFormatter.format(num);
}

function formatPercent(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const num = toNumber(value);
  return `${percentFormatter.format(num)}%`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return dateTimeFormatter.format(new Date(value));
  } catch (error) {
    console.error("Failed to format date", error);
    return "—";
  }
}

const EXEC_STATUSES: ReadonlyArray<RecentExecutionItem["status"]> = [
  "SUCCESS",
  "ERROR",
  "PROCESSING",
  "PENDING",
];

function normalizeStatus(status: string | null | undefined): RecentExecutionItem["status"] {
  if (EXEC_STATUSES.includes(status as RecentExecutionItem["status"])) {
    return status as RecentExecutionItem["status"];
  }
  return "PROCESSING";
}

function buildHourlySeries(rows: ExecutionRow[], now = new Date()): ExecutionSeriesPoint[] {
  const buckets = new Map<number, number>();
  const currentHour = new Date(now);
  currentHour.setUTCMinutes(0, 0, 0);

  for (let i = 23; i >= 0; i--) {
    const bucketDate = new Date(currentHour);
    bucketDate.setUTCHours(bucketDate.getUTCHours() - i);
    buckets.set(bucketDate.getTime(), 0);
  }

  for (const row of rows) {
    if (!row.started_at) continue;
    const date = new Date(row.started_at);
    if (Number.isNaN(date.getTime())) continue;
    const bucketDate = new Date(date);
    bucketDate.setUTCMinutes(0, 0, 0);
    const key = bucketDate.getTime();
    if (!buckets.has(key)) continue;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([ts, executions]) => ({ ts: new Date(ts).toISOString(), executions }));
}

function buildDailySeries(rows: DailyAggregateRow[], days: number, now = new Date()): ExecutionSeriesPoint[] {
  const buckets = new Map<number, number>();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  for (let i = days - 1; i >= 0; i--) {
    const bucketDate = new Date(today);
    bucketDate.setUTCDate(bucketDate.getUTCDate() - i);
    buckets.set(bucketDate.getTime(), 0);
  }

  for (const row of rows) {
    if (!row.day) continue;
    const day = new Date(row.day);
    if (Number.isNaN(day.getTime())) continue;
    const bucketDate = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
    const key = bucketDate.getTime();
    if (!buckets.has(key)) continue;
    const count = toNumber(row.total);
    buckets.set(key, count);
  }

  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([ts, executions]) => ({ ts: new Date(ts).toISOString(), executions }));
}

async function callRpc<T>(
  admin: SupabaseClient,
  fn: string,
  args?: Record<string, unknown>,
): Promise<RpcResult<T>> {
  return (await admin.rpc(fn, args)) as RpcResult<T>;
}

async function fetchKpis(admin: SupabaseClient) {
  const { data, error } = await callRpc<AdminOverviewKpis[]>(admin, "get_admin_overview_kpis");

  if (error) {
    console.error("Failed to load admin overview KPIs", error);
    return null;
  }

  return data?.[0] ?? null;
}

async function fetchTopWorkflows(admin: SupabaseClient): Promise<TopWorkflowItem[]> {
  const { data, error } = await callRpc<
    Array<{ name: string | null; executions: number | string | null }>
  >(admin, "get_top_workflows", { limit_count: 5 });

  if (error) {
    console.error("Failed to load top workflows", error);
    return [];
  }

  return (data ?? [])
    .map((row) => ({
      name: row.name ?? "Unknown workflow",
      executions: toNumber(row.executions),
    }))
    .filter((row) => row.name.trim().length > 0);
}

async function fetchTopClients(admin: SupabaseClient): Promise<TopClientItem[]> {
  const { data, error } = await callRpc<
    Array<{ name: string | null; executions: number | string | null }>
  >(admin, "get_top_clients", { limit_count: 5 });

  if (error) {
    console.error("Failed to load top clients", error);
    return [];
  }

  return (data ?? [])
    .map((row) => ({
      name: row.name ?? "Unknown client",
      executions: toNumber(row.executions),
    }))
    .filter((row) => row.name.trim().length > 0);
}

async function fetchRecentExecutions(admin: SupabaseClient): Promise<RecentExecutionItem[]> {
  const { data, error } = (await admin
    .from("v_execution_details")
    .select("id,status,started_at,client_name,workflow_name")
    .order("started_at", { ascending: false })
    .limit(20)) as PostgrestSingleResponse<ExecutionDetailRow[]>;

  if (error) {
    console.error("Failed to load recent executions", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    workflow: row.workflow_name ?? "Unknown workflow",
    client: row.client_name ?? "Unknown client",
    status: normalizeStatus(row.status),
    startedAt: formatDateTime(row.started_at),
  }));
}

async function fetchExecutionSeries(admin: SupabaseClient, now = new Date()): Promise<ExecutionSeriesBuckets> {
  const dayCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const dailyCutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  dailyCutoff.setUTCDate(dailyCutoff.getUTCDate() - 29);

  const [recentRowsResult, dailyRowsResult] = await Promise.all([
    (await admin
      .from("execution")
      .select("started_at")
      .gte("started_at", dayCutoff.toISOString())
      .lte("started_at", now.toISOString())
      .limit(5000)) as PostgrestSingleResponse<ExecutionRow[]>,
    (await admin
      .from("v_executions_daily")
      .select("day,total")
      .gte("day", dailyCutoff.toISOString())
      .order("day", { ascending: true })) as PostgrestSingleResponse<DailyAggregateRow[]>,
  ]);

  if (recentRowsResult.error) {
    console.error("Failed to load hourly execution series", recentRowsResult.error);
  }

  if (dailyRowsResult.error) {
    console.error("Failed to load daily execution series", dailyRowsResult.error);
  }

  const daySeries = buildHourlySeries(recentRowsResult.data ?? [], now);
  const dailyRows = dailyRowsResult.data ?? [];

  return {
    day: daySeries,
    week: buildDailySeries(dailyRows, 7, now),
    month: buildDailySeries(dailyRows, 30, now),
  };
}

async function getOverviewData() {
  const admin = getSupabaseServiceRoleClient();

  const [kpis, topWorkflows, topClients, recentExecutions, series] = await Promise.all([
    fetchKpis(admin),
    fetchTopWorkflows(admin),
    fetchTopClients(admin),
    fetchRecentExecutions(admin),
    fetchExecutionSeries(admin),
  ]);

  const metrics: OverviewMetric[] = [
    {
      label: "Total executions (today)",
      value: formatInteger(kpis?.executions_today ?? null),
      icon: <IconClock className="size-4" />,
    },
    {
      label: "Success rate of executions",
      value: formatPercent(kpis?.success_rate_7d ?? null),
      icon: <IconChartDonutFilled className="size-4" />,
    },
    {
      label: "Active clients",
      value: formatInteger(kpis?.active_clients_today ?? null),
      icon: <IconUsers className="size-4" />,
    },
    {
      label: "Pending requests",
      value: formatInteger(kpis?.pending_requests_count ?? null),
      icon: <IconHourglass className="size-4" />,
    },
  ];

  return {
    metrics,
    topWorkflows,
    topClients,
    recentExecutions,
    series,
  };
}

export default async function AdminOverviewPage() {
  await ensureAdminSession();
  const { metrics, topWorkflows, topClients, recentExecutions, series } = await getOverviewData();

  return (
    <>
      <OverviewCards metrics={metrics} />
      <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @4xl/main:grid-cols-3">
        <div className="@container/left col-span-2">
          <ExecutionsChart data={series} timeZone={TIME_ZONE} />
        </div>
        <div className="col-span-1">
          <TopWorkflows items={topWorkflows} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @4xl/main:grid-cols-3">
        <div className="col-span-2">
          <RecentExecutions items={recentExecutions} />
        </div>
        <div className="col-span-1">
          <TopClients items={topClients} />
        </div>
      </div>
    </>
  );
}
