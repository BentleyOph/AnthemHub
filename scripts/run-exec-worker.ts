import { createExecutionWorker } from "@/workers/exec-start";
import { config as dotenvConfig } from "dotenv";
import path from "node:path";

dotenvConfig({ path: path.resolve(process.cwd(), ".env.local") });
dotenvConfig();



createExecutionWorker().on("error", (err) => {
  console.error("[exec-worker] error", err);
});