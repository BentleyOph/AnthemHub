import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";

import { AccessDeniedError } from "@/lib/auth/guards";
import { requireAdminSession } from "@/lib/auth/require-admin";
import {
  createClient,
  createClientSchema,
  listClients,
  normalizeClientListParams,
} from "@/lib/admin/clients/data";

export async function GET(request: NextRequest) {
  try {
    await requireAdminSession();
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error("Failed to validate admin session for /api/clients", error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let params;
  try {
    params = normalizeClientListParams({
      page: request.nextUrl.searchParams.get("page") ?? undefined,
      per_page: request.nextUrl.searchParams.get("per_page") ?? undefined,
      q: request.nextUrl.searchParams.get("q") ?? undefined,
    });
  } catch (error) {
    const status = error instanceof ZodError ? 400 : 500;
    const payload =
      error instanceof ZodError
        ? { error: "Invalid query parameters", details: error.flatten() }
        : { error: "Failed to parse query parameters" };
    return NextResponse.json(payload, { status });
  }

  try {
    const result = await listClients(params);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to list clients", error);
    return NextResponse.json(
      { error: "Failed to load clients." },
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

    console.error("Failed to validate admin session for client creation", error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload." },
      { status: 400 },
    );
  }

  let parsed;
  try {
    parsed = createClientSchema.parse(payload);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Invalid payload.",
          details: error.flatten(),
        },
        { status: 422 },
      );
    }

    return NextResponse.json(
      { error: "Failed to validate payload." },
      { status: 400 },
    );
  }

  try {
    const result = await createClient(parsed);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Failed to create client", error);
    return NextResponse.json(
      { error: "Failed to create client." },
      { status: 500 },
    );
  }
}
