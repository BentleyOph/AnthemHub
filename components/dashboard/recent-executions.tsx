import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type RecentExecutionItem = {
  id: string;
  workflow: string;
  client: string;
  status: "SUCCESS" | "ERROR" | "PROCESSING" | "PENDING";
  startedAt: string;
};

const defaults: RecentExecutionItem[] = [
  {
    id: "e_01H",
    workflow: "Invoice Extractor",
    client: "Acme Ltd",
    status: "SUCCESS",
    startedAt: new Date().toLocaleString(),
  },
  {
    id: "e_02H",
    workflow: "Lead Enrichment",
    client: "Globex",
    status: "ERROR",
    startedAt: new Date(Date.now() - 36e5).toLocaleString(),
  },
  {
    id: "e_03H",
    workflow: "Report Generator",
    client: "Initech",
    status: "SUCCESS",
    startedAt: new Date(Date.now() - 2 * 36e5).toLocaleString(),
  },
  {
    id: "e_04H",
    workflow: "PDF Splitter",
    client: "Umbrella",
    status: "PROCESSING",
    startedAt: new Date(Date.now() - 3 * 36e5).toLocaleString(),
  },
];

function StatusBadge({ s }: { s: RecentExecutionItem["status"] }) {
  const map: Record<RecentExecutionItem["status"], BadgeVariant> = {
    SUCCESS: "success",
    ERROR: "destructive",
    PROCESSING: "outline",
    PENDING: "outline",
  };
  return <Badge variant={map[s]}>{s}</Badge>;
}

export function RecentExecutions({ items = defaults }: { items?: RecentExecutionItem[] }) {
  const hasData = items.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent executions</CardTitle>
      </CardHeader>
      <CardContent>
        {hasData ? (
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
                  <TableCell>
                    <StatusBadge s={e.status} />
                  </TableCell>
                  <TableCell>{e.startedAt}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">No recent executions.</p>
        )}
      </CardContent>
    </Card>
  );
}
