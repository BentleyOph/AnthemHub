import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

// Progress update: stage + message, no status
const progressUpdateSchema = z.object({
  execution_id: z.string().uuid(),
  n8n_run_id: z.string().trim().min(1).optional(),
  stage: z.string().trim().min(1).max(255),
  message: z.unknown().optional(),
  raw: z.unknown().optional(),
});

// Success update: status=SUCCESS + output
const successUpdateSchema = z.object({
  execution_id: z.string().uuid(),
  n8n_run_id: z.string().trim().min(1).optional(),
  status: z.literal("SUCCESS"),
  output: z.unknown(), // Allow any output structure
  result_file_url: z.string().url().optional(),
  finished_at: z.string().datetime({ offset: true }).optional(),
});

// Error update: status=ERROR + error message
const errorUpdateSchema = z.object({
  execution_id: z.string().uuid(),
  n8n_run_id: z.string().trim().min(1).optional(),
  status: z.literal("ERROR"),
  error: z.string().max(1024),
  finished_at: z.string().datetime({ offset: true }).optional(),
});

const callbackSchema = z.discriminatedUnion("status", [
  successUpdateSchema,
  errorUpdateSchema,
  progressUpdateSchema.extend({ status: z.undefined() }),
]);

type CallbackPayload = z.infer<typeof callbackSchema>;

const TERMINAL_STATUSES = new Set(["SUCCESS", "ERROR"]);

export async function POST(request: NextRequest) {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch (error) {
    console.error("Failed to read callback request body", error);
    return NextResponse.json(
      { error: "Unable to read request body." },
      { status: 400 },
    );
  }

  if (!rawBody || rawBody.trim().length === 0) {
    return NextResponse.json(
      { error: "Request body is required." },
      { status: 400 },
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch (error) {
    console.error("Failed to parse callback JSON", error);
    return NextResponse.json(
      { error: "Invalid JSON payload." },
      { status: 400 },
    );
  }

  const validation = callbackSchema.safeParse(parsedJson);
  if (!validation.success) {
    return NextResponse.json(
      { error: "Invalid payload.", details: validation.error.flatten() },
      { status: 422 },
    );
  }

  const payload = validation.data;
  const supabase = getSupabaseServiceRoleClient();

  const { data: execution, error: executionError } = await supabase
    .from("execution")
    .select("id, status, n8n_run_id")
    .eq("id", payload.execution_id)
    .maybeSingle<{
      id: string;
      status: string;
      n8n_run_id: string | null;
    }>();

  if (executionError) {
    console.error("Failed to load execution for callback", executionError, {
      executionId: payload.execution_id,
    });
    return NextResponse.json(
      { error: "Failed to load execution." },
      { status: 500 },
    );
  }

  if (!execution) {
    return NextResponse.json(
      { error: "Execution not found." },
      { status: 404 },
    );
  }

  let didFinalize = false;

  try {
    if ("stage" in payload) {
      // Progress update - record event
      await recordProgressEvent(supabase, payload, execution);
    } else if (payload.status === "SUCCESS") {
      // Success - update execution with output
      didFinalize = await finalizeSuccess(supabase, payload, execution);
    } else if (payload.status === "ERROR") {
      // Error - update execution with error
      didFinalize = await finalizeError(supabase, payload, execution);
    }
  } catch (error) {
    console.error("Failed to process n8n callback", error, {
      executionId: payload.execution_id,
    });
    return NextResponse.json(
      { error: "Failed to process callback." },
      { status: 500 },
    );
  }

  if (didFinalize) {
    revalidatePath("/executions");
    revalidatePath("/overview");
    revalidatePath("/admin/executions");
    revalidatePath("/admin/overview");
  }

  return NextResponse.json({ ok: true });
}

type SupabaseServiceClient = ReturnType<typeof getSupabaseServiceRoleClient>;

async function recordProgressEvent(
  supabase: SupabaseServiceClient,
  payload: Extract<CallbackPayload, { stage: string }>,
  execution: { id: string; n8n_run_id: string | null },
) {
  const timestamp = new Date().toISOString();
  
  // Normalize message to string or null
  let message: string | null = null;
  if (typeof payload.message === "string") {
    const trimmed = payload.message.trim();
    message = trimmed.length > 0 ? trimmed.slice(0, 1024) : null;
  } else if (payload.message && typeof payload.message === "object") {
    // If message is an object, stringify it
    message = JSON.stringify(payload.message).slice(0, 1024);
  }

  // Check for duplicate event (stage + timestamp + message)
  const { data: existing } = await supabase
    .from("execution_event")
    .select("id")
    .eq("execution_id", execution.id)
    .eq("stage", payload.stage)
    .eq("timestamp", timestamp)
    .is("message", message)
    .maybeSingle();

  if (existing) {
    return; // Deduplicated
  }

  const { error } = await supabase.from("execution_event").insert({
    execution_id: execution.id,
    timestamp,
    stage: payload.stage,
    message,
    raw: payload.raw ?? null,
  });

  if (error && error.code !== "23505") {
    throw error;
  }

  // Update n8n_run_id if provided and different
  if (payload.n8n_run_id && payload.n8n_run_id !== execution.n8n_run_id) {
    await supabase
      .from("execution")
      .update({ n8n_run_id: payload.n8n_run_id })
      .eq("id", execution.id);
  }
}

async function finalizeSuccess(
  supabase: SupabaseServiceClient,
  payload: Extract<CallbackPayload, { status: "SUCCESS" }>,
  execution: { id: string; status: string },
): Promise<boolean> {
  if (TERMINAL_STATUSES.has(execution.status)) {
    return false; // Already finalized
  }

  const updates: Record<string, unknown> = {
    status: "SUCCESS",
    output_payload: payload.output,
    finished_at: payload.finished_at ?? new Date().toISOString(),
    error_message: null,
  };

  if (payload.n8n_run_id) {
    updates.n8n_run_id = payload.n8n_run_id;
  }

  if (payload.result_file_url) {
    updates.result_file_url = payload.result_file_url;
  }

  const { error } = await supabase
    .from("execution")
    .update(updates)
    .eq("id", execution.id)
    .in("status", ["PENDING", "PROCESSING"]);

  if (error) {
    throw error;
  }

  return true;
}

async function finalizeError(
  supabase: SupabaseServiceClient,
  payload: Extract<CallbackPayload, { status: "ERROR" }>,
  execution: { id: string; status: string },
): Promise<boolean> {
  if (TERMINAL_STATUSES.has(execution.status)) {
    return false; // Already finalized
  }

  const updates: Record<string, unknown> = {
    status: "ERROR",
    error_message: payload.error.slice(0, 1024),
    finished_at: payload.finished_at ?? new Date().toISOString(),
  };

  if (payload.n8n_run_id) {
    updates.n8n_run_id = payload.n8n_run_id;
  }

  const { error } = await supabase
    .from("execution")
    .update(updates)
    .eq("id", execution.id)
    .in("status", ["PENDING", "PROCESSING"]);

  if (error) {
    throw error;
  }

  return true;
}
