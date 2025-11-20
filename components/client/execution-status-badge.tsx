"use client";

import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { useExecutionStream } from "@/hooks/use-execution-stream";

type ExecutionStatus = "PENDING" | "PROCESSING" | "SUCCESS" | "ERROR";

type Props = {
  executionId: string;
  initialStatus: ExecutionStatus;
  isLive: boolean;
};

const STATUS_CONFIG: Record<ExecutionStatus, { label: string; variant: BadgeVariant }> = {
  SUCCESS: { label: "Complete", variant: "success" },
  ERROR: { label: "Failed", variant: "destructive" },
  PROCESSING: { label: "Processing", variant: "outline" },
  PENDING: { label: "Queued", variant: "outline" },
};

export function ClientExecutionStatusBadge({
  executionId,
  initialStatus,
  isLive,
}: Props) {
  const { update } = useExecutionStream(isLive ? executionId : undefined);

  // Resolve current status from SSE update or fallback to initial
  const currentStatus = (update?.status as ExecutionStatus) ?? initialStatus;
  const config = STATUS_CONFIG[currentStatus] ?? STATUS_CONFIG.PENDING;

  return <Badge variant={config.variant}>{config.label}</Badge>;
}
