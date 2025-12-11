"use client";

import { useState, useMemo, useCallback } from "react";
import {
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconCode,
  IconCopy,
  IconExternalLink,
} from "@tabler/icons-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Props = {
  /** The JSON payload to display */
  data: unknown;
  /** Title for the card header */
  title?: string;
  /** Description for the card header */
  description?: string;
  /** Start in raw JSON mode */
  defaultRaw?: boolean;
  /** Max nesting depth to auto-expand (default: 2) */
  maxExpandDepth?: number;
  /** Number of array items to show before "Show all" (default: 5) */
  arrayPreviewCount?: number;
  /** Whether to show the card wrapper */
  showCard?: boolean;
  /** Additional class names */
  className?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

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

function isUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isArrayOfObjects(value: unknown): value is Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every((item) => typeof item === "object" && item !== null && !Array.isArray(item));
}

function getCommonKeys(objects: Record<string, unknown>[]): string[] {
  if (objects.length === 0) return [];
  const firstKeys = Object.keys(objects[0]);
  // Get keys that appear in at least half the objects
  return firstKeys.filter((key) =>
    objects.filter((obj) => key in obj).length >= objects.length / 2
  );
}

function formatLabel(key: string): string {
  // Convert camelCase or snake_case to Title Case
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

function truncateString(value: string, maxLength: number = 100): { text: string; truncated: boolean } {
  if (value.length <= maxLength) return { text: value, truncated: false };
  return { text: value.slice(0, maxLength) + "...", truncated: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Value Renderer Components
// ─────────────────────────────────────────────────────────────────────────────

function BooleanValue({ value }: { value: boolean }) {
  return (
    <Badge variant={value ? "success" : "secondary"} className="font-normal">
      {value ? "Yes" : "No"}
    </Badge>
  );
}

function StringValue({ value }: { value: string }) {
  const [expanded, setExpanded] = useState(false);
  const { text, truncated } = truncateString(value, 150);

  // Check if it's a URL
  if (isUrl(value)) {
    return (
      <a
        href={value}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex items-center gap-1 text-primary hover:underline break-all"
      >
        {truncateString(value, 50).text}
        <IconExternalLink className="size-3 shrink-0" />
      </a>
    );
  }

  // Handle long strings
  if (truncated && !expanded) {
    return (
      <span className="break-all">
        {text}
        <button
          onClick={() => setExpanded(true)}
          className="ml-1 text-primary hover:underline text-xs"
        >
          Show more
        </button>
      </span>
    );
  }

  if (expanded) {
    return (
      <span className="break-all">
        {value}
        <button
          onClick={() => setExpanded(false)}
          className="ml-1 text-primary hover:underline text-xs"
        >
          Show less
        </button>
      </span>
    );
  }

  return <span className="break-all">{value}</span>;
}

function NumberValue({ value }: { value: number }) {
  // Format numbers nicely
  const formatted = Number.isInteger(value)
    ? value.toLocaleString()
    : value.toLocaleString(undefined, { maximumFractionDigits: 4 });

  return <span className="font-mono text-sm">{formatted}</span>;
}

function ArrayTable({
  items,
  arrayPreviewCount,
}: {
  items: Record<string, unknown>[];
  arrayPreviewCount: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const keys = useMemo(() => getCommonKeys(items), [items]);
  const displayItems = showAll ? items : items.slice(0, arrayPreviewCount);
  const hasMore = items.length > arrayPreviewCount;

  if (keys.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        {items.length} item{items.length !== 1 ? "s" : ""} (complex structure)
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              {keys.slice(0, 5).map((key) => (
                <TableHead key={key} className="text-xs font-medium">
                  {formatLabel(key)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayItems.map((item, index) => (
              <TableRow key={index}>
                {keys.slice(0, 5).map((key) => (
                  <TableCell key={key} className="text-sm py-2">
                    <CellValue value={item[key]} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {hasMore && !showAll && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAll(true)}
          className="text-xs"
        >
          Show all {items.length} items
        </Button>
      )}
      {showAll && hasMore && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAll(false)}
          className="text-xs"
        >
          Show fewer
        </Button>
      )}
    </div>
  );
}

function CellValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">—</span>;
  }
  if (typeof value === "boolean") {
    return <BooleanValue value={value} />;
  }
  if (typeof value === "number") {
    return <NumberValue value={value} />;
  }
  if (typeof value === "string") {
    const { text } = truncateString(value, 50);
    if (isUrl(value)) {
      return (
        <a
          href={value}
          target="_blank"
          rel="noreferrer noopener"
          className="text-primary hover:underline"
        >
          Link
        </a>
      );
    }
    return <span>{text}</span>;
  }
  if (Array.isArray(value)) {
    return <Badge variant="secondary">{value.length} items</Badge>;
  }
  if (typeof value === "object") {
    return <Badge variant="outline">Object</Badge>;
  }
  return <span>{String(value)}</span>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Nested Object Component
// ─────────────────────────────────────────────────────────────────────────────

function NestedObject({
  data,
  depth,
  maxExpandDepth,
  arrayPreviewCount,
}: {
  data: Record<string, unknown>;
  depth: number;
  maxExpandDepth: number;
  arrayPreviewCount: number;
}) {
  const [expanded, setExpanded] = useState(depth < maxExpandDepth);
  const entries = Object.entries(data);
  const keyCount = entries.length;

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <IconChevronRight className="size-4" />
        <Badge variant="outline">{keyCount} field{keyCount !== 1 ? "s" : ""}</Badge>
      </button>
    );
  }

  return (
    <div className="space-y-1">
      <button
        onClick={() => setExpanded(false)}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <IconChevronDown className="size-4" />
        <span className="text-xs">Collapse</span>
      </button>
      <div className="pl-4 border-l-2 border-muted space-y-2">
        {entries.map(([key, value]) => (
          <ValueRow
            key={key}
            label={key}
            value={value}
            depth={depth + 1}
            maxExpandDepth={maxExpandDepth}
            arrayPreviewCount={arrayPreviewCount}
          />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Value Row Component
// ─────────────────────────────────────────────────────────────────────────────

function ValueRow({
  label,
  value,
  depth,
  maxExpandDepth,
  arrayPreviewCount,
}: {
  label: string;
  value: unknown;
  depth: number;
  maxExpandDepth: number;
  arrayPreviewCount: number;
}) {
  const renderValue = () => {
    if (value === null || value === undefined) {
      return <span className="text-muted-foreground italic">Not provided</span>;
    }

    if (typeof value === "boolean") {
      return <BooleanValue value={value} />;
    }

    if (typeof value === "number") {
      return <NumberValue value={value} />;
    }

    if (typeof value === "string") {
      return <StringValue value={value} />;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return <span className="text-muted-foreground italic">Empty list</span>;
      }

      // Check if it's an array of simple values
      const allPrimitive = value.every(
        (item) => typeof item === "string" || typeof item === "number" || typeof item === "boolean"
      );

      if (allPrimitive && value.length <= 5) {
        return (
          <div className="flex flex-wrap gap-1">
            {value.map((item, index) => (
              <Badge key={index} variant="secondary" className="font-normal">
                {String(item)}
              </Badge>
            ))}
          </div>
        );
      }

      // Array of objects -> table view
      if (isArrayOfObjects(value)) {
        return <ArrayTable items={value} arrayPreviewCount={arrayPreviewCount} />;
      }

      // Mixed array
      return (
        <div className="space-y-1">
          <Badge variant="secondary">{value.length} items</Badge>
        </div>
      );
    }

    if (typeof value === "object") {
      return (
        <NestedObject
          data={value as Record<string, unknown>}
          depth={depth}
          maxExpandDepth={maxExpandDepth}
          arrayPreviewCount={arrayPreviewCount}
        />
      );
    }

    return <span>{String(value)}</span>;
  };

  return (
    <div className="flex flex-col gap-1 py-1.5 border-b border-dashed border-muted last:border-0">
      <span className="text-sm font-medium text-muted-foreground">
        {formatLabel(label)}
      </span>
      <div className="text-sm text-foreground">{renderValue()}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatted View Component
// ─────────────────────────────────────────────────────────────────────────────

function FormattedView({
  data,
  maxExpandDepth,
  arrayPreviewCount,
}: {
  data: unknown;
  maxExpandDepth: number;
  arrayPreviewCount: number;
}) {
  // Handle primitive values at root level
  if (typeof data !== "object" || data === null) {
    if (typeof data === "string") {
      return (
        <div className="p-4 rounded-md bg-muted">
          <StringValue value={data} />
        </div>
      );
    }
    if (typeof data === "number") {
      return (
        <div className="p-4 rounded-md bg-muted">
          <NumberValue value={data} />
        </div>
      );
    }
    if (typeof data === "boolean") {
      return (
        <div className="p-4 rounded-md bg-muted">
          <BooleanValue value={data} />
        </div>
      );
    }
    return null;
  }

  // Handle arrays at root level
  if (Array.isArray(data)) {
    if (isArrayOfObjects(data)) {
      return <ArrayTable items={data} arrayPreviewCount={arrayPreviewCount} />;
    }
    return (
      <div className="space-y-2">
        {data.map((item, index) => (
          <ValueRow
            key={index}
            label={`Item ${index + 1}`}
            value={item}
            depth={0}
            maxExpandDepth={maxExpandDepth}
            arrayPreviewCount={arrayPreviewCount}
          />
        ))}
      </div>
    );
  }

  // Handle objects
  const entries = Object.entries(data as Record<string, unknown>);

  return (
    <div className="space-y-0">
      {entries.map(([key, value]) => (
        <ValueRow
          key={key}
          label={key}
          value={value}
          depth={0}
          maxExpandDepth={maxExpandDepth}
          arrayPreviewCount={arrayPreviewCount}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function PayloadViewer({
  data,
  title = "Payload",
  description,
  defaultRaw = false,
  maxExpandDepth = 2,
  arrayPreviewCount = 5,
  showCard = true,
  className,
}: Props) {
  const [showRaw, setShowRaw] = useState(defaultRaw);
  const [copied, setCopied] = useState(false);

  const isEmpty = useMemo(() => isEmptyPayload(data), [data]);

  const copyToClipboard = useCallback(async () => {
    if (!navigator?.clipboard) {
      toast.error("Clipboard API not available");
      return;
    }

    try {
      await navigator.clipboard.writeText(prettyJson(data));
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  }, [data]);

  // Hide entirely if empty
  if (isEmpty) {
    return null;
  }

  const content = (
    <>
      {showRaw ? (
        <div className="rounded-md border bg-muted">
          <pre className="max-h-96 w-full max-w-full overflow-auto p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
            {prettyJson(data)}
          </pre>
        </div>
      ) : (
        <FormattedView
          data={data}
          maxExpandDepth={maxExpandDepth}
          arrayPreviewCount={arrayPreviewCount}
        />
      )}
    </>
  );

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant={showRaw ? "secondary" : "outline"}
        onClick={() => setShowRaw(!showRaw)}
      >
        <IconCode className="mr-2 size-4" />
        {showRaw ? "Formatted" : "Raw JSON"}
      </Button>
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
  );

  if (!showCard) {
    return (
      <div className={cn("space-y-4", className)}>
        <div className="flex items-center justify-between">
          {title && <h3 className="text-sm font-medium">{title}</h3>}
          {actions}
        </div>
        {content}
      </div>
    );
  }

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="text-lg">{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          {actions}
        </div>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}

export default PayloadViewer;
