import { IconClock, IconUsers, IconHourglass, IconChartDonutFilled } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type Metric = {
  label: string
  value: string | number
  hint?: string
  icon?: React.ReactNode
}

const defaultMetrics: Metric[] = [
  { label: "Total executions (today)", value: 42, icon: <IconClock className="size-4" /> },
  { label: "Success rate of executions", value: "92%", icon: <IconChartDonutFilled className="size-4" /> },
  { label: "Active clients", value: 12, icon: <IconUsers className="size-4" /> },
  { label: "Pending requests", value: 3, icon: <IconHourglass className="size-4" /> },
]

export function OverviewCards({ metrics = defaultMetrics }: { metrics?: Metric[] }) {
  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      {metrics.map((m, i) => (
        <Card key={i} className="@container/card">
          <CardHeader>
            <CardDescription className="flex items-center gap-2">
              {m.icon}
              {m.label}
            </CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {m.value}
            </CardTitle>
            {m.hint ? (
              <CardAction>
                <Badge variant="outline">{m.hint}</Badge>
              </CardAction>
            ) : null}
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="text-muted-foreground">Key metric</div>
          </CardFooter>
        </Card>
      ))}
    </div>
  )
}

