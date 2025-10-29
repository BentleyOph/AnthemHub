import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";

import { AccessDeniedError } from "@/lib/auth/guards";
import { requireAdminSession } from "@/lib/auth/require-admin";
import {
  listAccessRequests,
  normalizeAccessRequestListParams,
} from "@/lib/admin/access-requests/data";

export async function GET(request: NextRequest) {
  try {
    await requireAdminSession();
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error("Failed to authenticate request", error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;

  const rawParams = {
    page: searchParams.get("page") ?? undefined,
    per_page: searchParams.get("per_page") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    client_id: searchParams.get("client_id") ?? undefined,
    workflow_id: searchParams.get("workflow_id") ?? undefined,
  } satisfies Record<string, string | string[] | undefined>;

  let normalized;
  try {
    normalized = normalizeAccessRequestListParams(rawParams);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid query parameters.", details: error.flatten() },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: (error as Error).message ?? "Invalid query parameters." },
      { status: 400 },
    );
  }

  try {
    const result = await listAccessRequests(normalized);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to load access requests", error);
    return NextResponse.json(
      { error: "Failed to load access requests." },
      { status: 500 },
    );
  }
}
