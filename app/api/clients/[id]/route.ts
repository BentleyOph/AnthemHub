import { NextResponse, type NextRequest } from "next/server";

import { AccessDeniedError } from "@/lib/auth/guards";
import { requireAdminSession } from "@/lib/auth/require-admin";
import { getClientDetail } from "@/lib/admin/clients/data";

type RouteParams = {
  params: Promise<{ id: string }> | { id: string };
};

function isPromiseLike<T>(value: Promise<T> | T): value is Promise<T> {
  return typeof value === "object" && value !== null && "then" in value;
}

export async function GET(request: NextRequest, context: RouteParams) {
  try {
    await requireAdminSession();
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error("Failed to validate admin session for client detail", error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = isPromiseLike(context.params) ? await context.params : context.params;
  const clientId = params.id;

  if (!clientId) {
    return NextResponse.json({ error: "Client ID is required." }, { status: 400 });
  }

  try {
    const detail = await getClientDetail(clientId);
    if (!detail) {
      return NextResponse.json({ error: "Client not found." }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (error) {
    console.error("Failed to load client detail", error);
    return NextResponse.json(
      { error: "Failed to load client detail." },
      { status: 500 },
    );
  }
}
