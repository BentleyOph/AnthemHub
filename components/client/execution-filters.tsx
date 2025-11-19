"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { ClientExecutionFilterOptions, ClientExecutionStatus } from "@/lib/client/executions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SingleDatePicker } from "@/components/ui/date-picker";
import { dateToBoundaryIso, parseISODate } from "@/lib/dates";

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
  from: Date | null;
  to: Date | null;
};

function createFormStateFromFilters(filters: ClientExecutionFiltersState): FormState {
  return {
    workflowId: filters.workflowId ?? "",
    status: filters.status ?? "",
    userId: filters.userId ?? "",
    from: parseISODate(filters.from),
    to: parseISODate(filters.to),
  } satisfies FormState;
}

function createEmptyFormState(): FormState {
  return {
    workflowId: "",
    status: "",
    userId: "",
    from: null,
    to: null,
  } satisfies FormState;
}

const serializeFormState = (state: FormState): string =>
  [
    state.workflowId,
    state.status,
    state.userId,
    state.from ? state.from.toISOString() : "",
    state.to ? state.to.toISOString() : "",
  ].join("|");

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

    const fromIso = dateToBoundaryIso(formState.from, "start");
    const toIso = dateToBoundaryIso(formState.to, "end");

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
          <SingleDatePicker
            id="client-filter-from"
            className="w-40"
            value={formState.from}
            onChange={(date) => setFormState((prev) => ({ ...prev, from: date }))}
            maxDate={formState.to ?? undefined}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="client-filter-to">To</Label>
          <SingleDatePicker
            id="client-filter-to"
            className="w-40"
            value={formState.to}
            onChange={(date) => setFormState((prev) => ({ ...prev, to: date }))}
            minDate={formState.from ?? undefined}
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
