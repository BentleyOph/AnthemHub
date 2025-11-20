"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";

import type { JsonSchema } from "@/lib/schema/jsonschema";
import {
  getDeepValue,
  jsonSchemaDefaultValues,
  jsonSchemaToZod,
  setDeepValue,
} from "@/lib/schema/jsonschema-zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  uploadWorkflowInputFile,
  WorkflowInputUploadError,
} from "@/lib/storage/workflow-input-upload";

type Path = Array<string | number>;
type UploadStateMap = Record<string, boolean>;
type SelectedFileMap = Record<string, string>;

const FILE_UPLOAD_ACCEPT = "application/pdf,.pdf,text/csv,.csv";
const FILE_UPLOAD_HELPER_TEXT =
  "Accepted file types: PDF or CSV (max 20MB). Files are stored with a 24-hour signed link.";

interface WorkflowRunFormProps {
  workflowId: string;
  workflowName: string;
  schema: JsonSchema | null;
  disabled?: boolean;
  prefillInput?: unknown;
}

type ErrorMap = Record<string, string[]>;

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

function humanizeLabel(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
  if (!spaced) return "Field";
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function pathToKey(path: Path): string {
  return path.join(".");
}

function resolveSchemaType(schema: JsonSchema | null | undefined): string | undefined {
  if (!schema) return undefined;
  if (Array.isArray(schema.type)) {
    return schema.type[0];
  }
  return schema.type;
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
  const [uploadingFields, setUploadingFields] = useState<UploadStateMap>({});
  const [selectedFiles, setSelectedFiles] = useState<SelectedFileMap>({});
  const [isSubmitting, startTransition] = useTransition();

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setFormData(initialValues);
    setErrors({});
    setSelectedFiles({});
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [initialValues]);

  // A utility function to clear errors for a specific field prefix
  function clearErrorsForPrefix(prefix: string) {
    setErrors((prev) => {
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

  function updateValue(path: Path, value: unknown) {
    const key = pathToKey(path);
    clearErrorsForPrefix(key);
    setFormData((current) => setDeepValue(current, path, value) as Record<string, unknown>);
  }

  function setFieldUploading(key: string, uploading: boolean) {
    setUploadingFields((current) => {
      if (uploading) {
        if (current[key]) {
          return current;
        }
        return { ...current, [key]: true };
      }
      if (!current[key]) {
        return current;
      }
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function handleFileUpload(path: Path, file: File) {
    const key = pathToKey(path);
    setFieldUploading(key, true);
    setFieldSelectedFile(key, file.name ?? "Selected file");
    try {
      const { signedUrl } = await uploadWorkflowInputFile(file);
      updateValue(path, signedUrl);
      toast.success("File uploaded. A signed link has been added to the form.");
    } catch (error) {
      setFieldSelectedFile(key, null);
      if (error instanceof WorkflowInputUploadError) {
        toast.error(error.message);
      } else {
        console.error("Failed to upload workflow input file", error);
        toast.error("Failed to upload file. Please try again.");
      }
    } finally {
      setFieldUploading(key, false);
    }
  }

  function setFieldSelectedFile(key: string, name: string | null) {
    setSelectedFiles((current) => {
      if (!name) {
        if (!current[key]) {
          return current;
        }
        const next = { ...current };
        delete next[key];
        return next;
      }
      if (current[key] === name) {
        return current;
      }
      return { ...current, [key]: name };
    });
  }

  function handleClearSelectedFile(path: Path) {
    const key = pathToKey(path);
    setFieldSelectedFile(key, null);
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

  const rootSchema: JsonSchema = schema && Object.keys(schema).length > 0
    ? schema
    : { type: "object", properties: {} };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      <FieldSet className="gap-6" aria-describedby="workflow-run-fields">
        {renderObjectFields({
          schema: rootSchema,
          path: [],
          formData,
          errors,
          disabled,
          onChange: updateValue,
          onUploadFile: handleFileUpload,
          onClearFile: handleClearSelectedFile,
          uploadingFields,
          selectedFileNames: selectedFiles,
        })}
      </FieldSet>

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

function renderObjectFields({
  schema,
  path,
  formData,
  errors,
  disabled,
  onChange,
  onUploadFile,
  onClearFile,
  uploadingFields,
  selectedFileNames,
}: {
  schema: JsonSchema;
  path: Path;
  formData: Record<string, unknown>;
  errors: ErrorMap;
  disabled: boolean;
  onChange: (path: Path, value: unknown) => void;
  onUploadFile: (path: Path, file: File) => Promise<void>;
  onClearFile: (path: Path) => void;
  uploadingFields: UploadStateMap;
  selectedFileNames: SelectedFileMap;
}): React.ReactNode {
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);

  return Object.entries(properties).map(([key, childSchema]) => {
    const nextPath = [...path, key];
    const fieldKey = pathToKey(nextPath);
    const label = childSchema.title ?? humanizeLabel(key);
    const description = childSchema.description ?? null;
    const type = resolveSchemaType(childSchema);

    if (type === "object" || (!type && childSchema.properties)) {
      const nested = renderObjectFields({
        schema: childSchema,
        path: nextPath,
        formData,
        errors,
        disabled,
        onChange,
        onUploadFile,
        onClearFile,
        uploadingFields,
        selectedFileNames,
      });

      return (
        <FieldSet key={fieldKey} className="gap-4 rounded-lg border p-4">
          <FieldLegend>{label}</FieldLegend>
          {description ? <FieldDescription>{description}</FieldDescription> : null}
          {nested}
        </FieldSet>
      );
    }

    return (
      <ScalarField
        key={fieldKey}
        schema={childSchema}
        label={label}
        description={description}
        path={nextPath}
        required={required.has(key)}
        value={getDeepValue(formData, nextPath)}
        errors={errors}
        disabled={disabled}
        onChange={onChange}
        onUploadFile={onUploadFile}
        onClearFile={onClearFile}
        isUploading={Boolean(uploadingFields[fieldKey])}
        selectedFileName={selectedFileNames[fieldKey]}
      />
    );
  });
}

interface ScalarFieldProps {
  schema: JsonSchema;
  label: string;
  description: string | null;
  path: Path;
  required: boolean;
  value: unknown;
  errors: ErrorMap;
  disabled: boolean;
  onChange: (path: Path, value: unknown) => void;
  onUploadFile: (path: Path, file: File) => Promise<void>;
  onClearFile: (path: Path) => void;
  isUploading: boolean;
  selectedFileName?: string;
}

function ScalarField({
  schema,
  label,
  description,
  path,
  required,
  value,
  errors,
  disabled,
  onChange,
  onUploadFile,
  onClearFile,
  isUploading,
  selectedFileName,
}: ScalarFieldProps) {
  const fieldKey = pathToKey(path);
  const type = resolveSchemaType(schema);
  const fieldErrors = errors[fieldKey];
  const normalizedFormat = schema.format?.toLowerCase();

  if (
    (type === "string" || type === undefined) &&
    normalizedFormat &&
    (normalizedFormat === "uri" || normalizedFormat === "url")
  ) {
    const stringValue = typeof value === "string" ? value : "";
    return (
      <FileUploadField
        label={label}
        description={description}
        path={path}
        required={required}
        value={stringValue}
        fieldErrors={fieldErrors}
        disabled={disabled}
        onChange={onChange}
        onUploadFile={onUploadFile}
        onClearFile={onClearFile}
        isUploading={isUploading}
        selectedFileName={selectedFileName}
      />
    );
  }

  if (type === "array") {
    return (
      <ArrayField
        schema={schema}
        label={label}
        description={description}
        path={path}
        value={value}
        errors={errors}
        disabled={disabled}
        onChange={onChange}
      />
    );
  }

  if (type === "boolean") {
    const checked = Boolean(value);
    return (
      <Field data-invalid={fieldErrors ? true : undefined}>
        <div className="flex items-start gap-3">
          <Checkbox
            checked={checked}
            onCheckedChange={(next) => onChange(path, Boolean(next))}
            disabled={disabled}
            id={fieldKey}
          />
          <FieldContent>
            <FieldLabel htmlFor={fieldKey}>{label}</FieldLabel>
            {description ? <FieldDescription>{description}</FieldDescription> : null}
            {fieldErrors ? (
              <FieldError errors={fieldErrors.map((message) => ({ message }))} />
            ) : null}
          </FieldContent>
        </div>
      </Field>
    );
  }

  if (schema.enum && schema.enum.length > 0) {
    const options = schema.enum;
    const isStringEnum = options.every((option) => typeof option === "string");
    const serializedValue = isStringEnum
      ? (value as string | undefined) ?? ""
      : value !== undefined
        ? JSON.stringify(value)
        : "";

    return (
      <Field data-invalid={fieldErrors ? true : undefined}>
        <FieldLabel>{label}</FieldLabel>
        <FieldContent>
          <Select
            value={serializedValue}
            onValueChange={(nextValue) => {
              const next = isStringEnum ? nextValue : JSON.parse(nextValue);
              onChange(path, next);
            }}
            disabled={disabled}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              {options.map((option, index) => {
                const valueKey = isStringEnum ? (option as string) : JSON.stringify(option);
                return (
                  <SelectItem key={`${fieldKey}-${index}`} value={valueKey}>
                    {String(option)}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {description ? <FieldDescription>{description}</FieldDescription> : null}
          {fieldErrors ? (
            <FieldError errors={fieldErrors.map((message) => ({ message }))} />
          ) : null}
        </FieldContent>
      </Field>
    );
  }

  if (type === "number" || type === "integer") {
    const stringValue = value ?? "";
    return (
      <Field data-invalid={fieldErrors ? true : undefined}>
        <FieldLabel htmlFor={fieldKey}>
          {label}
          {!required ? <span className="text-muted-foreground ml-1 text-xs">(optional)</span> : null}
        </FieldLabel>
        <FieldContent>
          <Input
            id={fieldKey}
            type="number"
            value={String(stringValue)}
            disabled={disabled}
            onChange={(event) => onChange(path, event.target.value)}
          />
          {description ? <FieldDescription>{description}</FieldDescription> : null}
          {fieldErrors ? (
            <FieldError errors={fieldErrors.map((message) => ({ message }))} />
          ) : null}
        </FieldContent>
      </Field>
    );
  }

  // Default to string input.
  const stringValue = value ?? "";
  return (
    <Field data-invalid={fieldErrors ? true : undefined}>
      <FieldLabel htmlFor={fieldKey}>
        {label}
        {!required ? <span className="text-muted-foreground ml-1 text-xs">(optional)</span> : null}
      </FieldLabel>
      <FieldContent>
        <Input
          id={fieldKey}
          value={String(stringValue)}
          disabled={disabled}
          onChange={(event) => onChange(path, event.target.value)}
        />
        {description ? <FieldDescription>{description}</FieldDescription> : null}
        {fieldErrors ? (
          <FieldError errors={fieldErrors.map((message) => ({ message }))} />
        ) : null}
      </FieldContent>
    </Field>
  );
}

interface ArrayFieldProps {
  schema: JsonSchema;
  label: string;
  description: string | null;
  path: Path;
  value: unknown;
  errors: ErrorMap;
  disabled: boolean;
  onChange: (path: Path, value: unknown) => void;
}

function ArrayField({
  schema,
  label,
  description,
  path,
  value,
  errors,
  disabled,
  onChange,
}: ArrayFieldProps) {
  const fieldKey = pathToKey(path);
  const itemSchema = Array.isArray(schema.items) ? schema.items[0] : schema.items;
  const itemType = resolveSchemaType(itemSchema);
  const items = Array.isArray(value) ? (value as unknown[]) : [];

  function updateItem(index: number, nextValue: unknown) {
    const next = [...items];
    next[index] = nextValue;
    onChange(path, next);
  }

  function addItem() {
    const placeholder = itemType === "number" || itemType === "integer" ? "" : "";
    onChange(path, [...items, placeholder]);
  }

  function removeItem(index: number) {
    const next = items.filter((_, itemIndex) => itemIndex !== index);
    onChange(path, next);
  }

  return (
    <Field data-invalid={errors[fieldKey] ? true : undefined} className="flex-col gap-3">
      <FieldLabel>{label}</FieldLabel>
      <FieldContent className="gap-3">
        {description ? <FieldDescription>{description}</FieldDescription> : null}
        <div className="flex flex-col gap-2">
          {items.length === 0 ? (
            <p className="text-muted-foreground text-sm">No values yet.</p>
          ) : (
            items.map((item, index) => {
              const itemKey = `${fieldKey}.${index}`;
              const itemErrors = errors[itemKey];
              const isNumber = itemType === "number" || itemType === "integer";

              return (
                <div
                  key={itemKey}
                  className="flex items-center gap-2"
                >
                  <Input
                    value={String(item ?? "")}
                    type={isNumber ? "number" : "text"}
                    disabled={disabled}
                    onChange={(event) => updateItem(index, event.target.value)}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={disabled}
                    onClick={() => removeItem(index)}
                    aria-label="Remove item"
                  >
                    <IconTrash className="size-4" />
                  </Button>
                  {itemErrors ? (
                    <FieldError
                      errors={itemErrors.map((message) => ({ message }))}
                      className="ml-2"
                    />
                  ) : null}
                </div>
              );
            })
          )}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={addItem}
          className="w-fit"
        >
          <IconPlus className="mr-2 size-4" /> Add value
        </Button>
        {errors[fieldKey] ? (
          <FieldError errors={errors[fieldKey]!.map((message) => ({ message }))} />
        ) : null}
      </FieldContent>
    </Field>
  );
}

interface FileUploadFieldProps {
  label: string;
  description: string | null;
  path: Path;
  required: boolean;
  value: string;
  fieldErrors?: string[];
  disabled: boolean;
  onChange: (path: Path, value: unknown) => void;
  onUploadFile: (path: Path, file: File) => Promise<void>;
  onClearFile: (path: Path) => void;
  isUploading: boolean;
  selectedFileName?: string;
}

function FileUploadField({
  label,
  description,
  path,
  required,
  value,
  fieldErrors,
  disabled,
  onChange,
  onUploadFile,
  onClearFile,
  isUploading,
  selectedFileName,
}: FileUploadFieldProps) {
  const fieldKey = pathToKey(path);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const displayName = selectedFileName ?? (value ? "Existing document" : "No file chosen");

  function handleClear() {
    onChange(path, "");
    onClearFile(path);
    toast.success("File reference removed.");
  }

  function handleOpenPicker() {
    inputRef.current?.click();
  }

  async function handleSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) {
      return;
    }
    await onUploadFile(path, file);
  }

  return (
    <Field data-invalid={fieldErrors ? true : undefined}>
      <FieldLabel htmlFor={`${fieldKey}-file`}>
        {label}
        {!required ? <span className="text-muted-foreground ml-1 text-xs">(optional)</span> : null}
      </FieldLabel>
      <FieldContent className="gap-3">
        <input
          ref={inputRef}
          id={`${fieldKey}-file`}
          type="file"
          accept={FILE_UPLOAD_ACCEPT}
          disabled={disabled || isUploading}
          onChange={(event) => {
            void handleSelect(event);
          }}
          className="sr-only"
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex flex-1 flex-wrap items-center gap-3 rounded-md border bg-background px-3 py-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleOpenPicker}
              disabled={disabled || isUploading}
            >
              Choose file
            </Button>
            <span className="text-sm text-muted-foreground truncate">
              {isUploading ? "Uploading…" : displayName}
            </span>
          </div>
          {value ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="sm:ml-auto"
              onClick={handleClear}
              disabled={disabled || isUploading}
            >
              Remove file
            </Button>
          ) : null}
        </div>
        {value ? (
          <p className="break-all text-xs text-muted-foreground">
            Current file link:{" "}
            <a
              href={value}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-foreground underline"
            >
              Open document
            </a>
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Select a file to upload.</p>
        )}
        {description ? <FieldDescription>{description}</FieldDescription> : null}
        <FieldDescription>{FILE_UPLOAD_HELPER_TEXT}</FieldDescription>
        {fieldErrors ? (
          <FieldError errors={fieldErrors.map((message) => ({ message }))} />
        ) : null}
      </FieldContent>
    </Field>
  );
}
