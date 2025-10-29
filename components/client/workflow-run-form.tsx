'use client';

import { useEffect, useMemo, useState, useTransition } from "react";
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

type Path = Array<string | number>;

interface WorkflowRunFormProps {
  workflowId: string;
  workflowName: string;
  schema: JsonSchema | null;
  disabled?: boolean;
  onSubmit?: (payload: unknown) => Promise<void> | void;
}

type ErrorMap = Record<string, string[]>;

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

export function WorkflowRunForm({
  workflowId,
  workflowName,
  schema,
  disabled = false,
  onSubmit,
}: WorkflowRunFormProps) {
  const zodSchema = useMemo(() => jsonSchemaToZod(schema), [schema]);
  const defaults = useMemo(() => jsonSchemaDefaultValues(schema), [schema]);
  const [formData, setFormData] = useState<Record<string, unknown>>(defaults);
  const [errors, setErrors] = useState<ErrorMap>({});
  const [isSubmitting, startTransition] = useTransition();

  useEffect(() => {
    setFormData(defaults);
    setErrors({});
  }, [defaults]);

  function clearErrors(key: string) {
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

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

  function updateValue(path: Path, value: unknown) {
    const key = pathToKey(path);
    clearErrorsForPrefix(key);
    setFormData((current) => setDeepValue(current, path, value) as Record<string, unknown>);
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

      if (onSubmit) {
        try {
          await onSubmit(result.data);
        } catch (error) {
          console.error("Workflow run submission failed", error);
          toast.error("Failed to submit workflow run.");
          return;
        }
      } else {
        console.info("Workflow payload ready", {
          workflowId,
          payload: result.data,
        });
        toast.success("Inputs validated. Execution endpoint coming soon.");
      }
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
        })}
      </FieldSet>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={disabled || isSubmitting}>
          {isSubmitting ? "Validating..." : "Validate inputs"}
        </Button>
        {disabled ? (
          <span className="text-muted-foreground text-sm">
            Request access to run this workflow.
          </span>
        ) : (
          <span className="text-muted-foreground text-sm">
            Validation happens locally. Executions will be wired in Phase 6.
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
}: {
  schema: JsonSchema;
  path: Path;
  formData: Record<string, unknown>;
  errors: ErrorMap;
  disabled: boolean;
  onChange: (path: Path, value: unknown) => void;
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
}: ScalarFieldProps) {
  const fieldKey = pathToKey(path);
  const type = resolveSchemaType(schema);
  const fieldErrors = errors[fieldKey];

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
              const itemPath = [...path, index];
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
