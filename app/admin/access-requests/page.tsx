import { ZodError } from "zod";

import { AccessRequestsTable } from "./access-requests-table";
import {
  listAccessRequests,
  normalizeAccessRequestListParams,
  type AccessRequestListResult,
} from "@/lib/admin/access-requests/data";
import { requireAdminSession } from "@/lib/auth/require-admin";

type SearchParamsInput = Record<string, string | string[] | undefined>;

type PageProps = {
  searchParams?: SearchParamsInput | Promise<SearchParamsInput>;
};

export default async function AdminAccessRequestsPage({ searchParams }: PageProps) {
  await requireAdminSession();

  const resolvedSearchParams: SearchParamsInput =
    (await Promise.resolve(searchParams)) ?? {};

  let data: AccessRequestListResult | null = null;
  let error: string | null = null;

  try {
    const normalized = normalizeAccessRequestListParams(resolvedSearchParams);
    data = await listAccessRequests(normalized);
  } catch (err) {
    if (err instanceof ZodError) {
      error = "Invalid filters provided.";
    } else {
      error = "Failed to load access requests.";
    }

    console.error("Failed to load admin access requests", err);
  }

  const timeZone = process.env.APP_TIMEZONE ?? "Africa/Nairobi";

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Access Requests</h1>
        <p className="text-sm text-muted-foreground">
          Review pending workflow access requests and approve or reject them.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : data ? (
        <AccessRequestsTable initialData={data} timeZone={timeZone} />
      ) : (
        <div className="rounded-md border p-4 text-sm text-muted-foreground">
          Loading access requests…
        </div>
      )}
    </div>
  );
}
