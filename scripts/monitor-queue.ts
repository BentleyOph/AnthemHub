// scripts/monitor-queue.ts
import { getExecutionQueue, EXECUTION_QUEUE_NAME, resolveRedisConnection } from "@/lib/queue";
import { QueueEvents } from "bullmq";
import { config as dotenvConfig } from "dotenv";
import path from "node:path";

dotenvConfig({ path: path.resolve(process.cwd(), ".env.local") });
dotenvConfig();

async function main() {
  console.log("Starting queue monitor... (Press Ctrl+C to exit)");
  const queue = getExecutionQueue();
  const events = new QueueEvents(EXECUTION_QUEUE_NAME, { connection: resolveRedisConnection() });

  // Listen for when a job is added to the queue
  events.on('waiting', ({ jobId }) => {
    console.log(`[EVENT] Job added to queue: ${jobId}`);
  });

  // Listen for when a job becomes active (a worker picked it up)
  events.on('active', ({ jobId }) => {
    console.log(`[EVENT] Job active: ${jobId}`);
  });

  // Listen for when a job completes
  events.on('completed', ({ jobId }) => {
    console.log(`[EVENT] Job completed: ${jobId}`);
  });

  // Listen for when a job fails
  events.on('failed', ({ jobId, failedReason }) => {
    console.error(`[EVENT] Job failed: ${jobId}`, failedReason);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
