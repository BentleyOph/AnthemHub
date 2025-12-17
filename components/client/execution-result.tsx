"use client";

import { useExecutionStream } from "@/hooks/use-execution-stream";
import { ResultViewer } from "@/components/result-viewer";
import {
  normalizeResultFileUrls,
  type ResultFileValue,
} from "@/lib/result-files";

type Props = {
  executionId: string;
  isLive: boolean;
  initialOutput: unknown;
  initialFileUrl: ResultFileValue;
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
  const fileUrls = normalizeResultFileUrls(update?.result_file_url ?? initialFileUrl);

  const attachments = fileUrls.map((url, index) => ({
    url,
    name: fileUrls.length > 1 ? `Attachment ${index + 1}` : "Result file",
  }));

  return (
    <ResultViewer
      output={output}
      attachments={attachments}
      title="Result"
    />
  );
}
