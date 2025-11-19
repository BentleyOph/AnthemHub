"use client";

import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";

import type { ClientOption } from "@/lib/admin/users/types";
import { createUserAction, type CreateUserActionState } from "@/app/admin/users/actions";

const initialState: CreateUserActionState = { status: "idle" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="rounded bg-black text-white px-3 py-1 text-sm"
      disabled={pending}
    >
      {pending ? "Creating…" : "Create user"}
    </button>
  );
}

export function CreateUserForm({ clients }: { clients: ClientOption[] }) {
  const [state, formAction] = useFormState(createUserAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <div className="rounded-lg border p-4">
      <h2 className="text-lg font-semibold">Create user</h2>
      <p className="text-sm text-muted-foreground">Provision a user with credentials.</p>
      <form ref={formRef} action={formAction} className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor="new-user-name">
            Name
          </label>
          <input
            id="new-user-name"
            name="name"
            type="text"
            required
            className="rounded border px-3 py-2 text-sm"
            placeholder="Jane Doe"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor="new-user-email">
            Email
          </label>
          <input
            id="new-user-email"
            name="email"
            type="email"
            required
            className="rounded border px-3 py-2 text-sm"
            placeholder="jane@example.com"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor="new-user-password">
            Password
          </label>
          <input
            id="new-user-password"
            name="password"
            type="password"
            required
            minLength={8}
            className="rounded border px-3 py-2 text-sm"
            placeholder="At least 8 characters"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor="new-user-role">
            Role
          </label>
          <select
            id="new-user-role"
            name="role"
            className="rounded border px-3 py-2 text-sm"
            defaultValue="CLIENT"
            required
          >
            <option value="CLIENT">Client</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>
        <div className="flex flex-col gap-1 md:col-span-2">
          <label className="text-sm font-medium" htmlFor="new-user-client">
            Client (optional)
          </label>
          <select
            id="new-user-client"
            name="client_id"
            className="rounded border px-3 py-2 text-sm"
            defaultValue=""
          >
            <option value="">Unassigned</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2 flex items-center gap-3">
          <SubmitButton />
          {state.status === "error" && (
            <p className="text-sm text-destructive">{state.message ?? "Failed to create user."}</p>
          )}
          {state.status === "success" && (
            <p className="text-sm text-green-600">User created successfully.</p>
          )}
        </div>
      </form>
    </div>
  );
}
