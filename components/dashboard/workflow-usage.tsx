import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCostAmount } from "@/lib/costs";

export type WorkflowUsageItem = {
  id: string;
  name: string;
  totalCost: number | null;
  averageCost: number | null;
  executions: number;
  currency: string | null;
};

type Props = {
  items?: WorkflowUsageItem[];
  rangeLabel?: string;
  defaultCurrency?: string | null;
};

export function WorkflowUsageBreakdown({
  items = [],
  rangeLabel = "Last 30 days",
  defaultCurrency,
}: Props) {
  const hasData = items.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workflow usage</CardTitle>
        <CardDescription>{rangeLabel}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasData ? (
          items.map((item) => {
            const currency = item.currency ?? defaultCurrency ?? undefined;
            return (
              <div key={item.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-3 text-sm font-medium text-foreground">
                  <span className="truncate">{item.name}</span>
                  <span className="tabular-nums text-base">
                    {formatCostAmount(item.totalCost, currency)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>{Number.isFinite(item.executions) ? `${item.executions} run${item.executions === 1 ? "" : "s"}` : "—"}</span>
                  <span>
                    Avg {formatCostAmount(item.averageCost, currency)}
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <p className="text-sm text-muted-foreground">No usage data available for this period.</p>
        )}
      </CardContent>
    </Card>
  );
}
