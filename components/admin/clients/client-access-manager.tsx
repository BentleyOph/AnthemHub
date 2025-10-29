"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconCheck, IconCircleX } from "@tabler/icons-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type WorkflowOption = {
  id: string;
  name: string;
};

type AssignedWorkflow = {
  id: string;
  name: string;
  isPublished: boolean;
  assignedAt: string;
};

type Props = {
  clientId: string;
  workflows: WorkflowOption[];
  initialSelection: string[];
  assignedWorkflows: AssignedWorkflow[];
};

function formatAssignedDate(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function ClientAccessManager({
  clientId,
  workflows,
  initialSelection,
  assignedWorkflows,
}: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelection));
  const [isSaving, startTransition] = useTransition();

  const hasChanges = useMemo(() => {
    if (selected.size !== initialSelection.length) return true;
    for (const id of initialSelection) {
      if (!selected.has(id)) return true;
    }
    return false;
  }, [initialSelection, selected]);

  const toggleWorkflow = (workflowId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(workflowId)) {
        next.delete(workflowId);
      } else {
        next.add(workflowId);
      }
      return next;
    });
  };

  const handleSave = () => {
    startTransition(async () => {
      try {
        const response = await fetch(`/api/clients/${clientId}/access`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workflowIds: Array.from(selected) }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          const message = (data as { error?: string }).error ?? "Failed to update access.";
          toast.error(message);
          return;
        }

        toast.success("Access saved.");
        router.refresh();
      } catch (error) {
        console.error("Failed to update client access", error);
        toast.error("Unexpected error updating access.");
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-base font-medium">Workflow access</Label>
        <p className="text-sm text-muted-foreground">
          Assign published workflows available to this client. Saving replaces the entire set atomically.
        </p>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {workflows.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No published workflows available yet. Publish a workflow to enable assignment.
          </div>
        ) : (
          workflows.map((workflow) => (
            <button
              key={workflow.id}
              type="button"
              onClick={() => toggleWorkflow(workflow.id)}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition hover:border-primary hover:bg-primary/5",
                selected.has(workflow.id) ? "border-primary bg-primary/5" : "",
              )}
              disabled={isSaving}
            >
              <Checkbox
                checked={selected.has(workflow.id)}
                onCheckedChange={() => toggleWorkflow(workflow.id)}
                id={`workflow-${workflow.id}`}
                className="mt-1"
                disabled={isSaving}
              />
              <div>
                <div className="font-medium">{workflow.name}</div>
                <div className="text-xs text-muted-foreground">Workflow ID: {workflow.id}</div>
              </div>
            </button>
          ))
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {assignedWorkflows.length === 0 ? (
          <span className="text-sm text-muted-foreground">No workflows assigned yet.</span>
        ) : (
          assignedWorkflows.map((assignment) => (
            <span
              key={assignment.id}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs",
                assignment.isPublished ? "border-primary/50 bg-primary/10 text-primary" : "border-muted-foreground/40",
              )}
            >
              {assignment.isPublished ? (
                <IconCheck className="size-3" />
              ) : (
                <IconCircleX className="size-3" />
              )}
              {assignment.name}
              <span className="text-muted-foreground">
                assigned {formatAssignedDate(assignment.assignedAt)}
              </span>
            </span>
          ))
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={() => setSelected(new Set(initialSelection))} disabled={isSaving || !hasChanges}>
          Reset
        </Button>
        <Button onClick={handleSave} disabled={isSaving || !hasChanges}>
          {isSaving ? "Saving…" : "Save access"}
        </Button>
      </div>
    </div>
  );
}
