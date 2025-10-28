import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

type Exec = {
  id: string
  workflow: string
  client: string
  status: "SUCCESS" | "ERROR" | "PROCESSING"
  startedAt: string
}

const defaults: Exec[] = [
  { id: "e_01H", workflow: "Invoice Extractor", client: "Acme Ltd", status: "SUCCESS", startedAt: new Date().toISOString() },
  { id: "e_02H", workflow: "Lead Enrichment", client: "Globex", status: "ERROR", startedAt: new Date(Date.now() - 36e5).toISOString() },
  { id: "e_03H", workflow: "Report Generator", client: "Initech", status: "SUCCESS", startedAt: new Date(Date.now() - 2 * 36e5).toISOString() },
  { id: "e_04H", workflow: "PDF Splitter", client: "Umbrella", status: "PROCESSING", startedAt: new Date(Date.now() - 3 * 36e5).toISOString() },
]

function StatusBadge({ s }: { s: Exec["status"] }) {
  const map: Record<Exec["status"], string> = {
    SUCCESS: "secondary",
    ERROR: "destructive",
    PROCESSING: "outline",
  }
  return <Badge variant={map[s] as any}>{s}</Badge>
}

export function RecentExecutions({ items = defaults }: { items?: Exec[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent executions</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[160px]">Execution</TableHead>
              <TableHead>Workflow</TableHead>
              <TableHead>Client</TableHead>
              <TableHead className="w-[140px]">Status</TableHead>
              <TableHead className="w-[180px]">Started</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-mono text-xs">{e.id}</TableCell>
                <TableCell>{e.workflow}</TableCell>
                <TableCell>{e.client}</TableCell>
                <TableCell><StatusBadge s={e.status} /></TableCell>
                <TableCell>
                  {new Date(e.startedAt).toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
