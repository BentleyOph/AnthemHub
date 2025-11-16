import { NextResponse, type NextRequest } from "next/server";
import { ZodError, z } from "zod";

import { createWorkflowPreset } from "@/lib/admin/workflows/presets";
import { AccessDeniedError } from "@/lib/auth/guards";
import { requireAdminSession } from "@/lib/auth/require-admin";

type RouteParams = {
  params: Promise<{ id: string }> | { id: string };
};

function isPromiseLike<T>(value: Promise<T> | T): value is Promise<T> {
  return typeof value === "object" && value !== null && "then" in value;
}

const requestSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().trim().min(2).max(255),
  description: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  inputPayload: z.record(z.string(), z.any()).optional().default({}),
});

function formatZodError(error: ZodError) {
  const treeify = (z as unknown as { treeifyError?: (err: ZodError) => unknown })
    .treeifyError;
  return treeify ? treeify(error) : error.flatten();
}

export async function POST(request: NextRequest, context: RouteParams) {
  let adminUser;
  try {
    adminUser = await requireAdminSession();
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error("Failed to validate admin session for preset creation", error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = isPromiseLike(context.params) ? await context.params : context.params;
  const workflowId = params.id;

  if (!workflowId) {
    return NextResponse.json({ error: "Workflow ID is required." }, { status: 400 });
  }

  let payload: z.infer<typeof requestSchema>;
  let rawBody: string | null = null;
  try {
    const clone = request.clone();
    rawBody = await clone.text();
    const json = await request.json();
    payload = requestSchema.parse(json);
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error("Failed to parse preset payload", { rawBody, error });
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid payload.", details: formatZodError(error) },
        { status: 422 },
      );
    }

    console.error("Unexpected error parsing preset payload", { rawBody, error });
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const preset = await createWorkflowPreset({
      workflowId,
      clientId: payload.clientId,
      name: payload.name,
      description: payload.description,
      inputPayload: payload.inputPayload,
      createdBy: adminUser.id,
    });

    return NextResponse.json(preset, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid preset payload.", details: formatZodError(error) },
        { status: 422 },
      );
    }

    console.error("Failed to create workflow preset", error);
    const message =
      error instanceof Error ? error.message : "Failed to create workflow preset.";
    const status =
      error instanceof Error && message.includes("access")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
