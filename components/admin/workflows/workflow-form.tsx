"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconArrowLeft, IconLoader, IconPhoto, IconTrash, IconUpload } from "@tabler/icons-react";
import { toast } from "sonner";

import { JsonSchemaEditor } from "@/components/admin/workflows/json-schema-editor";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { WorkflowDetail } from "@/lib/admin/workflows/data";
import { parseJsonSchema } from "@/lib/schema/jsonschema";

type WorkflowFormMode = "create" | "edit";

type Props = {
  mode: WorkflowFormMode;
  workflow?: WorkflowDetail;
  showHeader?: boolean;
};

type FormState = {
  name: string;
  publicDesc: string;
  internalNotes: string;
  n8nWebhookUrl: string;
  isPublished: boolean;
  estimatedMinutesSaved: string;
  inputSchemaText: string;
  inputSchemaValid: boolean;
  iconFile: File | null;
  removeIcon: boolean;
};

const DEFAULT_SCHEMA = JSON.stringify(
  {
    title: "Workflow Inputs",
    type: "object",
    properties: {},
    required: [],
  },
  null,
  2,
);

function isSchemaValid(schemaText: string): boolean {
  if (!schemaText.trim()) return false;
  try {
    const parsed = JSON.parse(schemaText);
    parseJsonSchema(parsed);
    return true;
  } catch {
    return false;
  }
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function WorkflowForm({ mode, workflow, showHeader = true }: Props) {
  const router = useRouter();
  const [isSubmitting, startTransition] = useTransition();
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const initialIconUrl = workflow?.iconUrl ?? null;
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [formState, setFormState] = useState<FormState>(() => {
    const schemaText =
      workflow?.inputSchema ? JSON.stringify(workflow.inputSchema, null, 2) : DEFAULT_SCHEMA;
    return {
      name: workflow?.name ?? "",
      publicDesc: workflow?.description ?? "",
      internalNotes: workflow?.internalNotes ?? "",
      n8nWebhookUrl: workflow?.n8nWebhookUrl ?? "",
      isPublished: workflow?.isPublished ?? false,
      estimatedMinutesSaved:
        workflow?.estimatedMinutesSaved !== null && workflow?.estimatedMinutesSaved !== undefined
          ? String(workflow.estimatedMinutesSaved)
          : "",
      inputSchemaText: schemaText,
      inputSchemaValid: isSchemaValid(schemaText),
      iconFile: null,
      removeIcon: false,
    };
  });

  const previewUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return formState.removeIcon ? null : initialIconUrl;
    }

    if (formState.iconFile) {
      return URL.createObjectURL(formState.iconFile);
    }
    if (formState.removeIcon) {
      return null;
    }
    return initialIconUrl;
  }, [formState.iconFile, formState.removeIcon, initialIconUrl]);

  useEffect(() => {
    if (!formState.iconFile || !previewUrl) {
      return;
    }

    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [formState.iconFile, previewUrl]);

  const pageTitle = mode === "create" ? "Create workflow" : "Edit workflow";
  const submitLabel = mode === "create" ? "Create workflow" : "Save changes";

  const handleSchemaChange = (value: string, isValid: boolean) => {
    setFormState((prev) => ({
      ...prev,
      inputSchemaText: value,
      inputSchemaValid: isValid,
    }));
  };

  const handleIconChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file for the icon.");
      return;
    }

    setFormState((prev) => ({
      ...prev,
      iconFile: file,
      removeIcon: false,
    }));
  };

  const handleRemoveIcon = () => {
    setFormState((prev) => ({
      ...prev,
      iconFile: null,
      removeIcon: true,
    }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmissionError(null);

    if (!formState.inputSchemaValid) {
      toast.error("Please fix JSON Schema errors before saving.");
      return;
    }

    const formData = new FormData();
    formData.set("name", formState.name.trim());
    formData.set("publicDesc", formState.publicDesc.trim());
    formData.set("internalNotes", formState.internalNotes.trim());
    formData.set("n8nWebhookUrl", formState.n8nWebhookUrl.trim());
    formData.set("estimatedMinutesSaved", formState.estimatedMinutesSaved.trim());
    formData.set("inputSchema", formState.inputSchemaText);
    formData.set("isPublished", String(formState.isPublished));
    if (formState.iconFile) {
      formData.set("icon", formState.iconFile);
    }
    if (mode === "edit" && formState.removeIcon && !formState.iconFile) {
      formData.set("removeIcon", "true");
    }

    const endpoint =
      mode === "create"
        ? "/api/workflows"
        : `/api/workflows/${workflow?.id}`;
    const method = mode === "create" ? "POST" : "PATCH";

    startTransition(async () => {
      try {
        const response = await fetch(endpoint, {
          method,
          body: formData,
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          const message = (data as { error?: string }).error ?? "Failed to save workflow.";
          setSubmissionError(message);
          toast.error(message);
          return;
        }

        const data = (await response.json()) as WorkflowDetail;
        toast.success(mode === "create" ? "Workflow created." : "Workflow updated.");
        if (mode === "create") {
          router.push(`/admin/workflows/${data.id}`);
        } else {
          router.refresh();
        }
      } catch (error) {
        console.error("Failed to submit workflow form", error);
        setSubmissionError("Unexpected error saving workflow.");
        toast.error("Unexpected error saving workflow.");
      }
    });
  };

  const handleDelete = () => {
    if (!workflow) return;
    const confirmed = window.confirm(
      "Delete this workflow? Existing execution history and assignments will remain, but the workflow can no longer be used.",
    );
    if (!confirmed) return;

    startTransition(async () => {
      try {
        const response = await fetch(`/api/workflows/${workflow.id}`, { method: "DELETE" });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          const message = (data as { error?: string }).error ?? "Failed to delete workflow.";
          toast.error(message);
          return;
        }

        toast.success("Workflow deleted.");
        router.push("/admin/workflows");
        router.refresh();
      } catch (error) {
        console.error("Failed to delete workflow", error);
        toast.error("Unexpected error deleting workflow.");
      }
    });
  };

  const isDirty = useMemo(() => {
    if (!workflow) {
      return (
        formState.name !== "" ||
        formState.publicDesc !== "" ||
        formState.internalNotes !== "" ||
        formState.n8nWebhookUrl !== "" ||
        formState.estimatedMinutesSaved !== "" ||
        formState.isPublished ||
        formState.inputSchemaText !== DEFAULT_SCHEMA ||
        formState.iconFile !== null
      );
    }

    return (
      formState.name !== workflow.name ||
      formState.publicDesc !== workflow.description ||
      formState.internalNotes !== (workflow.internalNotes ?? "") ||
      formState.n8nWebhookUrl !== workflow.n8nWebhookUrl ||
      formState.estimatedMinutesSaved !==
        (workflow.estimatedMinutesSaved !== null && workflow.estimatedMinutesSaved !== undefined
          ? String(workflow.estimatedMinutesSaved)
          : "") ||
      formState.isPublished !== workflow.isPublished ||
      formState.removeIcon ||
      !!formState.iconFile ||
      formState.inputSchemaText !== JSON.stringify(workflow.inputSchema, null, 2)
    );
  }, [formState, workflow]);

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {showHeader ? (
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <IconArrowLeft className="size-4" />
              <Link href="/admin/workflows" className="hover:underline">
                Back to workflows
              </Link>
            </div>
            <h1 className="mt-2 text-2xl font-semibold">{pageTitle}</h1>
            <p className="text-sm text-muted-foreground">
              Workflows define metadata, input schema, and publication state for clients.
            </p>
          </div>
          {mode === "edit" && workflow ? (
            <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
              <span>Created {formatDate(workflow.createdAt)}</span>
              <span>Updated {formatDate(workflow.updatedAt)}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Field>
            <FieldLabel htmlFor="workflow-name">Name</FieldLabel>
            <FieldContent>
              <Input
                id="workflow-name"
                value={formState.name}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="Lead Enrichment"
                required
                disabled={isSubmitting}
              />
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel htmlFor="workflow-public-desc">Public description</FieldLabel>
            <FieldContent>
              <textarea
                id="workflow-public-desc"
                value={formState.publicDesc}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, publicDesc: event.target.value }))
                }
                placeholder="Concise description shown to clients."
                className="min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                disabled={isSubmitting}
              />
              <FieldDescription>
                Displayed on client catalog cards and detail pages.
              </FieldDescription>
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel htmlFor="workflow-internal-notes">Internal notes</FieldLabel>
            <FieldContent>
              <textarea
                id="workflow-internal-notes"
                value={formState.internalNotes}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, internalNotes: event.target.value }))
                }
                placeholder="Operational guidance for internal teams."
                className="min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                disabled={isSubmitting}
              />
              <FieldDescription>
                Visible to admins only. Include playbooks or fulfillment notes.
              </FieldDescription>
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel htmlFor="workflow-estimated-minutes">
              Estimated minutes saved per run
            </FieldLabel>
            <FieldContent>
              <Input
                id="workflow-estimated-minutes"
                type="number"
                min={0}
                max={1440}
                step={1}
                inputMode="numeric"
                value={formState.estimatedMinutesSaved}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    estimatedMinutesSaved: event.target.value,
                  }))
                }
                placeholder="45"
                disabled={isSubmitting}
              />
              <FieldDescription>
                Used to calculate the client time-saved metric for this workflow. Leave blank if
                unknown.
              </FieldDescription>
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel htmlFor="workflow-webhook">n8n webhook URL</FieldLabel>
            <FieldContent>
              <Input
                id="workflow-webhook"
                type="url"
                inputMode="url"
                value={formState.n8nWebhookUrl}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, n8nWebhookUrl: event.target.value }))
                }
                placeholder="https://n8n.example.com/webhook/123"
                required
                disabled={isSubmitting}
              />
              <FieldDescription>
                Destination invoked by workers for execution. Ensure the URL is secured with HMAC.
              </FieldDescription>
            </FieldContent>
          </Field>

          <div className="space-y-3">
            <Label className="font-medium">Input schema</Label>
            <JsonSchemaEditor
              value={formState.inputSchemaText}
              onChange={handleSchemaChange}
              disabled={isSubmitting}
            />
          </div>

          {submissionError ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {submissionError}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={isSubmitting || !formState.inputSchemaValid}>
              {isSubmitting ? (
                <>
                  <IconLoader className="mr-2 size-4 animate-spin" />
                  Saving…
                </>
              ) : (
                submitLabel
              )}
            </Button>
            {mode === "edit" && workflow ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => router.refresh()}
                disabled={isSubmitting || !isDirty}
              >
                Reset
              </Button>
            ) : null}
          </div>
        </div>

        <div className="space-y-6">
          <div className="space-y-3 rounded-lg border p-4">
            <Label className="font-medium">Icon</Label>
            <div className="flex items-center gap-4">
              <div className="flex size-20 items-center justify-center overflow-hidden rounded-md border bg-muted/40">
                {previewUrl ? (
                  <Image
                    src={previewUrl}
                    alt="Workflow icon preview"
                    width={80}
                    height={80}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <IconPhoto className="size-8 text-muted-foreground" />
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSubmitting}
                >
                  <IconUpload className="mr-2 size-4" />
                  Upload
                </Button>
                {(previewUrl || formState.iconFile || initialIconUrl) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="justify-start text-destructive hover:text-destructive"
                    onClick={handleRemoveIcon}
                    disabled={isSubmitting}
                  >
                    <IconTrash className="mr-2 size-4" />
                    Remove
                  </Button>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleIconChange}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Recommended size 256×256. Icons are stored in Supabase Storage and served via signed URLs.
            </p>
          </div>

          <div className="space-y-3 rounded-lg border p-4">
            <Label className="font-medium">Publication</Label>
            <div className="flex items-start gap-3">
              <Checkbox
                id="workflow-published"
                checked={formState.isPublished}
                onCheckedChange={(checked) =>
                  setFormState((prev) => ({
                    ...prev,
                    isPublished: Boolean(checked),
                  }))
                }
                disabled={isSubmitting}
              />
              <div className="space-y-1 text-sm">
                <Label htmlFor="workflow-published">Published</Label>
                <p className="text-xs text-muted-foreground">
                  Published workflows appear in the client catalog and can be requested for access.
                </p>
              </div>
            </div>
          </div>

          {mode === "edit" && workflow ? (
            <div className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
              <Label className="font-medium text-destructive">Danger zone</Label>
              <p className="text-xs text-muted-foreground">
                Deleting a workflow keeps historical executions but removes it from listings and future access.
              </p>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={isSubmitting}
              >
                <IconTrash className="mr-2 size-4" />
                Delete workflow
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </form>
  );
}
