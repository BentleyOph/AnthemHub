import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";

import { AccessDeniedError } from "@/lib/auth/guards";
import { requireAdminSession } from "@/lib/auth/require-admin";
import {
  createWorkflow,
  listWorkflows,
  normalizeWorkflowListParams,
} from "@/lib/admin/workflows/data";
import type { WorkflowUpsertInput } from "@/lib/admin/workflows/data";
import { extractWorkflowPayload } from "./helpers";

export async function GET(request: NextRequest) {
  try {
    await requireAdminSession();
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error("Failed to validate admin session for workflow listing", error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const params = normalizeWorkflowListParams({
      page: request.nextUrl.searchParams.get("page") ?? undefined,
      per_page: request.nextUrl.searchParams.get("per_page") ?? undefined,
      q: request.nextUrl.searchParams.get("q") ?? undefined,
      status: request.nextUrl.searchParams.get("status") ?? undefined,
    });

    const result = await listWorkflows(params);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid query parameters.", details: error.flatten() },
        { status: 400 },
      );
    }

    console.error("Failed to list workflows", error);
    return NextResponse.json(
      { error: "Failed to load workflows." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminSession();
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error("Failed to validate admin session for workflow creation", error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: WorkflowUpsertInput;
  try {
    payload = await extractWorkflowPayload(request);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid payload.", details: error.flatten() },
        { status: 422 },
      );
    }

    console.error("Unexpected error extracting workflow payload", error);
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  try {
    const workflow = await createWorkflow(payload);
    return NextResponse.json(workflow, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid workflow payload.", details: error.flatten() },
        { status: 422 },
      );
    }

    console.error("Failed to create workflow", error);
    return NextResponse.json({ error: "Failed to create workflow." }, { status: 500 });
  }
}
