import { NextResponse, type NextRequest } from "next/server";
import { ZodError, z } from "zod";

import {
  deleteWorkflowPreset,
  updateWorkflowPreset,
} from "@/lib/admin/workflows/presets";
import { AccessDeniedError } from "@/lib/auth/guards";
import { requireAdminSession } from "@/lib/auth/require-admin";

type RouteParams = {
  params: Promise<{ id: string }> | { id: string };
};

function isPromiseLike<T>(value: Promise<T> | T): value is Promise<T> {
  return typeof value === "object" && value !== null && "then" in value;
}

const updateSchema = z.object({
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

async function ensureAdmin() {
  try {
    await requireAdminSession();
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      throw new AccessDeniedError(error.message);
    }

    throw new AccessDeniedError();
  }
}

export async function PATCH(request: NextRequest, context: RouteParams) {
  try {
    await ensureAdmin();
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = isPromiseLike(context.params) ? await context.params : context.params;
  const presetId = params.id;

  if (!presetId) {
    return NextResponse.json({ error: "Preset ID is required." }, { status: 400 });
  }

  let payload: z.infer<typeof updateSchema>;
  try {
    const json = await request.json();
    payload = updateSchema.parse(json);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid payload.", details: formatZodError(error) },
        { status: 422 },
      );
    }

    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const preset = await updateWorkflowPreset(presetId, payload);
    return NextResponse.json(preset);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid preset payload.", details: formatZodError(error) },
        { status: 422 },
      );
    }

    console.error("Failed to update workflow preset", error);
    return NextResponse.json(
      { error: "Failed to update workflow preset." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteParams) {
  try {
    await ensureAdmin();
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = isPromiseLike(context.params) ? await context.params : context.params;
  const presetId = params.id;

  if (!presetId) {
    return NextResponse.json({ error: "Preset ID is required." }, { status: 400 });
  }

  try {
    await deleteWorkflowPreset(presetId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Failed to delete workflow preset", error);
    return NextResponse.json(
      { error: "Failed to delete workflow preset." },
      { status: 500 },
    );
  }
}
