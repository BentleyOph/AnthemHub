"use client";

import { useEffect, useMemo, useState } from "react";
import { IconAlertCircle, IconCheck, IconTransform } from "@tabler/icons-react";
import { ZodError } from "zod";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { parseJsonSchema } from "@/lib/schema/jsonschema";

type Props = {
  value: string;
  onChange: (value: string, isValid: boolean) => void;
  disabled?: boolean;
  className?: string;
};

type ValidationResult = {
  isValid: boolean;
  error: string | null;
};

function validateSchemaText(value: string): ValidationResult {
  if (!value.trim()) {
    return { isValid: false, error: "Schema JSON is required." };
  }

  try {
    const parsed = JSON.parse(value);
    parseJsonSchema(parsed);
    return { isValid: true, error: null };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { isValid: false, error: error.message };
    }

    if (error instanceof ZodError) {
      const issue = error.issues.at(0);
      if (issue) {
        const path = issue.path.length ? `${issue.path.join(".")}: ` : "";
        return { isValid: false, error: `${path}${issue.message}` };
      }
      return { isValid: false, error: "Invalid JSON Schema structure." };
    }

    return { isValid: false, error: "Invalid JSON Schema." };
  }
}

export function JsonSchemaEditor({ value, onChange, disabled, className }: Props) {
  const [localValue, setLocalValue] = useState(value);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (value !== localValue) {
      setLocalValue(value);
      const validation = validateSchemaText(value);
      setError(validation.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const status = useMemo(() => validateSchemaText(localValue), [localValue]);

  useEffect(() => {
    setError(status.error);
  }, [status.error]);

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = event.target.value;
    setLocalValue(nextValue);
    const validation = validateSchemaText(nextValue);
    setError(validation.error);
    onChange(nextValue, validation.isValid);
  };

  const handlePrettify = () => {
    try {
      const parsed = JSON.parse(localValue);
      const pretty = JSON.stringify(parsed, null, 2);
      setLocalValue(pretty);
      onChange(pretty, true);
      setError(null);
    } catch {
      const validation = validateSchemaText(localValue);
      setError(validation.error);
    }
  };

  const statusIcon = status.isValid ? (
    <IconCheck className="size-4 text-emerald-500" />
  ) : (
    <IconAlertCircle className="size-4 text-destructive" />
  );

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          {statusIcon}
          <span>{status.isValid ? "Schema valid" : "Schema invalid"}</span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handlePrettify}
          disabled={disabled}
          className="h-7 px-2 text-xs"
        >
          <IconTransform className="mr-1 size-3.5" />
          Format
        </Button>
      </div>
      <textarea
        value={localValue}
        onChange={handleChange}
        disabled={disabled}
        spellCheck={false}
        className={cn(
          "font-mono text-xs leading-5",
          "min-h-[240px] w-full rounded-md border bg-background/80 p-3 shadow-xs outline-none transition",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          error ? "border-destructive focus-visible:ring-destructive/30" : "border-input",
          disabled ? "cursor-not-allowed opacity-60" : "",
        )}
      />
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Provide a JSON Schema describing workflow inputs. Required fields must be listed under{" "}
          <code className="rounded bg-muted px-1 py-0.5">required</code>.
        </p>
      )}
    </div>
  );
}
