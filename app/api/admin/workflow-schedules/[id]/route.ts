import { NextResponse, type NextRequest } from "next/server";
import { ZodError, z } from "zod";

import {
  deleteWorkflowSchedule,
  updateWorkflowSchedule,
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
  cronExpr: z.string().trim().min(1).max(255),
  timezone: z.string().trim().min(2).max(255),
  isActive: z.boolean(),
});

function formatZodError(error: ZodError) {
  const treeify = (z as unknown as { treeifyError?: (err: ZodError) => unknown })
    .treeifyError;
  return treeify ? treeify(error) : error.flatten();
}

export async function PATCH(request: NextRequest, context: RouteParams) {
  try {
    await requireAdminSession();
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error("Failed to validate admin session for schedule update", error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = isPromiseLike(context.params) ? await context.params : context.params;
  const scheduleId = params.id;

  if (!scheduleId) {
    return NextResponse.json({ error: "Schedule ID is required." }, { status: 400 });
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
    const schedule = await updateWorkflowSchedule(scheduleId, payload);
    return NextResponse.json(schedule);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid schedule payload.", details: formatZodError(error) },
        { status: 422 },
      );
    }

    console.error("Failed to update workflow schedule", error);
    return NextResponse.json(
      { error: "Failed to update workflow schedule." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteParams) {
  try {
    await requireAdminSession();
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error("Failed to validate admin session for schedule deletion", error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = isPromiseLike(context.params) ? await context.params : context.params;
  const scheduleId = params.id;

  if (!scheduleId) {
    return NextResponse.json({ error: "Schedule ID is required." }, { status: 400 });
  }

  try {
    await deleteWorkflowSchedule(scheduleId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Failed to delete workflow schedule", error);
    return NextResponse.json(
      { error: "Failed to delete workflow schedule." },
      { status: 500 },
    );
  }
}
