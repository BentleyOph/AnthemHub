import { notFound } from "next/navigation";
import { z } from "zod";

import { AdminExecutionDetail } from "@/components/admin/executions/execution-detail";
import {
  getExecutionDetail,
  listExecutionEvents,
} from "@/lib/admin/executions/data";

type PageProps = {
  params: Promise<{ id: string }>;
};

const PATH_SCHEMA = z.object({ id: z.string().uuid() });
const DEFAULT_EVENT_PAGE_SIZE = 50;
const TIMEZONE = process.env.APP_TIMEZONE ?? "Africa/Nairobi";

export default async function AdminExecutionDetailPage({ params }: PageProps) {
  const resolvedParams = await params;
  const parsedParams = PATH_SCHEMA.safeParse(resolvedParams);

  if (!parsedParams.success) {
    notFound();
  }

  const { id } = parsedParams.data;

  const execution = await getExecutionDetail(id);

  if (!execution) {
    notFound();
  }

  const events = await listExecutionEvents(id, 1, DEFAULT_EVENT_PAGE_SIZE);

  const componentKey = `${execution.id}-${execution.status}-${events.total}`;

  return (
    <AdminExecutionDetail
      key={componentKey}
      execution={execution}
      events={events}
      timezone={TIMEZONE}
    />
  );
}
