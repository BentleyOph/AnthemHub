import { z } from "zod";

export type ZodSchema<T> = z.ZodType<T>;

export function parseWithSchema<T>(
  schema: ZodSchema<T>,
  payload: unknown,
): T {
  return schema.parse(payload);
}

export function safeParseWithSchema<T>(
  schema: ZodSchema<T>,
  payload: unknown,
) {
  return schema.safeParse(payload);
}
