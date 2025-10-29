import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getClientAccessContext } from "@/lib/client/access";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { parseJsonSchema } from "@/lib/schema/jsonschema";
import { jsonSchemaToZod } from "@/lib/schema/jsonschema-zod";

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

  let parsedInput = payload.input ?? {};
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

  const { data: insertData, error: insertError } = await supabase
    .from("execution")
    .insert({
      workflow_id: workflowRow.id,
      client_id: accessContext.profile.clientId,
      status: "PENDING",
      source: "USER",
      input_payload: parsedInput,
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

  // Revalidate key client routes so new executions appear promptly.
  revalidatePath("/executions");
  revalidatePath("/overview");
  revalidatePath(`/workflows/${workflowRow.id}/executions`);

  return NextResponse.json(
    { executionId },
    { status: 201 },
  );
}
