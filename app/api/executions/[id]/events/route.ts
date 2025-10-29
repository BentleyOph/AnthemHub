import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { AccessDeniedError } from "@/lib/auth/guards";
import { requireAdminSession } from "@/lib/auth/require-admin";
import { listExecutionEvents } from "@/lib/admin/executions/data";

const pathParamsSchema = z.object({
  id: z.string().uuid(),
});

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  per_page: z.coerce.number().int().positive().max(200).default(50),
});

export async function GET(request: NextRequest, context: { params: { id: string } }) {
  try {
    await requireAdminSession();
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error("Failed to authenticate request", error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedParams = pathParamsSchema.safeParse(context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid execution id." }, { status: 400 });
  }

  const { searchParams } = request.nextUrl;
  const rawQuery = {
    page: searchParams.get("page") ?? undefined,
    per_page: searchParams.get("per_page") ?? undefined,
  } satisfies Record<string, unknown>;

  const parsedQuery = querySchema.safeParse(rawQuery);
  if (!parsedQuery.success) {
    return NextResponse.json({ error: "Invalid pagination parameters." }, { status: 400 });
  }

  const { page, per_page: perPage } = parsedQuery.data;

  try {
    const result = await listExecutionEvents(parsedParams.data.id, page, perPage);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to load execution events", error);
    return NextResponse.json(
      { error: "Failed to load execution events." },
      { status: 500 },
    );
  }
}
