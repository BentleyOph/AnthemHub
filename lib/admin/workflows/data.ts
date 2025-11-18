import "server-only";

import type { PostgrestSingleResponse } from "@supabase/postgrest-js";
import { z } from "zod";

import {
  resolveWorkflowIconUrl,
  uploadWorkflowIcon as storeWorkflowIcon,
  WorkflowIconError,
} from "@/lib/storage/workflow-icons";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { parseJsonSchema, type JsonSchema } from "@/lib/schema/jsonschema";

function escapeForLike(value: string): string {
  return value.replace(/[%_\\]/g, (match) => `\\${match}`);
}

const workflowListParamsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  per_page: z.coerce.number().int().positive().max(100).default(20),
  q: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .optional(),
  status: z
    .enum(["ALL", "PUBLISHED", "DRAFT"])
    .optional()
    .default("ALL"),
});

export type WorkflowListParams = z.input<typeof workflowListParamsSchema>;

export type WorkflowListNormalized = {
  page: number;
  perPage: number;
  search: string | null;
  status: "ALL" | "PUBLISHED" | "DRAFT";
};

export type WorkflowListItem = {
  id: string;
  name: string;
  description: string;
  iconUrl: string | null;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  totalRuns30d: number;
  successRate30d: number | null;
  avgRuntimeSeconds: number | null;
  activeSchedules: number;
};

export type WorkflowListResult = {
  data: WorkflowListItem[];
  page: number;
  perPage: number;
  total: number;
  nextPage: number | null;
  prevPage: number | null;
  search: string | null;
  status: "ALL" | "PUBLISHED" | "DRAFT";
};

export const workflowUpsertSchema = z.object({
  name: z.string().trim().min(2).max(255),
  publicDesc: z.string().trim().min(10).max(2000),
  internalNotes: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  n8nWebhookUrl: z.string().trim().url().max(2048),
  inputSchema: z.union([z.string().trim().min(2), z.record(z.string(), z.any())]),
  isPublished: z.boolean().default(false),
});

export type WorkflowUpsertInput = z.input<typeof workflowUpsertSchema> & {
  iconFile?: File | null;
  removeIcon?: boolean;
};

type WorkflowUpsertParsed = {
  name: string;
  public_desc: string;
  internal_notes: string | null;
  n8n_webhook_url: string;
  input_schema: JsonSchema;
  is_published: boolean;
  icon_url?: string | null;
};

type WorkflowDetailRow = {
  id: string;
  name: string;
  public_desc: string;
  internal_notes: string | null;
  icon_url: string | null;
  n8n_webhook_url: string;
  input_schema: JsonSchema;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

export type WorkflowDetail = {
  id: string;
  name: string;
  description: string;
  internalNotes: string | null;
  iconUrl: string | null;
  n8nWebhookUrl: string;
  inputSchema: JsonSchema;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
};

function parseInputSchema(value: unknown): JsonSchema {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parseJsonSchema(parsed);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new z.ZodError([
          {
            code: z.ZodIssueCode.custom,
            path: ["inputSchema"],
            message: "Input schema must be valid JSON.",
          },
        ]);
      }
      throw error;
    }
  }

  try {
    return parseJsonSchema(value);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new z.ZodError(
        error.issues.map((issue) => ({
          ...issue,
          path: ["inputSchema", ...issue.path],
        })),
      );
    }

    throw error;
  }
}

function normalizeUpsertPayload(
  payload: WorkflowUpsertInput,
  iconPath?: string | null,
): WorkflowUpsertParsed {
  const parsed = workflowUpsertSchema.parse(payload);
  const shouldRemoveIcon = Boolean(payload.removeIcon);

  return {
    name: parsed.name,
    public_desc: parsed.publicDesc,
    internal_notes: parsed.internalNotes ?? null,
    n8n_webhook_url: parsed.n8nWebhookUrl,
    input_schema: parseInputSchema(parsed.inputSchema),
    is_published: parsed.isPublished ?? false,
    icon_url: iconPath ?? (shouldRemoveIcon ? null : undefined),
  };
}

export function normalizeWorkflowListParams(
  params: WorkflowListParams,
): WorkflowListNormalized {
  const parsed = workflowListParamsSchema.parse(params);
  return {
    page: parsed.page,
    perPage: parsed.per_page,
    search: parsed.q ?? null,
    status: parsed.status ?? "ALL",
  };
}

