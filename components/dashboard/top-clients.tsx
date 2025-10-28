import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type Item = { name: string; executions: number }

const defaults: Item[] = [
  { name: "Acme Ltd", executions: 220 },
  { name: "Globex", executions: 180 },
  { name: "Umbrella", executions: 120 },
  { name: "Soylent", executions: 75 },
  { name: "Initech", executions: 60 },
]

export function TopClients({ items = defaults }: { items?: Item[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Most active clients</CardTitle>
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

