import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type Item = { name: string; executions: number }

const defaults: Item[] = [
  { name: "Invoice Extractor", executions: 128 },
  { name: "Lead Enrichment", executions: 96 },
  { name: "Report Generator", executions: 80 },
  { name: "Email Cleaner", executions: 55 },
  { name: "PDF Splitter", executions: 44 },
]

export function TopWorkflows({ items = defaults }: { items?: Item[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Most used workflows</CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        <ul className="divide-border text-sm grid gap-2">
          {items.map((w, i) => (
            <li key={i} className="flex items-center justify-between rounded-md border p-3">
              <span className="truncate font-medium">{w.name}</span>
              <span className="text-muted-foreground tabular-nums">{w.executions}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