export async function listWorkflows(
  params: WorkflowListNormalized,
): Promise<WorkflowListResult> {
  const service = getSupabaseServiceRoleClient();

  let query = service
    .from("workflow")
    .select(
      `
        id,
        name,
        public_desc,
        icon_url,
        is_published,
        created_at,
        updated_at
      `,
      { count: "exact" },
    )
    .order("updated_at", { ascending: false });

  if (params.search) {
    const escaped = escapeForLike(params.search);
    query = query.ilike("name", `%${escaped}%`);
  }

  if (params.status === "PUBLISHED") {
    query = query.eq("is_published", true);
  } else if (params.status === "DRAFT") {
    query = query.eq("is_published", false);
  }

  const fromIndex = (params.page - 1) * params.perPage;
  const toIndex = fromIndex + params.perPage - 1;

  const { data, error, count } = await query.range(fromIndex, toIndex);

  if (error) {
    throw error;
  }

  const rows = data ?? [];
  const workflowIds = rows.map((row) => row.id);

  type WorkflowMetricsRow = {
    workflow_id: string;
    total_runs_30d: number | null;
    success_rate_30d: number | null;
    avg_runtime_seconds: number | null;
    active_schedules: number | null;
  };

  const metricsByWorkflow = new Map<string, WorkflowMetricsRow>();

  if (workflowIds.length > 0) {
    const { data: metricsRows, error: metricsError } =
      (await service.rpc("get_workflow_admin_metrics", {
        workflow_ids: workflowIds,
      })) as PostgrestSingleResponse<WorkflowMetricsRow[]>;

    if (metricsError) {
      console.error("Failed to load workflow metrics", metricsError);
    } else {
      for (const row of metricsRows ?? []) {
        if (row?.workflow_id) {
          metricsByWorkflow.set(row.workflow_id, row);
        }
      }
    }
  }

  const items = await Promise.all(
    rows.map(async (row): Promise<WorkflowListItem> => {
      const metrics = metricsByWorkflow.get(row.id);
      return {
        id: row.id,
        name: row.name,
        description: row.public_desc,
        iconUrl: await resolveWorkflowIconUrl(row.icon_url),
        isPublished: row.is_published,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        totalRuns30d: metrics?.total_runs_30d ?? 0,
        successRate30d: metrics?.success_rate_30d ?? null,
        avgRuntimeSeconds: metrics?.avg_runtime_seconds ?? null,
        activeSchedules: metrics?.active_schedules ?? 0,
      };
    }),
  );

  const total = count ?? rows.length;
  const nextPage =
    params.page * params.perPage < total ? params.page + 1 : null;
  const prevPage = params.page > 1 ? params.page - 1 : null;

  return {
    data: items,
    page: params.page,
    perPage: params.perPage,
    total,
    nextPage,
    prevPage,
    search: params.search,
    status: params.status,
  };
}

export async function getWorkflowDetail(id: string): Promise<WorkflowDetail | null> {
  const service = getSupabaseServiceRoleClient();
  const { data, error } = await service
    .from("workflow")
    .select(
      `
        id,
        name,
        public_desc,
        internal_notes,
        icon_url,
        n8n_webhook_url,
        input_schema,
        is_published,
        created_at,
        updated_at
      `,
    )
    .eq("id", id)
    .maybeSingle<WorkflowDetailRow>();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    name: data.name,
    description: data.public_desc,
    internalNotes: data.internal_notes,
    iconUrl: await resolveWorkflowIconUrl(data.icon_url),
    n8nWebhookUrl: data.n8n_webhook_url,
    inputSchema: data.input_schema,
    isPublished: data.is_published,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function createWorkflow(
  payload: WorkflowUpsertInput,
): Promise<WorkflowDetail> {
  let iconPath: string | undefined;
  if (payload.iconFile instanceof File) {
    try {
      iconPath = await storeWorkflowIcon(payload.iconFile);
    } catch (error) {
      if (error instanceof WorkflowIconError) {
        throw new z.ZodError([
          {
            code: z.ZodIssueCode.custom,
            path: ["icon"],
            message: error.message,
          },
        ]);
      }
      throw error;
    }
  }
  const body = normalizeUpsertPayload(payload, iconPath);

  const service = getSupabaseServiceRoleClient();
  const { data, error } = await service
    .from("workflow")
    .insert([body])
    .select(
      `
        id,
        name,
        public_desc,
        internal_notes,
        icon_url,
        n8n_webhook_url,
        input_schema,
        is_published,
        created_at,
        updated_at
      `,
    )
    .single<WorkflowDetailRow>();

  if (error) {
    throw error;
  }

  return {
    id: data.id,
    name: data.name,
    description: data.public_desc,
    internalNotes: data.internal_notes,
    iconUrl: await resolveWorkflowIconUrl(data.icon_url),
    n8nWebhookUrl: data.n8n_webhook_url,
    inputSchema: data.input_schema,
    isPublished: data.is_published,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function updateWorkflow(
  id: string,
  payload: WorkflowUpsertInput,
): Promise<WorkflowDetail> {
  let iconPath: string | undefined;
  if (payload.iconFile instanceof File) {
    try {
      iconPath = await storeWorkflowIcon(payload.iconFile);
    } catch (error) {
      if (error instanceof WorkflowIconError) {
        throw new z.ZodError([
          {
            code: z.ZodIssueCode.custom,
            path: ["icon"],
            message: error.message,
          },
        ]);
      }
      throw error;
    }
  }
  const body = normalizeUpsertPayload(payload, iconPath);

  const service = getSupabaseServiceRoleClient();
  const { data, error } = await service
    .from("workflow")
    .update(body)
    .eq("id", id)
    .select(
      `
        id,
        name,
        public_desc,
        internal_notes,
        icon_url,
        n8n_webhook_url,
        input_schema,
        is_published,
        created_at,
        updated_at
      `,
    )
    .single<WorkflowDetailRow>();

  if (error) {
    throw error;
  }

  return {
    id: data.id,
    name: data.name,
    description: data.public_desc,
    internalNotes: data.internal_notes,
    iconUrl: await resolveWorkflowIconUrl(data.icon_url),
    n8nWebhookUrl: data.n8n_webhook_url,
    inputSchema: data.input_schema,
    isPublished: data.is_published,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function deleteWorkflow(id: string): Promise<void> {
  const service = getSupabaseServiceRoleClient();
  const { error } = await service.from("workflow").delete().eq("id", id);

  if (error) {
    throw error;
  }
}
