"use client";

import { useExecutionStream } from "@/hooks/use-execution-stream";
import { ResultViewer } from "@/components/result-viewer";

type Props = {
  executionId: string;
  isLive: boolean;
  initialOutput: unknown;
  initialFileUrl: string | null;
};

export function ExecutionResult({
  executionId,
  isLive,
  initialOutput,
  initialFileUrl,
}: Props) {
  const { update } = useExecutionStream(isLive ? executionId : undefined);

  // Use SSE update if available, otherwise fall back to initial values
  const output = update?.output_payload ?? initialOutput;
  const fileUrl = update?.result_file_url ?? initialFileUrl;

  // Build attachments array
  const attachments = fileUrl
    ? [{ url: fileUrl, name: "Result file" }]
    : [];

  return (
    <ResultViewer
      output={output}
      attachments={attachments}
      title="Result"
    />
  );
}
