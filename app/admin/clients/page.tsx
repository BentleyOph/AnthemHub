import { AdminClientsList } from "@/components/admin/clients/clients-table";
import { listClients, parseClientListSearchParams } from "@/lib/admin/clients/data";

type SearchParamsRecord = Record<string, string | string[] | undefined>;

type PageProps = {
  searchParams?: SearchParamsRecord | Promise<SearchParamsRecord>;
};

const TIMEZONE = process.env.APP_TIMEZONE ?? "Africa/Nairobi";

function isPromiseLike<T>(value: Promise<T> | T): value is Promise<T> {
  return typeof value === "object" && value !== null && "then" in value;
}

export default async function AdminClientsPage({ searchParams }: PageProps) {
  const resolvedSearchParams: SearchParamsRecord = searchParams
    ? isPromiseLike(searchParams)
      ? await searchParams
      : searchParams
    : {};

  let normalizedParams;
  try {
    normalizedParams = parseClientListSearchParams(resolvedSearchParams);
  } catch (error) {
    console.error("Invalid client list query parameters", error);
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Clients</h1>
          <p className="text-sm text-muted-foreground">
            Manage client records and workflow entitlements.
          </p>
        </div>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          Invalid filters supplied. Please adjust the query and try again.
        </div>
      </div>
    );
  }

  const result = await listClients(normalizedParams).catch((error) => {
    console.error("Failed to load clients", error);
    return null;
  });

  if (!result) {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Clients</h1>
          <p className="text-sm text-muted-foreground">
            Manage client records and workflow entitlements.
          </p>
        </div>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          We could not load client data at this time. Please refresh to try again.
        </div>
      </div>
    );
  }

  const componentKey = [result.page, result.perPage, result.search ?? "", result.total].join("|");

  return <AdminClientsList key={componentKey} result={result} timeZone={TIMEZONE} />;
}
