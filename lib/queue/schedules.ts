import cronParser from "cron-parser";

import { getScheduleQueue, type ScheduleJob } from "@/lib/queue";

const SCHEDULE_JOB_NAME = "schedule:tick";

export async function registerScheduleJob(args: {
  scheduleId: string;
  cronExpr: string;
  timezone: string;
}): Promise<string> {
  const queue = getScheduleQueue();

  // Validate cron + timezone eagerly to provide clear errors
  cronParser.parse(args.cronExpr, { tz: args.timezone });

  const job = await queue.add(
    SCHEDULE_JOB_NAME,
    { scheduleId: args.scheduleId } satisfies ScheduleJob,
    {
      jobId: args.scheduleId,
      repeat: {
        pattern: args.cronExpr,
        tz: args.timezone,
      },
      removeOnComplete: true,
      removeOnFail: true,
    },
  );

  if (!job.repeatJobKey) {
    throw new Error("Unable to determine repeat job key for schedule.");
  }

  return job.repeatJobKey;
}

export async function removeScheduleJob(repeatJobKey: string): Promise<void> {
  const queue = getScheduleQueue();
  await queue.removeRepeatableByKey(repeatJobKey);
}
