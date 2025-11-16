import { NextResponse, type NextRequest } from "next/server";
import { ZodError, z } from "zod";

import { createWorkflowSchedule } from "@/lib/admin/workflows/presets";
import { AccessDeniedError } from "@/lib/auth/guards";
import { requireAdminSession } from "@/lib/auth/require-admin";

const requestSchema = z.object({
  presetId: z.string().uuid(),
  name: z.string().trim().min(2).max(255),
  cronExpr: z.string().trim().min(1).max(255),
  timezone: z.string().trim().min(2).max(255),
  isActive: z.boolean().optional(),
});

function formatZodError(error: ZodError) {
  const treeify = (z as unknown as { treeifyError?: (err: ZodError) => unknown })
    .treeifyError;
  return treeify ? treeify(error) : error.flatten();
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminSession();
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error("Failed to validate admin session for schedule creation", error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: z.infer<typeof requestSchema>;
  try {
    const json = await request.json();
    payload = requestSchema.parse(json);
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
    const schedule = await createWorkflowSchedule(payload);
    return NextResponse.json(schedule, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid schedule payload.", details: formatZodError(error) },
        { status: 422 },
      );
    }

    console.error("Failed to create workflow schedule", error);
    return NextResponse.json(
      { error: "Failed to create workflow schedule." },
      { status: 500 },
    );
  }
}
