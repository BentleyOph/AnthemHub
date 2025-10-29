import type { NextRequest } from "next/server";
import { ZodError } from "zod";

import type { WorkflowUpsertInput } from "@/lib/admin/workflows/data";

export function parseBooleanString(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "on" || normalized === "yes";
}

export function parseMultipartPayload(formData: FormData): WorkflowUpsertInput {
  const icon = formData.get("icon");
  const removeIconValue = formData.get("removeIcon");

  return {
    name: formData.get("name")?.toString() ?? "",
    publicDesc: formData.get("publicDesc")?.toString() ?? "",
    internalNotes: formData.get("internalNotes")?.toString() ?? undefined,
    n8nWebhookUrl: formData.get("n8nWebhookUrl")?.toString() ?? "",
    inputSchema: formData.get("inputSchema")?.toString() ?? "",
    isPublished: parseBooleanString(formData.get("isPublished")?.toString() ?? null),
    iconFile: icon instanceof File && icon.size > 0 ? icon : undefined,
    removeIcon:
      typeof removeIconValue === "string"
        ? parseBooleanString(removeIconValue)
        : false,
  };
}

export async function extractWorkflowPayload(
  request: NextRequest,
): Promise<WorkflowUpsertInput> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    return parseMultipartPayload(formData);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch (error) {
    console.error("Failed to parse JSON workflow payload", error);
    throw new ZodError([
      {
        code: "custom",
        path: [],
        message: "Invalid JSON payload.",
      },
    ]);
  }

  const typed = payload as Record<string, unknown>;
  const inputSchema: WorkflowUpsertInput["inputSchema"] =
    typeof typed.inputSchema === "string"
      ? typed.inputSchema
      : typeof typed.inputSchema === "object" && typed.inputSchema !== null
        ? (typed.inputSchema as Record<string, unknown>)
        : "";

  return {
    name: String(typed.name ?? ""),
    publicDesc: String(typed.publicDesc ?? ""),
    internalNotes:
      typeof typed.internalNotes === "string" ? typed.internalNotes : undefined,
    n8nWebhookUrl: String(typed.n8nWebhookUrl ?? ""),
    inputSchema,
    isPublished: Boolean(typed.isPublished),
    removeIcon: Boolean(typed.removeIcon),
  };
}
