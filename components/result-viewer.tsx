"use client";

import { useState } from "react";
import { IconCheck, IconCode, IconCopy, IconFileText } from "@tabler/icons-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
 * Extract a safe string representation from output payload.
 * Prioritizes common text fields.
 */
function extractSafeString(output: unknown): string | null {
  if (typeof output === "string") {
    return output;
  }

  if (output && typeof output === "object") {
    const obj = output as Record<string, unknown>;
    
    // Check common text field names
    const textFields = ["text", "content", "message", "result"];
    for (const field of textFields) {
      if (typeof obj[field] === "string") {
        return obj[field] as string;
      }
    }
  }

  return null;
}

/**
 * Format file size in KB
 */
function formatFileSize(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * Pretty-print JSON with indentation
 */
function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    console.error("Failed to stringify JSON", error);
    return String(value);
  }
}

export function ResultViewer({
  output,
  attachments = [],
  title = "Result",
  defaultRaw = false,
}: Props) {
  const [showRaw, setShowRaw] = useState(defaultRaw);
  const [copied, setCopied] = useState(false);

  const safeString = extractSafeString(output);

  // Determine what to display
  const hasTextContent = !showRaw && safeString !== null;
  const displayText = hasTextContent ? safeString : prettyJson(output);

  const copyToClipboard = async () => {
    if (!navigator?.clipboard) {
      toast.error("Clipboard API not available");
      return;
    }

    try {
      await navigator.clipboard.writeText(displayText);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy to clipboard", error);
      toast.error("Failed to copy to clipboard");
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription>
              {hasTextContent
                ? "Formatted output content"
                : "Raw JSON payload"}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {safeString !== null && (
              <Button
                size="sm"
                variant={showRaw ? "outline" : "secondary"}
                onClick={() => setShowRaw(!showRaw)}
              >
                <IconCode className="mr-2 size-4" />
                {showRaw ? "Formatted" : "Raw JSON"}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={copyToClipboard}>
              {copied ? (
                <>
                  <IconCheck className="mr-2 size-4" />
                  Copied
                </>
              ) : (
                <>
                  <IconCopy className="mr-2 size-4" />
                  Copy
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Output content display */}
        {output ? (
          <div className="rounded-md border bg-muted">
            <pre
              className={`max-h-96 overflow-auto p-4 text-sm leading-relaxed ${
                hasTextContent ? "whitespace-pre-wrap" : "font-mono text-xs"
              }`}
            >
              {displayText}
            </pre>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No output payload recorded.
          </p>
        )}

        {/* Attachments list */}
        {attachments.length > 0 && (
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
        )}
      </CardContent>
    </Card>
  );
}
