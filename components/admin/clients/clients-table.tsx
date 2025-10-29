"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  IconCirclePlus,
  IconExternalLink,
  IconSearch,
  IconUsers,
} from "@tabler/icons-react";

import type { ClientListResult } from "@/lib/admin/clients/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Props = {
  result: ClientListResult;
  timeZone: string;
};

type CreateFormState = {
  name: string;
  email: string;
  company: string;
};

const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getDateFormatter(timeZone: string) {
  if (!dateFormatterCache.has(timeZone)) {
    dateFormatterCache.set(
      timeZone,
      new Intl.DateTimeFormat(undefined, {
        timeZone,
        dateStyle: "medium",
        timeStyle: "short",
      }),
    );
  }

  return dateFormatterCache.get(timeZone)!;
}

function formatDate(value: string, timeZone: string) {
  try {
    const formatter = getDateFormatter(timeZone);
    return formatter.format(new Date(value));
  } catch (error) {
    console.error("Failed to format date", error);
    return value;
  }
}

function stringifySearchParams(params: URLSearchParams): string {
  const entries = Array.from(params.entries());
  if (entries.length === 0) return "";
  return `?${entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&")}`;
}

export function AdminClientsList({ result, timeZone }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [formState, setFormState] = useState<CreateFormState>({
    name: "",
    email: "",
    company: "",
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [isCreating, startCreateTransition] = useTransition();
  const [search, setSearch] = useState(result.search ?? "");

  const totalPages = useMemo(() => {
    if (result.perPage === 0) return 1;
    return Math.max(1, Math.ceil(result.total / result.perPage));
  }, [result.perPage, result.total]);

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (search.trim().length > 0) {
      params.set("q", search.trim());
    } else {
      params.delete("q");
    }
    params.delete("page");
    startTransition(() => {
      router.push(`${pathname}${stringifySearchParams(params)}`);
    });
  };

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("page", String(page));
    if (search.trim().length > 0) {
      params.set("q", search.trim());
    } else {
      params.delete("q");
    }
    startTransition(() => {
      router.push(`${pathname}${stringifySearchParams(params)}`);
    });
  };

  const resetForm = () => {
    setFormState({ name: "", email: "", company: "" });
    setFormError(null);
  };

  const handleCreateSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = {
      name: formState.name.trim(),
      email: formState.email.trim(),
      company: formState.company.trim(),
    };

    if (!payload.name) {
      setFormError("Name is required.");
      return;
    }

    setFormError(null);

    startCreateTransition(async () => {
      try {
        const response = await fetch("/api/clients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          const message = (data as { error?: string }).error ?? "Failed to create client.";
          setFormError(message);
          return;
        }

        const data = (await response.json()) as { id: string };
        resetForm();
        setSheetOpen(false);
        router.push(`/admin/clients/${data.id}`);
        router.refresh();
      } catch (error) {
        console.error("Failed to create client", error);
        setFormError("Unexpected error creating client.");
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Clients</h1>
          <p className="text-sm text-muted-foreground">
            Manage client records and workflow entitlements.
          </p>
        </div>
        <Sheet open={sheetOpen} onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) resetForm();
        }}>
          <SheetTrigger asChild>
            <Button variant="default">
              <IconCirclePlus className="mr-2 size-4" /> New Client
            </Button>
          </SheetTrigger>
          <SheetContent className="w-full max-w-md" side="right">
            <SheetHeader>
              <SheetTitle>Create client</SheetTitle>
              <SheetDescription>
                Provision a new client entity. Once created, you can assign workflows and invite users.
              </SheetDescription>
            </SheetHeader>
            <form onSubmit={handleCreateSubmit} className="flex flex-1 flex-col gap-4 p-4 pt-0">
              <div className="space-y-2">
                <Label htmlFor="client-name">Name</Label>
                <Input
                  id="client-name"
                  value={formState.name}
                  onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Acme Corporation"
                  required
                  disabled={isCreating}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-email">Primary email</Label>
                <Input
                  id="client-email"
                  type="email"
                  value={formState.email}
                  onChange={(event) => setFormState((prev) => ({ ...prev, email: event.target.value }))}
                  placeholder="ops@acme.example"
                  disabled={isCreating}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-company">Company</Label>
                <Input
                  id="client-company"
                  value={formState.company}
                  onChange={(event) => setFormState((prev) => ({ ...prev, company: event.target.value }))}
                  placeholder="Acme"
                  disabled={isCreating}
                />
              </div>
              {formError ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {formError}
                </div>
              ) : null}
              <SheetFooter className="mt-6 flex flex-row items-center justify-end gap-2 p-0">
                <Button type="button" variant="ghost" onClick={() => setSheetOpen(false)} disabled={isCreating}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isCreating}>
                  {isCreating ? "Creating…" : "Create client"}
                </Button>
              </SheetFooter>
            </form>
          </SheetContent>
        </Sheet>
      </div>

      <form onSubmit={handleSearchSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full gap-2 sm:max-w-sm">
          <div className="relative flex-1">
            <IconSearch className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, company, or email"
              className="pl-9"
            />
          </div>
          <Button type="submit" variant="secondary" disabled={isPending}>
            Search
          </Button>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <IconUsers className="size-4" />
          <span>
            {result.total === 1 ? "1 client" : `${result.total} clients`} · Page {result.page} of {totalPages}
          </span>
        </div>
      </form>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="text-center">Workflows</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                  No clients found. Try adjusting your search or create a new client.
                </TableCell>
              </TableRow>
            ) : (
              result.data.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="font-medium">{client.name}</TableCell>
                  <TableCell>{client.company ?? "—"}</TableCell>
                  <TableCell>{client.email ?? "—"}</TableCell>
                  <TableCell className="text-center">{client.assignedWorkflowCount}</TableCell>
                  <TableCell>{formatDate(client.createdAt, timeZone)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => router.push(`/admin/clients/${client.id}`)}
                      className={cn("gap-2")}
                    >
                      View
                      <IconExternalLink className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col items-center justify-between gap-3 border-t pt-4 text-sm text-muted-foreground sm:flex-row">
        <div>
          Showing {(result.page - 1) * result.perPage + 1}-
          {Math.min(result.page * result.perPage, result.total)} of {result.total} clients
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(Math.max(1, result.page - 1))}
            disabled={!result.prevPage || isPending || result.page === 1}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(result.page + 1)}
            disabled={!result.nextPage || isPending}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
