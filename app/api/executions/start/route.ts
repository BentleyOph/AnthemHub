import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getClientAccessContext } from "@/lib/client/access";
import { parseJsonSchema } from "@/lib/schema/jsonschema";
import { jsonSchemaToZod } from "@/lib/schema/jsonschema-zod";
import { getExecutionQueue } from "@/lib/queue";
import { getRedisClient } from "@/lib/redis/client";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  workflowId: z.string().uuid(),
  input: z.unknown().optional(),
});

export async function POST(request: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: z.infer<typeof requestSchema>;
  try {
    const json = await request.json();
    payload = requestSchema.parse(json);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid payload.", details: error.flatten() },
        { status: 422 },
      );
    }
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const accessContext = await getClientAccessContext({ supabase });

  if (!accessContext.profile.clientId) {
    return NextResponse.json(
      { error: "You must belong to a client workspace before running workflows." },
      { status: 400 },
    );
  }

  const hasAccess = accessContext.assignedWorkflowIds.includes(payload.workflowId);

  if (!hasAccess) {
    return NextResponse.json(
      { error: "You do not have access to run this workflow." },
      { status: 403 },
    );
  }

  const { data: workflowRow, error: workflowError } = await supabase
    .from("workflow")
    .select(
      `
        id,
        is_published,
        input_schema
      `,
    )
    .eq("id", payload.workflowId)
    .maybeSingle<{
      id: string;
      is_published: boolean | null;
      input_schema: unknown;
    }>();

  if (workflowError) {
    console.error("Failed to load workflow for execution start", workflowError);
    return NextResponse.json(
      { error: "Unable to load workflow." },
      { status: 500 },
    );
  }

  if (!workflowRow) {
    return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
  }

  if (!workflowRow.is_published) {
    return NextResponse.json(
      { error: "Workflow is not available to run yet." },
      { status: 400 },
    );
  }

  let parsedInput: unknown = payload.input ?? {};
  try {
    const schema = workflowRow.input_schema
      ? parseJsonSchema(workflowRow.input_schema)
      : null;
    const validator = jsonSchemaToZod(schema);
    const result = validator.safeParse(parsedInput ?? {});
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed.", details: result.error.flatten() },
        { status: 422 },
      );
    }
    parsedInput = result.data;
  } catch (error) {
    console.error("Failed to validate workflow input", error);
    return NextResponse.json(
      { error: "Invalid workflow schema or payload." },
      { status: 422 },
    );
  }

  let rateLimitResult;
  try {
    rateLimitResult = await consumeExecutionRateLimit({
      clientId: accessContext.profile.clientId,
      workflowId: workflowRow.id,
    });
  } catch (error) {
    console.error("Failed to enforce execution rate limit", error);
    return NextResponse.json(
      { error: "Unable to start executions right now. Please try again shortly." },
      { status: 503 },
    );
  }

  if (!rateLimitResult.allowed) {
    const retryAfter = rateLimitResult.retryAfterSeconds ?? RATE_LIMIT_WINDOW_SECONDS;
    return NextResponse.json(
      {
        error:
          "You have reached the limit for starting this workflow. Please try again in a few moments.",
        retryAfterSeconds: retryAfter,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
        },
      },
    );
  }

  const jobInput =
    parsedInput && typeof parsedInput === "object" && !Array.isArray(parsedInput)
      ? (parsedInput as Record<string, unknown>)
      : { value: parsedInput };

  const { data: insertData, error: insertError } = await supabase
    .from("execution")
    .insert({
      workflow_id: workflowRow.id,
      client_id: accessContext.profile.clientId,
      status: "PROCESSING",
      source: "USER",
      input_payload: parsedInput,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (insertError || !insertData) {
    console.error("Failed to create execution record", insertError);
    return NextResponse.json(
      { error: "Unable to start workflow execution." },
      { status: 500 },
    );
  }

  const executionId = insertData.id;

  try {
    const queue = getExecutionQueue();
    const callbackUrl = resolveCallbackUrl(request);

    await queue.add(
      "start",
      {
        executionId,
        workflowId: workflowRow.id,
        clientId: accessContext.profile.clientId,
        input: jobInput,
        callbackUrl,
        startedByUserId: authData.user.id,
      },
      {
        attempts: 5,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
      },
    );
  } catch (error) {
    console.error("Failed to enqueue execution job", error);
    return NextResponse.json(
      { error: "Unable to enqueue workflow execution." },
      { status: 500 },
    );
  }

  // Revalidate key client routes so new executions appear promptly.
  revalidatePath("/executions");
  revalidatePath("/overview");
  revalidatePath(`/workflows/${workflowRow.id}/executions`);

  return NextResponse.json(
    { executionId },
    { status: 201 },
  );
}

const RATE_LIMIT_WINDOW_SECONDS = 60;

function resolveExecutionRateLimit(): number | null {
  const raw = process.env.RATE_LIMIT_EXEC_START_PER_MIN;

  if (!raw || raw.trim().length === 0) {
    return DEFAULT_EXECUTION_RATE_LIMIT;
  }

  const parsed = Number.parseInt(raw, 10);

  if (Number.isNaN(parsed)) {
    return DEFAULT_EXECUTION_RATE_LIMIT;
  }

  if (parsed <= 0) {
    return null;
  }

  return parsed;
}

const DEFAULT_EXECUTION_RATE_LIMIT = 10;

async function consumeExecutionRateLimit({
  clientId,
  workflowId,
}: {
  clientId: string;
  workflowId: string;
}): Promise<{ allowed: true; remaining: number } | { allowed: false; retryAfterSeconds: number }> {
  const limit = resolveExecutionRateLimit();

  if (limit === null) {
    return { allowed: true, remaining: Number.POSITIVE_INFINITY };
  }

  const redis = getRedisClient();
  const key = `rate:exec-start:${clientId}:${workflowId}`;

  try {
    const results = await redis
      .multi()
      .incr(key)
      .expire(key, RATE_LIMIT_WINDOW_SECONDS, "NX")
      .exec();

    if (!results) {
      throw new Error("Failed to execute rate limit transaction");
    }

    const incrementResult = Number(results[0]?.[1] ?? 0);

    if (Number.isNaN(incrementResult) || incrementResult <= 0) {
      throw new Error("Unexpected rate limit counter value");
    }

    if (incrementResult > limit) {
      const ttl = await redis.ttl(key);
      return {
        allowed: false,
        retryAfterSeconds: ttl > 0 ? ttl : RATE_LIMIT_WINDOW_SECONDS,
      };
    }

    return {
      allowed: true,
      remaining: Math.max(limit - incrementResult, 0),
    };
  } catch (error) {
    console.error("Failed to apply execution rate limit", error);
    throw error;
  }
}

function resolveCallbackUrl(request: NextRequest): string {
  const baseOverride = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (baseOverride) {
    return new URL("/api/webhooks/n8n/callback", baseOverride).toString();
  }

  return new URL("/api/webhooks/n8n/callback", request.nextUrl.origin).toString();
}
