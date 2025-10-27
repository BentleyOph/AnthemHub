import { Queue } from "bullmq";
import type { ConnectionOptions, QueueOptions } from "bullmq";

export const EXECUTION_QUEUE_NAME = "execution:start";

export interface ExecutionJob {
  executionId: string;
  workflowId: string;
  clientId: string;
  payload: Record<string, unknown>;
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
  options: QueueOptions = {},
): Queue<ExecutionJob> {
  const connection = options.connection ?? resolveRedisConnection();

  return new Queue<ExecutionJob>(EXECUTION_QUEUE_NAME, {
    ...options,
    connection,
  });
}
