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
