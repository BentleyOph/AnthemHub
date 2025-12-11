"use client";

import { IconFileText } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { PayloadViewer } from "@/components/payload-viewer";

type Attachment = {
  name?: string;
  url: string;
  mime?: string | null;
  sizeBytes?: number | null;
};

type Props = {
  output: unknown;
  attachments?: Attachment[];
  title?: string;
  defaultRaw?: boolean;
};

/**
 * Format file size in KB
 */
function formatFileSize(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * Check if payload is empty
 */
function isEmptyPayload(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" || trimmed === "{}" || trimmed === "null" || trimmed === "[]";
  }
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

export function ResultViewer({
  output,
  attachments = [],
  title = "Result",
  defaultRaw = false,
}: Props) {
  const hasOutput = !isEmptyPayload(output);
  const hasAttachments = attachments.length > 0;

  // If no output and no attachments, show nothing
  if (!hasOutput && !hasAttachments) {
    return (
      <Card className="overflow-hidden">
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground">
            No output payload recorded.
          </p>
        </CardContent>
      </Card>
    );
  }

  // If we only have attachments, show simplified view
  if (!hasOutput && hasAttachments) {
    return (
      <Card className="overflow-hidden">
        <CardContent className="pt-6">
          <AttachmentsList attachments={attachments} />
        </CardContent>
      </Card>
    );
  }

  // Full view with PayloadViewer + attachments
  return (
    <div className="space-y-6">
      <PayloadViewer
        data={output}
        title={title}
        description="Output from the workflow execution"
        defaultRaw={defaultRaw}
      />
      {hasAttachments && (
        <Card>
          <CardContent className="pt-6">
            <AttachmentsList attachments={attachments} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AttachmentsList({ attachments }: { attachments: Attachment[] }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <IconFileText className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Attachments</span>
        <Badge variant="secondary">{attachments.length}</Badge>
      </div>
      <div className="space-y-2">
        {attachments.map((attachment, index) => (
          <div
            key={index}
            className="flex items-center justify-between rounded-md border bg-card p-3"
          >
            <div className="flex items-center gap-3">
              <IconFileText className="size-5 text-muted-foreground" />
              <div className="flex flex-col">
                <span className="text-sm font-medium">
                  {attachment.name ?? `Attachment ${index + 1}`}
                </span>
                <span className="text-xs text-muted-foreground">
                  {attachment.sizeBytes !== null && attachment.sizeBytes !== undefined
                    ? formatFileSize(attachment.sizeBytes)
                    : "Size unknown"}
                  {attachment.mime && ` • ${attachment.mime}`}
                </span>
              </div>
            </div>
            <Button size="sm" variant="secondary" asChild>
              <a
                href={attachment.url}
                target="_blank"
                rel="noreferrer noopener"
              >
                Open
              </a>
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
