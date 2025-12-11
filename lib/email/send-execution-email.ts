import { render } from "@react-email/components";

import { getResendClient, getFromEmail, getAppUrl } from "./client";
import { ExecutionSuccessEmail } from "./templates/execution-success";
import { ExecutionFailureEmail } from "./templates/execution-failure";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

const TIMEZONE = process.env.APP_TIMEZONE ?? "Africa/Nairobi";

interface ExecutionEmailData {
  id: string;
  status: "SUCCESS" | "ERROR";
  started_by_email: string | null;
  started_by_name: string | null;
  started_at: string;
  finished_at: string | null;
  error_message: string | null;
  workflow: {
    name: string;
  } | null;
}

/**
 * Send an email notification for a completed or failed execution.
 * This function is designed to be fire-and-forget - it catches all errors
 * and logs them without throwing, so it won't block the execution flow.
 */
export async function sendExecutionNotificationEmail(
  executionId: string,
): Promise<void> {
  try {
    const supabase = getSupabaseServiceRoleClient();

    const { data: execution, error: fetchError } = await supabase
      .from("execution")
      .select(`
        id,
        status,
        started_by_email,
        started_by_name,
        started_at,
        finished_at,
        error_message,
        workflow:workflow(name)
      `)
      .eq("id", executionId)
      .maybeSingle<ExecutionEmailData>();

    if (fetchError) {
      console.error("[Email] Failed to fetch execution for email", {
        executionId,
        error: fetchError.message,
      });
      return;
    }

    if (!execution) {
      console.warn("[Email] Execution not found, skipping email", {
        executionId,
      });
      return;
    }

    if (!execution.started_by_email) {
      console.info("[Email] No email address for execution initiator, skipping", {
        executionId,
      });
      return;
    }

    if (execution.status !== "SUCCESS" && execution.status !== "ERROR") {
      console.info("[Email] Execution not in terminal state, skipping email", {
        executionId,
        status: execution.status,
      });
      return;
    }

    const appUrl = getAppUrl();
    const userName = execution.started_by_name || "User";
    const workflowName = execution.workflow?.name || "Workflow";

    const startedAt = formatDateTime(execution.started_at);
    const finishedAt = execution.finished_at
      ? formatDateTime(execution.finished_at)
      : formatDateTime(new Date().toISOString());

    const duration = execution.finished_at
      ? calculateDuration(execution.started_at, execution.finished_at)
      : "Unknown";

    let subject: string;
    let html: string;

    if (execution.status === "SUCCESS") {
      subject = `✓ Workflow "${workflowName}" completed successfully`;
      html = await render(
        ExecutionSuccessEmail({
          userName,
          workflowName,
          executionId: execution.id,
          startedAt,
          finishedAt,
          duration,
          appUrl,
        }),
      );
    } else {
      subject = `✕ Workflow "${workflowName}" failed`;
      html = await render(
        ExecutionFailureEmail({
          userName,
          workflowName,
          executionId: execution.id,
          startedAt,
          failedAt: finishedAt,
          errorMessage: execution.error_message || "An unexpected error occurred",
          appUrl,
        }),
      );
    }

    const resend = getResendClient();
    const fromEmail = getFromEmail();

    const { error: sendError } = await resend.emails.send({
      from: fromEmail,
      to: execution.started_by_email,
      subject,
      html,
    });

    if (sendError) {
      console.error("[Email] Failed to send execution notification email", {
        executionId,
        recipient: execution.started_by_email,
        status: execution.status,
        error: sendError.message,
      });
      return;
    }

    console.info("[Email] Sent execution notification email", {
      executionId,
      recipient: execution.started_by_email,
      status: execution.status,
      workflowName,
    });
  } catch (error) {
    console.error("[Email] Unexpected error sending execution notification", {
      executionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function formatDateTime(isoString: string): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: TIMEZONE,
    });
    return formatter.format(new Date(isoString));
  } catch {
    return isoString;
  }
}

function calculateDuration(startIso: string, endIso: string): string {
  try {
    const startMs = new Date(startIso).getTime();
    const endMs = new Date(endIso).getTime();
    const diffMs = endMs - startMs;

    if (diffMs < 0) {
      return "Unknown";
    }

    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      const remainingMinutes = minutes % 60;
      return `${hours}h ${remainingMinutes}m`;
    }

    if (minutes > 0) {
      const remainingSeconds = seconds % 60;
      return `${minutes}m ${remainingSeconds}s`;
    }

    return `${seconds}s`;
  } catch {
    return "Unknown";
  }
}
