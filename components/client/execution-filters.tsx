"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { ClientExecutionFilterOptions, ClientExecutionStatus } from "@/lib/client/executions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

function isoToDateInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function dateInputToIso(value: string, endOfDay = false): string | null {
  if (!value) return null;
  const isoCandidate = endOfDay ? `${value}T23:59:59.999` : `${value}T00:00:00.000`;
  const date = new Date(isoCandidate);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export type ClientExecutionFiltersState = {
  workflowId: string | null;
  status: ClientExecutionStatus | null;
  userId: string | null;
  from: string | null;
  to: string | null;
};

type Props = {
  filters: ClientExecutionFiltersState;
  options: ClientExecutionFilterOptions;
  viewerUserId: string;
};

type FormState = {
  workflowId: string;
  status: ClientExecutionStatus | "";
  userId: string;
  from: string;
  to: string;
};

function createFormStateFromFilters(filters: ClientExecutionFiltersState): FormState {
  return {
    workflowId: filters.workflowId ?? "",
    status: filters.status ?? "",
    userId: filters.userId ?? "",
    from: isoToDateInput(filters.from),
    to: isoToDateInput(filters.to),
  } satisfies FormState;
}

function createEmptyFormState(): FormState {
  return {
    workflowId: "",
    status: "",
    userId: "",
    from: "",
    to: "",
  } satisfies FormState;
}

const serializeFormState = (state: FormState): string =>
  [state.workflowId, state.status, state.userId, state.from, state.to].join("|");

export function ClientExecutionFilters({ filters, options, viewerUserId }: Props) {
  const initialFormState = createFormStateFromFilters(filters);
  const remountKey = serializeFormState(initialFormState);

  return (
    <ClientExecutionFiltersForm
      key={remountKey}
      initialFormState={initialFormState}
      options={options}
      viewerUserId={viewerUserId}
    />
  );
}

type ClientExecutionFiltersFormProps = {
  initialFormState: FormState;
  options: ClientExecutionFilterOptions;
  viewerUserId: string;
};

function ClientExecutionFiltersForm({ initialFormState, options, viewerUserId }: ClientExecutionFiltersFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [formState, setFormState] = useState<FormState>(initialFormState);

  const isClientExecutionStatusValue = (value: string): value is ClientExecutionStatus =>
    options.statuses.some((statusOption) => statusOption === value);

  const handleStatusChange = (value: string) => {
    if (!value) {
      setFormState((prev) => ({ ...prev, status: "" }));
      return;
    }

    if (!isClientExecutionStatusValue(value)) {
      return;
    }

    setFormState((prev) => ({ ...prev, status: value }));
  };

  const handleApply = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = new URLSearchParams(searchParams?.toString() ?? "");

    if (formState.workflowId) {
      params.set("workflow_id", formState.workflowId);
    } else {
      params.delete("workflow_id");
    }

    if (formState.status) {
      params.set("status", formState.status);
    } else {
      params.delete("status");
    }

    if (formState.userId) {
      params.set("user_id", formState.userId);
    } else {
      params.delete("user_id");
    }

    const fromIso = dateInputToIso(formState.from, false);
    const toIso = dateInputToIso(formState.to, true);

    if (fromIso) {
      params.set("from", fromIso);
    } else {
      params.delete("from");
    }

    if (toIso) {
      params.set("to", toIso);
    } else {
      params.delete("to");
    }

    params.delete("page");

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  const handleClear = () => {
    setFormState(createEmptyFormState());
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    ["workflow_id", "status", "user_id", "from", "to", "page"].forEach((key) => params.delete(key));
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  const handleSetMine = () => {
    setFormState((prev) => ({ ...prev, userId: viewerUserId }));
  };

  return (
    <form onSubmit={handleApply} className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="client-filter-workflow">Workflow</Label>
          <Select
            value={formState.workflowId ?? ""}
            onValueChange={(value) => setFormState((prev) => ({ ...prev, workflowId: value || "" }))}
          >
            <SelectTrigger id="client-filter-workflow" className="w-48">
              <SelectValue placeholder="All workflows" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All workflows</SelectItem>
              {options.workflows.map((workflow) => (
                <SelectItem key={workflow.id} value={workflow.id}>
                  {workflow.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="client-filter-status">Status</Label>
          <Select value={formState.status ?? ""} onValueChange={handleStatusChange}>
            <SelectTrigger id="client-filter-status" className="w-40">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All statuses</SelectItem>
              {options.statuses.map((status) => (
                <SelectItem key={status} value={status}>
                  {status.toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="client-filter-user">User</Label>
          <Select
            value={formState.userId ?? ""}
            onValueChange={(value) => setFormState((prev) => ({ ...prev, userId: value || "" }))}
          >
            <SelectTrigger id="client-filter-user" className="w-48">
              <SelectValue placeholder="All users" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All users</SelectItem>
              <SelectItem value={viewerUserId}>Only me</SelectItem>
              {options.users.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="client-filter-from">From</Label>
          <Input
            id="client-filter-from"
            type="date"
            value={formState.from}
            onChange={(event) => setFormState((prev) => ({ ...prev, from: event.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="client-filter-to">To</Label>
          <Input
            id="client-filter-to"
            type="date"
            value={formState.to}
            onChange={(event) => setFormState((prev) => ({ ...prev, to: event.target.value }))}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          <Button type="submit" size="sm">
            Apply
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={handleClear}>
            Clear
          </Button>
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={handleSetMine}>
          Only my runs
        </Button>
      </div>
    </form>
  );
}
