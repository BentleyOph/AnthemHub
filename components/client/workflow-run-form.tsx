"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { JsonSchema } from "@/lib/schema/jsonschema";
import {
  jsonSchemaDefaultValues,
  jsonSchemaToZod,
} from "@/lib/schema/jsonschema-zod";
import { WorkflowInputEditor, type WorkflowInputErrorMap } from "@/components/workflows/workflow-input-editor";
import { Button } from "@/components/ui/button";

interface WorkflowRunFormProps {
  workflowId: string;
  workflowName: string;
  schema: JsonSchema | null;
  disabled?: boolean;
  prefillInput?: unknown;
}

type ErrorMap = WorkflowInputErrorMap;

function extractFieldErrors(details: unknown): ErrorMap {
  if (!details || typeof details !== "object") {
    return {};
  }

  const fieldErrors =
    (details as { fieldErrors?: Record<string, string[] | undefined> }).fieldErrors;

  if (!fieldErrors) {
    return {};
  }

  const mapped: ErrorMap = {};

  for (const [key, messages] of Object.entries(fieldErrors)) {
    if (!messages || messages.length === 0) continue;
    const validMessages = messages.filter(
      (message): message is string => typeof message === "string" && message.length > 0,
    );
    if (validMessages.length === 0) continue;
    mapped[key || ""] = validMessages;
  }

  return mapped;
}

function resolveErrorMessage(
  responseBody: unknown,
  fallback: string,
): string {
  if (
    responseBody &&
    typeof responseBody === "object" &&
    typeof (responseBody as { error?: unknown }).error === "string" &&
    (responseBody as { error?: unknown }).error
  ) {
    return (responseBody as { error: string }).error;
  }

  return fallback;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item));
  }
  if (isPlainObject(value)) {
    const cloned: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      cloned[key] = cloneValue(child);
    }
    return cloned;
  }
  return value;
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    result[key] = cloneValue(child);
  }
  return result;
}

function mergeRecords(
  base: Record<string, unknown>,
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  const keys = new Set([...Object.keys(base), ...Object.keys(overrides)]);
  const result: Record<string, unknown> = {};

  for (const key of keys) {
    const baseValue = base[key];
    const overrideValue = overrides[key];

    if (overrideValue === undefined) {
      result[key] = cloneValue(baseValue);
      continue;
    }

    if (isPlainObject(baseValue) && isPlainObject(overrideValue)) {
      result[key] = mergeRecords(baseValue, overrideValue);
      continue;
    }

    if (Array.isArray(overrideValue)) {
      result[key] = overrideValue.map((item) => cloneValue(item));
      continue;
    }

    result[key] = cloneValue(overrideValue);
  }

  return result;
}

function mergeFormValues(
  defaults: Record<string, unknown>,
  prefillInput: unknown,
): Record<string, unknown> {
  if (isPlainObject(prefillInput)) {
    return mergeRecords(defaults, prefillInput);
  }
  return cloneRecord(defaults);
}

export function WorkflowRunForm({
  workflowId,
  workflowName,
  schema,
  disabled = false,
  prefillInput,
}: WorkflowRunFormProps) {
  const router = useRouter();
  const zodSchema = useMemo(() => jsonSchemaToZod(schema), [schema]);
  const defaults = useMemo(() => jsonSchemaDefaultValues(schema), [schema]);
  const initialValues = useMemo(
    () => mergeFormValues(defaults, prefillInput),
    [defaults, prefillInput],
  );
  const [formData, setFormData] = useState<Record<string, unknown>>(() => initialValues);
  const [errors, setErrors] = useState<ErrorMap>({});
  const [isSubmitting, startTransition] = useTransition();

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setFormData(initialValues);
    setErrors({});
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [initialValues]);

  // A utility function to clear errors for a specific field prefix
  function clearErrorsForPrefix(prefix: string) {
    setErrors((prev) => {
      if (!prev || Object.keys(prev).length === 0) {
        return prev;
      }

      if (!prefix) {
        if (!prev[""]) {
          return prev;
        }
        const next = { ...prev };
        delete next[""];
        return next;
      }

      const entries = Object.entries(prev);
      let mutated = false;
      const next: ErrorMap = {};
      for (const [key, value] of entries) {
        if (key === prefix || key.startsWith(`${prefix}.`)) {
          mutated = true;
          continue;
        }
        next[key] = value;
      }
      return mutated ? next : prev;
    });
  }

  function applyServerErrors(details: unknown) {
    const mapped = extractFieldErrors(details);
    if (Object.keys(mapped).length === 0) {
      return;
    }
    setErrors(mapped);
  }

  async function submitExecution(validPayload: unknown) {
    try {
      const response = await fetch("/api/executions/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workflowId,
          input: validPayload,
        }),
      });

      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }

      if (response.ok) {
        const executionId =
          body && typeof body === "object" && typeof (body as { executionId?: unknown }).executionId === "string"
            ? (body as { executionId: string }).executionId
            : null;

        toast.success(`Started "${workflowName}". Redirecting to progress...`);
        if (executionId) {
          router.push(`/executions/${executionId}`);
        } else {
          router.push("/executions");
        }
        return;
      }

      if (response.status === 422) {
        const details = body && typeof body === "object" ? (body as { details?: unknown }).details : undefined;
        applyServerErrors(details);
        toast.error("Please fix the highlighted fields.");
        return;
      }

      if (response.status === 429) {
        toast.error(
          resolveErrorMessage(
            body,
            "You have reached the limit for starting this workflow. Please try again soon.",
          ),
        );
        return;
      }

      if (response.status === 401) {
        toast.error("Your session has expired. Please sign in again.");
        return;
      }

      if (response.status === 403) {
        toast.error(
          resolveErrorMessage(body, "You do not have permission to run this workflow."),
        );
        return;
      }

      toast.error(resolveErrorMessage(body, "Failed to start workflow execution."));
    } catch (error) {
      console.error("Workflow run submission failed", error);
      toast.error("Unexpected error starting workflow.");
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = zodSchema.safeParse(formData);

      if (!result.success) {
        const fieldErrors: ErrorMap = {};
        for (const issue of result.error.issues) {
          const key = issue.path.join(".");
          if (!fieldErrors[key]) {
            fieldErrors[key] = [];
          }
          fieldErrors[key]!.push(issue.message);
        }
        setErrors(fieldErrors);
        toast.error("Please fix the highlighted fields.");
        return;
      }

      setErrors({});
      await submitExecution(result.data);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      <WorkflowInputEditor
        schema={schema}
        value={formData}
        errors={errors}
        disabled={disabled}
        onChange={(next) => {
          setFormData(next);
        }}
        onFieldInteract={clearErrorsForPrefix}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={disabled || isSubmitting}>
          {isSubmitting ? "Starting..." : "Start Generation"}
        </Button>
        {disabled ? (
          <span className="text-muted-foreground text-sm">
            Request access to run this workflow.
          </span>
        ) : (
          <span className="text-muted-foreground text-sm">
            You will be redirected once the run starts.
          </span>
        )}
      </div>
    </form>
  );
}
