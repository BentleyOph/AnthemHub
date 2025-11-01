import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";

import { AccessDeniedError } from "@/lib/auth/guards";
import { requireAdminSession } from "@/lib/auth/require-admin";
import {
  AccessRequestActionError,
  rejectAccessRequest,
} from "@/lib/admin/access-requests/data";

const pathParamsSchema = z.object({
  id: z.string().uuid(),
});

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminSession();
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error("Failed to authenticate request", error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = await context.params;
  const parsedParams = pathParamsSchema.safeParse(params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid access request id." }, { status: 400 });
  }

  const { id } = parsedParams.data;
  try {
    await rejectAccessRequest(id);
    revalidatePath("/admin/access-requests");
    revalidatePath("/admin/overview");
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AccessRequestActionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Failed to reject access request", error);
    return NextResponse.json(
      { error: "Failed to reject access request." },
      { status: 500 },
    );
  }
}
