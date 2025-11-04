import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";

import { AccessDeniedError } from "@/lib/auth/guards";
import { requireAdminSession } from "@/lib/auth/require-admin";
import {
  EXECUTION_STATUSES,
  type ExecutionStatus,
  type ExecutionSort,
  listExecutions,
  normalizeExecutionListParams,
} from "@/lib/admin/executions/data";

function parseListQuery(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const raw = {
    page: searchParams.get("page") ?? undefined,
    per_page: searchParams.get("per_page") ?? undefined,
    workflow_id: searchParams.getAll("workflow_id") ?? undefined,
    status: (() => {
      const filteredStatuses = searchParams
        .getAll("status")
        .filter((value): value is ExecutionStatus => EXECUTION_STATUSES.includes(value as ExecutionStatus));
      return filteredStatuses.length > 0 ? filteredStatuses : undefined;
    })(),
    client_id: searchParams.getAll("client_id") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    q: searchParams.get("q") ?? undefined,
    sort: (searchParams.get("sort") ?? undefined) as ExecutionSort | undefined,
  } satisfies Record<string, unknown>;

  try {
    return normalizeExecutionListParams(raw);
  } catch (error) {
    if (error instanceof ZodError) {
      throw Object.assign(new Error("Invalid query parameters"), {
        status: 400,
        details: error.flatten(),
      });
    }

    throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
      status: 400,
    });
  }
}

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

  let params;
  try {
    params = parseListQuery(request);
  } catch (error) {
    const status = (error as { status?: number }).status ?? 400;
    return NextResponse.json(
      {
        error: (error as Error).message,
        details: (error as { details?: unknown }).details,
      },
      { status },
    );
  }

  try {
    const result = await listExecutions(params);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to load executions", error);
    return NextResponse.json(
      { error: "Failed to load executions." },
      { status: 500 },
    );
  }
}
