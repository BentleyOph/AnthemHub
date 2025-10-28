"use client"

import * as React from "react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type ExecutionSeriesPoint = { ts: string; executions: number };
export type ExecutionSeriesBuckets = {
  day: ExecutionSeriesPoint[];
  week: ExecutionSeriesPoint[];
  month: ExecutionSeriesPoint[];
};

const fallbackSeries: ExecutionSeriesBuckets = {
  day: Array.from({ length: 14 }).map((_, i) => {
    const base = new Date();
    base.setDate(base.getDate() - (13 - i));
    const seed = (i * 73) % 17;
    return { ts: base.toISOString(), executions: 20 + ((seed * 13) % 25) };
  }),
  week: Array.from({ length: 10 }).map((_, i) => {
    const base = new Date();
    base.setDate(base.getDate() - (9 - i) * 7);
    return { ts: base.toISOString(), executions: 120 + ((i * 17) % 80) };
  }),
  month: Array.from({ length: 12 }).map((_, i) => {
    const base = new Date();
    base.setMonth(base.getMonth() - (11 - i));
    return { ts: base.toISOString(), executions: 300 + ((i * 37) % 160) };
  }),
};

const chartConfig = {
  executions: { label: "Executions", color: "var(--primary)" },
} satisfies ChartConfig;

interface ExecutionsChartProps {
  data?: ExecutionSeriesBuckets;
  timeZone?: string;
}

export function ExecutionsChart({ data = fallbackSeries, timeZone }: ExecutionsChartProps) {
  const [range, setRange] = React.useState<"day" | "week" | "month">("day");
  const series = data[range] ?? [];

  const formatter = React.useMemo(() => {
    return new Intl.DateTimeFormat(undefined, {
      timeZone,
      month: "short",
      day: "numeric",
      hour: range === "day" ? "numeric" : undefined,
      hourCycle: "h24",
    });
  }, [range, timeZone]);

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Executions</CardTitle>
        <CardDescription>By {range}</CardDescription>
        <CardAction>
          <ToggleGroup
            type="single"
            value={range}
            onValueChange={(v) => {
              if (v === "day" || v === "week" || v === "month") {
                setRange(v);
              }
            }}
            variant="outline"
            className="hidden *:data-[slot=toggle-group-item]:!px-4 @[767px]/card:flex"
          >
            <ToggleGroupItem value="day">Day</ToggleGroupItem>
            <ToggleGroupItem value="week">Week</ToggleGroupItem>
            <ToggleGroupItem value="month">Month</ToggleGroupItem>
          </ToggleGroup>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer config={chartConfig} className="aspect-auto h-[260px] w-full">
          <AreaChart data={series}>
            <defs>
              <linearGradient id="fillExec" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-executions)" stopOpacity={0.9} />
                <stop offset="95%" stopColor="var(--color-executions)" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="ts"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value) => {
                const d = new Date(value);
                if (range === "day") {
                  return formatter.format(d);
                }
                if (range === "week") {
                  return `W${getWeek(d)} ${d.getUTCFullYear()}`;
                }
                return new Intl.DateTimeFormat(undefined, {
                  timeZone,
                  month: "short",
                  year: "2-digit",
                }).format(d);
              }}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  indicator="dot"
                  labelFormatter={(v) =>
                    new Intl.DateTimeFormat(undefined, {
                      timeZone,
                      dateStyle: "medium",
                      timeStyle: range === "day" ? "short" : undefined,
                    }).format(new Date(v))
                  }
                />
              }
            />
            <Area dataKey="executions" type="natural" name="Executions" fill="url(#fillExec)" stroke="var(--color-executions)" />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

function getWeek(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
