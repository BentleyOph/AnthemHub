import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";

import { AccessDeniedError } from "@/lib/auth/guards";
import { requireAdminSession } from "@/lib/auth/require-admin";
import {
  deleteWorkflow,
  getWorkflowDetail,
  updateWorkflow,
} from "@/lib/admin/workflows/data";
import { extractWorkflowPayload } from "../helpers";

type RouteParams = {
  params: Promise<{ id: string }> | { id: string };
};

function isPromiseLike<T>(value: Promise<T> | T): value is Promise<T> {
  return typeof value === "object" && value !== null && "then" in value;
}

async function resolveParams(context: RouteParams) {
  return isPromiseLike(context.params) ? await context.params : context.params;
}

export async function GET(request: NextRequest, context: RouteParams) {
  try {
    await requireAdminSession();
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error("Failed to validate admin session for workflow detail", error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = await resolveParams(context);
  const workflowId = params.id;

  if (!workflowId) {
    return NextResponse.json({ error: "Workflow ID is required." }, { status: 400 });
  }

  try {
    const workflow = await getWorkflowDetail(workflowId);
    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
    }
    return NextResponse.json(workflow);
  } catch (error) {
    console.error("Failed to load workflow detail", error);
    return NextResponse.json(
      { error: "Failed to load workflow." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteParams) {
  try {
    await requireAdminSession();
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error("Failed to validate admin session for workflow update", error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = await resolveParams(context);
  const workflowId = params.id;

  if (!workflowId) {
    return NextResponse.json({ error: "Workflow ID is required." }, { status: 400 });
  }

  let payload;
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
    const workflow = await updateWorkflow(workflowId, payload);
    return NextResponse.json(workflow);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid workflow payload.", details: error.flatten() },
        { status: 422 },
      );
    }

    console.error("Failed to update workflow", error);
    return NextResponse.json(
      { error: "Failed to update workflow." },
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

    console.error("Failed to validate admin session for workflow deletion", error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = await resolveParams(context);
  const workflowId = params.id;

  if (!workflowId) {
    return NextResponse.json({ error: "Workflow ID is required." }, { status: 400 });
  }

  try {
    await deleteWorkflow(workflowId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Failed to delete workflow", error);
    return NextResponse.json(
      { error: "Failed to delete workflow." },
      { status: 500 },
    );
  }
}
