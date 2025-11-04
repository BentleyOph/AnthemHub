import { z, type ZodType } from "zod";

import type { JsonSchema } from "@/lib/schema/jsonschema";

type PathSegment = string | number;

function resolveType(schema: JsonSchema): string | undefined {
  const { type } = schema;
  if (!type) return undefined;
  if (Array.isArray(type)) {
    return type[0];
  }
  return type;
}

function buildEnumSchema(values: unknown[]): ZodType {
  if (values.length === 0) {
    return z.any();
  }

  if (values.every((value) => typeof value === "string")) {
    const unique = Array.from(new Set(values as string[]));
    if (unique.length === 1) {
      return z.literal(unique[0]!);
    }
    if (unique.length > 1) {
      return z.enum(unique as [string, ...string[]]);
    }
  }

  const literals = values.map((value) => z.literal(value as never));
  if (literals.length === 0) {
    // Should be unreachable due to earlier guard, but keeps types happy
    return z.never();
  }
  if (literals.length === 1) {
    return literals[0];
  }
  if (literals.length >= 2) {
    return z.union(literals as unknown as [ZodTypeAny, ZodTypeAny, ...ZodTypeAny[]]);
  }
  return z.any();
}


// Recursively converts a JSON Schema to a Zod schema
function convertSchema(schema: JsonSchema): ZodType {
  if (schema.enum && schema.enum.length > 0) {
    return buildEnumSchema(schema.enum);
  }

  if (schema.const !== undefined) {
    return z.literal(schema.const as never);
  }

  const type = resolveType(schema);

  switch (type) {
    case "object":
    case undefined: {
      const properties = schema.properties ?? {};
      const required = new Set(schema.required ?? []);
      const shape: Record<string, ZodType> = {};

      for (const [key, value] of Object.entries(properties)) {
        const propertySchema = convertSchema(value);
        shape[key] = required.has(key) ? propertySchema : propertySchema.optional();
      }

      let objectSchema = z.object(shape);

      if (schema.additionalProperties === false) {
        objectSchema = objectSchema.strict();
      } else {
        objectSchema = z.looseObject(objectSchema.shape);
      }

      return objectSchema;
    }

    case "array": {
      const itemSchema = Array.isArray(schema.items)
        ? schema.items[0]
        : schema.items;

      const element = itemSchema ? convertSchema(itemSchema) : z.any();
      let arraySchema = z.array(element);

      if (typeof schema.minItems === "number") {
        arraySchema = arraySchema.min(schema.minItems);
      }

      if (typeof schema.maxItems === "number") {
        arraySchema = arraySchema.max(schema.maxItems);
      }

      return arraySchema;
    }

    case "boolean": {
      return z.boolean();
    }

    case "integer":
    case "number": {
      let numberSchema = z.coerce.number();

      if (typeof schema.multipleOf === "number" && schema.multipleOf > 0) {
        numberSchema = numberSchema.multipleOf(schema.multipleOf);
      }

      if (typeof schema.minimum === "number") {
        numberSchema = numberSchema.min(schema.minimum);
      }

      if (typeof schema.maximum === "number") {
        numberSchema = numberSchema.max(schema.maximum);
      }

      if (typeof schema.exclusiveMinimum === "number") {
        numberSchema = numberSchema.gt(schema.exclusiveMinimum);
      }

      if (typeof schema.exclusiveMaximum === "number") {
        numberSchema = numberSchema.lt(schema.exclusiveMaximum);
      }

      if (type === "integer") {
        numberSchema = numberSchema.int();
      }

      return numberSchema;
    }

    case "string": {
      let stringSchema = z.string();

      if (typeof schema.minLength === "number") {
        stringSchema = stringSchema.min(schema.minLength);
      }

      if (typeof schema.maxLength === "number") {
        stringSchema = stringSchema.max(schema.maxLength);
      }

      if (typeof schema.pattern === "string" && schema.pattern.length > 0) {
        try {
          const regex = new RegExp(schema.pattern);
          stringSchema = stringSchema.regex(regex);
        } catch (error) {
          console.warn("Invalid regex pattern in JSON schema", error);
        }
      }

      if (schema.format === "email") {
        stringSchema = stringSchema.email();
      } else if (schema.format === "uri" || schema.format === "url") {
        stringSchema = stringSchema.url();
      }

      return stringSchema;
    }

    default:
      return z.any();
  }
}

export function jsonSchemaToZod(schema: JsonSchema | null | undefined): ZodType {
  if (!schema) {
    return z.looseObject({});
  }

  return convertSchema(schema);
}

function deriveDefault(schema: JsonSchema | null | undefined): unknown {
  if (!schema) {
    return {};
  }

  if (schema.default !== undefined) {
    return schema.default;
  }

  const type = resolveType(schema);

  switch (type) {
    case "object":
    case undefined: {
      const result: Record<string, unknown> = {};
      const properties = schema.properties ?? {};
      for (const [key, propertySchema] of Object.entries(properties)) {
        const value = deriveDefault(propertySchema);
        if (value !== undefined) {
          result[key] = value;
        } else {
          result[key] = "";
        }
      }
      return result;
    }
    case "array": {
      return [];
    }
    case "boolean": {
      return false;
    }
    case "number":
    case "integer": {
      return "";
    }
    case "string": {
      return "";
    }
    default:
      return null;
  }
}

export function jsonSchemaDefaultValues(schema: JsonSchema | null | undefined): Record<string, unknown> {
  const defaults = deriveDefault(schema);
  if (defaults && typeof defaults === "object" && !Array.isArray(defaults)) {
    return defaults as Record<string, unknown>;
    return defaults as Record<string, unknown>;
  }
  return {} as Record<string, unknown>;
}
export function setDeepValue(
  target: unknown,
  path: PathSegment[],
  value: unknown,
): unknown {
  if (path.length === 0) {
    return value;
  }

  const [segment, ...rest] = path;

  if (typeof segment === "number") {
    const nextArray = Array.isArray(target) ? [...target] : [];
    const current = nextArray[segment];
    nextArray[segment] = rest.length === 0
      ? value
      : setDeepValue(current, rest, value);
    return nextArray;
  }

  const nextObject: Record<string, unknown> =
    target && typeof target === "object" && !Array.isArray(target)
      ? { ...(target as Record<string, unknown>) }
      : {};

  const current = nextObject[segment];
  nextObject[segment] = rest.length === 0
    ? value
    : setDeepValue(current, rest, value);

  return nextObject;
}

export function getDeepValue(target: unknown, path: PathSegment[]): unknown {
  let current = target as unknown;

  for (const segment of path) {
    if (current === undefined || current === null) {
      return undefined;
    }

    if (typeof segment === "number") {
      if (!Array.isArray(current)) {
        return undefined;
      }
      current = current[segment];
    } else {
      if (typeof current !== "object" || Array.isArray(current)) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[segment];
    }
  }

  return current;
}
