import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { AccessDeniedError } from "@/lib/auth/guards";
import { requireAdminSession } from "@/lib/auth/require-admin";
import { setClientAccess } from "@/lib/admin/clients/data";

type RouteParams = {
  params: Promise<{ id: string }> | { id: string };
};

const updateAccessSchema = z.object({
  workflowIds: z.array(z.string().uuid()).optional().default([]),
});

function isPromiseLike<T>(value: Promise<T> | T): value is Promise<T> {
  return typeof value === "object" && value !== null && "then" in value;
}

export async function POST(request: NextRequest, context: RouteParams) {
  try {
    await requireAdminSession();
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error("Failed to validate admin session for access update", error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = isPromiseLike(context.params) ? await context.params : context.params;
  const clientId = params.id;

  if (!clientId) {
    return NextResponse.json({ error: "Client ID is required." }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  let parsed;
  try {
    parsed = updateAccessSchema.parse(payload);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid payload.", details: error.flatten() },
        { status: 422 },
      );
    }

    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  try {
    await setClientAccess(clientId, parsed.workflowIds);
  } catch (error) {
    console.error("Failed to update client access", error);
    return NextResponse.json(
      { error: "Failed to update client access." },
      { status: 500 },
    );
  }

  return new NextResponse(null, { status: 204 });
}
