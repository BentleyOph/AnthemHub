'use client';

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { AccessRequestStatus } from "@/lib/access-requests/constants";
import { Button } from "@/components/ui/button";

interface RequestAccessButtonProps {
  workflowId: string;
  workflowName: string;
  status: AccessRequestStatus | null;
  disabled?: boolean;
  disabledReason?: string | null;
}

function resolveLabel(status: AccessRequestStatus | null, isPending: boolean) {
  if (isPending) {
    return "Requesting...";
  }

  if (!status) {
    return "Request access";
  }

  if (status === "PENDING") {
    return "Requested";
  }

  if (status === "DENIED") {
    return "Request again";
  }

  return "Request access";
}

function resolveVariant(status: AccessRequestStatus | null): React.ComponentProps<
  typeof Button
>["variant"] {
  if (status === "DENIED") {
    return "outline";
  }

  if (status === "PENDING") {
    return "secondary";
  }

  return "default";
}

export function RequestAccessButton({
  workflowId,
  workflowName,
  status,
  disabled = false,
  disabledReason,
}: RequestAccessButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const variant = resolveVariant(status);
  const label = resolveLabel(status, isPending);
  const isDisabled =
    disabled ||
    isPending ||
    status === "PENDING" ||
    status === "APPROVED";

  const title = disabledReason ?? undefined;

  return (
    <Button
      size="sm"
      variant={variant}
      aria-disabled={isDisabled}
      disabled={isDisabled}
      title={title}
      onClick={() => {
        if (isDisabled) {
          if (disabledReason) {
            toast.info(disabledReason);
          }
          return;
        }

        startTransition(async () => {
          try {
            const response = await fetch("/api/requests/access", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ workflowId }),
            });

            if (!response.ok) {
              const body = await response.json().catch(() => null);
              const message =
                (body && typeof body.error === "string" && body.error.length > 0
                  ? body.error
                  : null) ?? "Failed to submit access request.";
              toast.error(message);
              return;
            }

            toast.success(`Requested access to ${workflowName}.`);
            router.refresh();
          } catch (error) {
            console.error("Failed to submit access request", error);
            toast.error("Failed to submit access request.");
          }
        });
      }}
    >
      {label}
    </Button>
  );
}
