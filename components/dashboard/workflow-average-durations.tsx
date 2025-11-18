import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type WorkflowAverageDurationItem = {
  id: string;
  name: string;
  durationLabel: string;
  durationSeconds: number;
};

const defaults: WorkflowAverageDurationItem[] = [
  { id: "a", name: "Invoice Extractor", durationLabel: "2m 15s", durationSeconds: 135 },
  { id: "b", name: "Lead Enrichment", durationLabel: "1m 42s", durationSeconds: 102 },
  { id: "c", name: "Email Cleaner", durationLabel: "58s", durationSeconds: 58 },
];

export function WorkflowAverageDurations({ items = defaults }: { items?: WorkflowAverageDurationItem[] }) {
  const hasData = items.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Avg execution time (7d)</CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        {hasData ? (
          <ul className="grid gap-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between rounded-md border p-3"
                title={`${item.durationSeconds}s on average`}
              >
                <span className="truncate font-medium">{item.name}</span>
                <span className="text-muted-foreground tabular-nums">{item.durationLabel}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No successful executions in the last 7 days.</p>
        )}
      </CardContent>
    </Card>
  );
}
