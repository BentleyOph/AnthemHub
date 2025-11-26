import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArrowLeft } from "@tabler/icons-react";

import { WorkflowForm } from "@/components/admin/workflows/workflow-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WorkflowSchedulingPanel } from "@/components/admin/workflows/workflow-scheduling-panel";
import { getWorkflowDetail } from "@/lib/admin/workflows/data";
import {
  listWorkflowClientOptions,
  listWorkflowPresetsForWorkflow,
} from "@/lib/admin/workflows/presets";

type RouteParams = {
  params: Promise<{ id: string }> | { id: string };
};

const TIMEZONE = process.env.APP_TIMEZONE ?? "Africa/Nairobi";

function isPromiseLike<T>(value: Promise<T> | T): value is Promise<T> {
  return typeof value === "object" && value !== null && "then" in value;
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  timeZone: TIMEZONE,
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value: string) {
  try {
    return dateFormatter.format(new Date(value));
  } catch {
    return value;
  }
}

export default async function WorkflowDetailPage({ params }: RouteParams) {
  const resolvedParams = isPromiseLike(params) ? await params : params;
  const workflowId = resolvedParams.id;

  if (!workflowId) {
    notFound();
  }

  const workflow = await getWorkflowDetail(workflowId);

  if (!workflow) {
    notFound();
  }

  const [presets, clientOptions] = await Promise.all([
    listWorkflowPresetsForWorkflow(workflowId),
    listWorkflowClientOptions(workflowId),
  ]);

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <Button variant="ghost" className="w-fit gap-2 px-0" asChild>
          <Link href="/admin/workflows">
            <IconArrowLeft className="size-4" />
            Back to workflows
          </Link>
        </Button>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
            <div className="flex size-20 items-center justify-center overflow-hidden rounded-md border bg-muted/40">
              {workflow.iconUrl ? (
                <Image
                  src={workflow.iconUrl}
                  alt={`${workflow.name} icon`}
                  width={80}
                  height={80}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-xs text-muted-foreground">No icon</span>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-semibold">{workflow.name}</h1>
                <Badge variant={workflow.isPublished ? "default" : "secondary"}>
                  {workflow.isPublished ? "Published" : "Draft"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground max-w-2xl">{workflow.description}</p>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            <div>Created {formatDate(workflow.createdAt)}</div>
            <div>Updated {formatDate(workflow.updatedAt)}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Workflow metadata</CardTitle>
            <CardDescription>Operational details visible to admins only.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <div className="text-muted-foreground mb-1 font-medium">n8n webhook URL</div>
              {workflow.n8nWebhookUrl ? (
                <a
                  href={workflow.n8nWebhookUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all text-primary hover:underline"
                >
                  {workflow.n8nWebhookUrl}
                </a>
              ) : (
                <span className="text-muted-foreground">Not set</span>
              )}
            </div>
            <div>
              <div className="text-muted-foreground mb-1 font-medium">Internal notes</div>
              {workflow.internalNotes ? (
                <p className="whitespace-pre-wrap text-sm">{workflow.internalNotes}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No internal notes recorded.</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Schema overview</CardTitle>
            <CardDescription>Quick info about the configured input schema.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Type</span>
              <span>
                {typeof workflow.inputSchema.type === "string"
                  ? workflow.inputSchema.type
                  : Array.isArray(workflow.inputSchema.type)
                    ? workflow.inputSchema.type.join(", ")
                    : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Fields</span>
              <span>
                {workflow.inputSchema.properties
                  ? Object.keys(workflow.inputSchema.properties).length
                  : 0}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Required</span>
              <span>{workflow.inputSchema.required?.length ?? 0}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Presets & schedules</CardTitle>
          <CardDescription>
            Define reusable inputs and timers for this workflow per client.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WorkflowSchedulingPanel
            workflowId={workflowId}
            presets={presets}
            clientOptions={clientOptions}
            timeZone={TIMEZONE}
            inputSchema={workflow.inputSchema}
          />
        </CardContent>
      </Card>

      <WorkflowForm mode="edit" workflow={workflow} showHeader={false} />
    </div>
  );
}
