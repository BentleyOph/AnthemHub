import { z } from "zod";

export interface JsonSchema {
  $schema?: string;
  $id?: string;
  type?: string | string[];
  title?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema | JsonSchema[];
  enum?: unknown[];
  const?: unknown;
  format?: string;
  default?: unknown;
  examples?: unknown[];
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
  minItems?: number;
  maxItems?: number;
  anyOf?: JsonSchema[];
  allOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  not?: JsonSchema;
}

export function defineJsonSchema<TSchema extends JsonSchema>(
  schema: TSchema,
): TSchema {
  return schema;
}

const jsonSchemaRef: z.ZodType<JsonSchema> = z.lazy(() =>
  z
    .object({
      $schema: z.string().optional(),
      $id: z.string().optional(),
      type: z.union([z.string(), z.array(z.string())]).optional(),
      title: z.string().optional(),
      description: z.string().optional(),
      properties: z
        .record(z.string(), jsonSchemaRef)
        .optional(),
      required: z.array(z.string()).optional(),
      additionalProperties: z.union([z.boolean(), jsonSchemaRef]).optional(),
      items: z.union([jsonSchemaRef, z.array(jsonSchemaRef)]).optional(),
      enum: z.array(z.unknown()).optional(),
      const: z.unknown().optional(),
      format: z.string().optional(),
      default: z.unknown().optional(),
      examples: z.array(z.unknown()).optional(),
      minLength: z.number().optional(),
      maxLength: z.number().optional(),
      pattern: z.string().optional(),
      minimum: z.number().optional(),
      maximum: z.number().optional(),
      exclusiveMinimum: z.number().optional(),
      exclusiveMaximum: z.number().optional(),
      multipleOf: z.number().optional(),
      minItems: z.number().optional(),
      maxItems: z.number().optional(),
      anyOf: z.array(jsonSchemaRef).optional(),
      allOf: z.array(jsonSchemaRef).optional(),
      oneOf: z.array(jsonSchemaRef).optional(),
      not: jsonSchemaRef.optional(),
    })
    .catchall(z.unknown()),
);

export function parseJsonSchema(value: unknown): JsonSchema {
  return jsonSchemaRef.parse(value);
}

export function safeParseJsonSchema(value: unknown) {
  return jsonSchemaRef.safeParse(value);
}
