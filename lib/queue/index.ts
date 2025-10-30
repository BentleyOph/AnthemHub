import { Queue, Worker } from "bullmq";
import type {
  ConnectionOptions,
  QueueOptions,
  WorkerOptions,
  Processor,
} from "bullmq";

export const EXECUTION_QUEUE_NAME = "execution-start";

export interface ExecutionJob {
  executionId: string;
  workflowId: string;
  clientId: string;
  input: Record<string, unknown>;
  callbackUrl: string;
  startedByUserId: string;
}

export function resolveRedisConnection(): ConnectionOptions {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    throw new Error("REDIS_URL must be set");
  }

  const url = new URL(redisUrl);
  const connection: ConnectionOptions = {
    host: url.hostname,
    port: Number(url.port || "6379"),
  };

  if (url.password) {
    connection.password = url.password;
  }

  if (url.username) {
    connection.username = url.username;
  }

  if (url.pathname.length > 1) {
    connection.db = Number(url.pathname.slice(1));
  }

  if (url.protocol === "rediss:") {
    connection.tls = {};
  }

  return connection;
}

export function createExecutionQueue(
  options: Partial<QueueOptions> = {},
): Queue<ExecutionJob> {
  const connection = options.connection ?? resolveRedisConnection();

  return new Queue<ExecutionJob>(EXECUTION_QUEUE_NAME, {
    ...options,
    connection,
  });
}

let executionQueueInstance: Queue<ExecutionJob> | null = null;
let executionWorkerInstance: Worker<ExecutionJob> | null = null;

export function getExecutionQueue(): Queue<ExecutionJob> {
  if (!executionQueueInstance) {
    executionQueueInstance = createExecutionQueue({
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
        removeOnComplete: {
          age: 3600, // Keep completed jobs for 1 hour
          count: 100, // Keep max 100 completed jobs
        },
        removeOnFail: {
          age: 86400, // Keep failed jobs for 24 hours
          count: 500, // Keep max 500 failed jobs
        },
      },
    });
  }

  return executionQueueInstance;
}

export function getExecutionWorker(
  processor: Processor<ExecutionJob, unknown, string>,
  options: Partial<WorkerOptions> = {},
): Worker<ExecutionJob> {
  if (!executionWorkerInstance) {
    const connection = options.connection ?? resolveRedisConnection();
    executionWorkerInstance = new Worker<ExecutionJob>(
      EXECUTION_QUEUE_NAME,
      processor,
      {
        ...options,
        connection,
      },
    );
  }

  return executionWorkerInstance;
}
