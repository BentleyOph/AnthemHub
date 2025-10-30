import { pathToFileURL } from "node:url";
import { config as dotenvConfig } from "dotenv";
import path from "node:path";

dotenvConfig({ path: path.resolve(process.cwd(), ".env.local") });
import type { Job, Worker, WorkerOptions } from "bullmq";

import { getExecutionWorker, type ExecutionJob } from "@/lib/queue";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";

const supabase = getSupabaseServiceRoleClient();

const REQUEST_TIMEOUT_MS = 30_000;

async function handleExecution(job: Job<ExecutionJob>) {
  const { executionId, workflowId, clientId, input, callbackUrl } = job.data;

  console.info(
    `Processing execution ${executionId} for workflow ${workflowId}`,
    { jobId: job.id },
  );

  const { data: workflow, error: workflowError } = await supabase
    .from("workflow")
    .select("id, n8n_webhook_url")
    .eq("id", workflowId)
    .maybeSingle<{ id: string; n8n_webhook_url: string | null }>();

  if (workflowError) {
    console.error(
      "Failed to load workflow webhook for execution",
      workflowError,
      { executionId, workflowId },
    );
    throw new Error("Unable to load workflow webhook configuration");
  }

  if (!workflow?.n8n_webhook_url) {
    throw new Error("Workflow is missing n8n webhook URL");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(workflow.n8n_webhook_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        execution_id: executionId,
        client_id: clientId,
        workflow_id: workflowId,
        input,
        callback_url: callbackUrl,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await safeReadResponseText(response);
      throw new Error(
        `n8n webhook responded with ${response.status} ${response.statusText}${
          text ? `: ${text}` : ""
        }`,
      );
    }

    console.info("Successfully dispatched execution to n8n", {
      executionId,
      workflowId,
      jobId: job.id,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Timed out waiting for n8n webhook response");
    }

    throw error instanceof Error
      ? error
      : new Error("Unknown error while invoking n8n webhook");
  } finally {
    clearTimeout(timeout);
  }
}

async function safeReadResponseText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch (error) {
    console.warn("Failed to read error response from n8n webhook", error);
    return "";
  }
}

async function markExecutionFailed(
  job: Job<ExecutionJob> | undefined,
  error: Error,
) {
  if (!job) {
    return;
  }

  const attemptsAllowed = job.opts.attempts ?? 1;
  if (job.attemptsMade < attemptsAllowed) {
    return;
  }

  console.error("Marking execution as failed after retry exhaustion", {
    executionId: job.data.executionId,
    workflowId: job.data.workflowId,
    attemptsMade: job.attemptsMade,
    message: error.message,
  });

  const { error: updateError } = await supabase
    .from("execution")
    .update({
      status: "ERROR",
      error_message: error.message.slice(0, 1024),
      finished_at: new Date().toISOString(),
    })
    .eq("id", job.data.executionId);

  if (updateError) {
    console.error("Failed to mark execution as ERROR", updateError, {
      executionId: job.data.executionId,
    });
  }
}

export function createExecutionWorker(): Worker<ExecutionJob> {
  const worker = getExecutionWorker(handleExecution, {
    concurrency: 5,
  } as WorkerOptions);

  worker.on("failed", async (job, error) => {
    if (error instanceof Error) {
      await markExecutionFailed(job ?? undefined, error);
    } else if (job) {
      await markExecutionFailed(
        job,
        new Error("Unknown worker failure without error instance"),
      );
    }
  });

  worker.on("error", (error) => {
    console.error("Execution worker encountered an error", error);
  });

  worker.on("completed", (job) => {
    console.info("Execution job completed", {
      executionId: job.data.executionId,
      workflowId: job.data.workflowId,
      jobId: job.id,
    });
  });

  return worker;
}

const entryArg = process.argv[1];
const currentModuleUrl = entryArg ? pathToFileURL(entryArg).href : null;

if (currentModuleUrl && import.meta.url === currentModuleUrl) {
  console.info("Bootstrapping execution worker process");
  createExecutionWorker();
}
