import type { Job } from "bullmq";
import { Worker } from "bullmq";
import {
  EXECUTION_QUEUE_NAME,
  resolveRedisConnection,
  type ExecutionJob,
} from "@/lib/queue";

async function handleExecution(job: Job<ExecutionJob>) {
  console.info(
    `Processing execution ${job.data.executionId} for workflow ${job.data.workflowId}`,
    { jobId: job.id },
  );

  console.debug("Execution job payload", {
    callbackUrl: job.data.callbackUrl,
    clientId: job.data.clientId,
    startedBy: job.data.startedByUserId,
  });
}

export function createExecutionWorker(): Worker<ExecutionJob> {
  return new Worker<ExecutionJob>(EXECUTION_QUEUE_NAME, handleExecution, {
    connection: resolveRedisConnection(),
  });
}
