// scripts/monitor-queue.ts
import { getExecutionQueue } from "@/lib/queue";
import { config as dotenvConfig } from "dotenv";
import path from "node:path";

dotenvConfig({ path: path.resolve(process.cwd(), ".env.local") });
dotenvConfig();

async function main() {
  console.log("Starting queue monitor... (Press Ctrl+C to exit)");
  const queue = getExecutionQueue();

  // Listen for when a job is added to the queue
  queue.on('waiting', (job) => {
    console.log(`[EVENT] Job added to queue: ${job.id}`);
  });

  // Listen for when a job becomes active (a worker picked it up)
  queue.on('active', (job) => {
    console.log(`[EVENT] Job active: ${job.id} for execution ${job.data.executionId}`);
  });

  // Listen for when a job completes
  queue.on('completed', (job, returnValue) => {
    console.log(`[EVENT] Job completed: ${job.id}`);
  });

  // Listen for when a job fails
  queue.on('failed', (job, err) => {
    console.error(`[EVENT] Job failed: ${job.id}`, err);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});