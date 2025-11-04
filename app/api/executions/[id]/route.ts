import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { AccessDeniedError } from "@/lib/auth/guards";
import { requireAdminSession } from "@/lib/auth/require-admin";
import { getExecutionDetail } from "@/lib/admin/executions/data";

const pathParamsSchema = z.object({
  id: z.string().uuid(),
});

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession();
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error("Failed to authenticate request", error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = await context.params;
  const parsedParams = pathParamsSchema.safeParse(params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid execution id." }, { status: 400 });
  }

  const { id } = parsedParams.data;
  try {
    const detail = await getExecutionDetail(id);

    if (!detail) {
      return NextResponse.json({ error: "Execution not found." }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (error) {
    console.error("Failed to load execution detail", error);
    return NextResponse.json({ error: "Failed to load execution." }, { status: 500 });
  }
}
