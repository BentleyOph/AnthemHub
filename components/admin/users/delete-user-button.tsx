"use client";

import { useTransition } from "react";

import { deleteUserAction } from "@/app/admin/users/actions";

type Props = {
  userId: string;
  email?: string | null;
  disabled?: boolean;
};

export function DeleteUserButton({ userId, email, disabled }: Props) {
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    const label = email ?? "this user";
    if (!window.confirm(`Delete ${label}? This action cannot be undone.`)) {
      return;
    }
    startTransition(async () => {
      await deleteUserAction(userId);
    });
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      className="text-xs text-destructive hover:underline disabled:opacity-50"
      disabled={disabled || isPending}
    >
      {isPending ? "Deleting…" : "Delete"}
    </button>
  );
}
