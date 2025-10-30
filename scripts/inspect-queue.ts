import { getExecutionQueue } from "@/lib/queue";
import { config as dotenvConfig } from "dotenv";
import path from "node:path";

dotenvConfig({ path: path.resolve(process.cwd(), ".env.local") });
dotenvConfig();



async function main() {
  const queue = getExecutionQueue();
  const counts = await queue.getJobCounts();
  console.log(counts);
  const jobs = await queue.getWaiting(0, 10);
  console.log(jobs.map((job) => ({ id: job.id, data: job.data })));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});