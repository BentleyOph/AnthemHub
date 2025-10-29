import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getClientAccessContext } from "@/lib/client/access";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  workflowId: z.string().uuid(),
  note: z
    .string()
    .trim()
    .max(500)
    .optional(),
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
      { error: "You must be linked to a client before requesting access." },
      { status: 400 },
    );
  }

  if (accessContext.assignedWorkflowIds.includes(payload.workflowId)) {
    return NextResponse.json(
      { error: "Workflow already assigned to your workspace." },
      { status: 409 },
    );
  }

  const existingRequest = accessContext.accessRequests.find(
    (requestRow) => requestRow.workflowId === payload.workflowId,
  );

  if (existingRequest?.status === "PENDING") {
    return NextResponse.json(
      { status: "PENDING", message: "Access request already in progress." },
      { status: 200 },
    );
  }

  const { data: workflowRow, error: workflowError } = await supabase
    .from("workflow")
    .select("id, is_published")
    .eq("id", payload.workflowId)
    .maybeSingle<{ id: string; is_published: boolean | null }>();

  if (workflowError) {
    console.error("Failed to load workflow for access request", workflowError);
    return NextResponse.json(
      { error: "Unable to validate workflow." },
      { status: 500 },
    );
  }

  if (!workflowRow) {
    return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
  }

  if (!workflowRow.is_published) {
    return NextResponse.json(
      { error: "Workflow is not available for requests yet." },
      { status: 400 },
    );
  }

  const { error: insertError } = await supabase.from("access_request").insert({
    workflow_id: payload.workflowId,
    requester_id: authData.user.id,
    client_id: accessContext.profile.clientId,
    note: payload.note ?? null,
  });

  if (insertError) {
    console.error("Failed to create access request", insertError);
    return NextResponse.json(
      { error: "Unable to create access request." },
      { status: 500 },
    );
  }

  revalidatePath("/catalog");
  revalidatePath("/workflows");
  revalidatePath("/overview");

  return NextResponse.json({ status: "PENDING" }, { status: 201 });
}
