"use client";

import type React from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { IconPlus, IconTrash } from "@tabler/icons-react";

import type { JsonSchema } from "@/lib/schema/jsonschema";
import { getDeepValue, setDeepValue } from "@/lib/schema/jsonschema-zod";
import { cn } from "@/lib/utils";
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

export type WorkflowInputErrorMap = Record<string, string[]>;
type Path = Array<string | number>;
type UploadStateMap = Record<string, boolean>;
type SelectedFileMap = Record<string, string>;

const FILE_UPLOAD_ACCEPT = "application/pdf,.pdf,text/csv,.csv";
const FILE_UPLOAD_HELPER_TEXT =
  "Accepted file types: PDF or CSV (max 20MB). Files are stored for 24-hours.";

export interface WorkflowInputEditorProps {
  schema: JsonSchema | null;
  value: Record<string, unknown>;
  errors?: WorkflowInputErrorMap;
  disabled?: boolean;
  className?: string;
  onChange: (value: Record<string, unknown>) => void;
  onFieldInteract?: (pathKey: string) => void;
}

export function WorkflowInputEditor({
  schema,
  value,
  errors = {},
  disabled = false,
  className,
  onChange,
  onFieldInteract,
}: WorkflowInputEditorProps) {
  const [uploadingFields, setUploadingFields] = useState<UploadStateMap>({});
  const [selectedFiles, setSelectedFiles] = useState<SelectedFileMap>({});

  const rootSchema: JsonSchema = useMemo(() => {
    if (schema && Object.keys(schema).length > 0) {
      return schema;
    }
    return { type: "object", properties: {} };
  }, [schema]);

  const handleFieldChange = useCallback(
    (path: Path, nextValue: unknown) => {
      const next = setDeepValue(value, path, nextValue) as Record<string, unknown>;
      onFieldInteract?.(pathToKey(path));
      onChange(next);
    },
    [value, onFieldInteract, onChange],
  );

  const setFieldUploading = useCallback((key: string, uploading: boolean) => {
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
  }, []);

  const setFieldSelectedFile = useCallback((key: string, name: string | null) => {
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
  }, []);

  const handleFileUpload = useCallback(
    async (path: Path, file: File) => {
      const key = pathToKey(path);
      setFieldUploading(key, true);
      setFieldSelectedFile(key, file.name ?? "Selected file");
      try {
        const { signedUrl } = await uploadWorkflowInputFile(file);
        handleFieldChange(path, signedUrl);
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
    },
    [handleFieldChange, setFieldSelectedFile, setFieldUploading],
  );

  const handleClearFile = useCallback(
    (path: Path) => {
      const key = pathToKey(path);
      setFieldSelectedFile(key, null);
    },
    [setFieldSelectedFile],
  );

  return (
    <FieldSet
      className={cn("gap-6", className)}
      aria-describedby="workflow-input-fields"
    >
      {renderObjectFields({
        schema: rootSchema,
        path: [],
        formData: value,
        errors,
        disabled,
        onChange: handleFieldChange,
        onUploadFile: handleFileUpload,
        onClearFile: handleClearFile,
        uploadingFields,
        selectedFileNames: selectedFiles,
      })}
    </FieldSet>
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
  errors: WorkflowInputErrorMap;
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
  errors: WorkflowInputErrorMap;
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
  errors: WorkflowInputErrorMap;
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

function resolveSchemaType(schema: JsonSchema | null | undefined): string | undefined {
  if (!schema) return undefined;
  if (Array.isArray(schema.type)) {
    return schema.type[0];
  }
  return schema.type;
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
