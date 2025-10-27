// scripts/seed.ts
import path from "node:path";
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: path.resolve(process.cwd(), ".env.local") });
dotenvConfig();

import { createClient, type User } from "@supabase/supabase-js";

// Resolve environment variables with sensible fallbacks
const env = process.env as Record<string, string | undefined>;
const SUPABASE_URL =
  env.NEXT_SUPABASE_URL || env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  env.NEXT_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
const SEED_ADMIN_EMAIL = env.SEED_ADMIN_EMAIL || "admin@example.com";
const SEED_ADMIN_PASSWORD = env.SEED_ADMIN_PASSWORD || "admin@123"; // change after seeding

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Missing Supabase URL or service role key. Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and NEXT_SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE_KEY)."
  );
  process.exit(1);
}

type UUID = string;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Helper: create or fetch an auth user by email
async function ensureAuthUser(email: string, password: string): Promise<User> {
  // Try to create; if already exists, list and find by email
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { seed: true },
  });
  if (!created.error && created.data?.user) return created.data.user;

  const listRes = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listRes.error) throw listRes.error;
  const existing = listRes.data?.users?.find(
    (u: any) => (u.email || "").toLowerCase() === email.toLowerCase()
  );
  if (!existing) throw created.error || new Error("Failed to create/find user");
  return existing as User;
}

// Helper: upsert user_profile linked to auth.users
async function ensureUserProfile(
  userId: UUID,
  email: string,
  role: "ADMIN" | "CLIENT",
  clientId?: UUID
) {
  const { data: profile, error } = await admin
    .from("user_profile")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error && (error as any).code !== "PGRST116") throw error;

  if (profile) {
    const { error: updErr } = await admin
      .from("user_profile")
      .update({ email, role, client_id: clientId ?? null })
      .eq("id", userId);
    if (updErr) throw updErr;
    return;
  }

  const { error: insErr } = await admin.from("user_profile").insert([
    { id: userId, email, role, client_id: clientId ?? null },
  ]);
  if (insErr) throw insErr;
}

// Helper: fetch row by unique field
async function getOneBy<T>(table: string, field: string, value: string) {
  const { data, error } = await admin
    .from(table)
    .select("*")
    .eq(field, value)
    .limit(1)
    .maybeSingle();
  if (error && (error as any).code !== "PGRST116") throw error;
  return data as T | null;
}

async function main() {
  console.log("🔐 Ensuring admin auth user...");
  const adminUser = await ensureAuthUser(SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD);
  console.log(`   ✔ Admin user id: ${adminUser.id}`);

  console.log("👤 Ensuring admin user_profile...");
  await ensureUserProfile(adminUser.id, SEED_ADMIN_EMAIL, "ADMIN");

  console.log("🏢 Ensuring client: Acme Ltd...");
  const existingClient = await getOneBy<{ id: UUID }>("client", "name", "Acme Ltd");
  let clientId: UUID;
  if (existingClient) {
    clientId = existingClient.id;
  } else {
    const { data, error } = await admin
      .from("client")
      .insert([{ name: "Acme Ltd", email: "ops@acme.test", company: "Acme Ltd" }])
      .select()
      .single();
    if (error) throw error;
    clientId = data.id;
  }
  console.log(`   ✔ Client id: ${clientId}`);

  // (Optional) Create a client user for Acme
  const clientUserEmail = "user@acme.test";
  let clientUser: User;
  try {
    clientUser = await ensureAuthUser(clientUserEmail, "Client@123");
  } catch (e) {
    throw e;
  }
  await ensureUserProfile(clientUser.id, clientUserEmail, "CLIENT", clientId);
  console.log(`   ✔ Client user id: ${clientUser.id}`);

  console.log("⚙️ Ensuring workflow: AI White Paper Generator...");
  const workflowName = "AI White Paper Generator";
  const inputSchema = {
    title: "White Paper Inputs",
    type: "object",
    required: ["topic", "length"],
    properties: {
      topic: { type: "string", title: "Topic" },
      length: { type: "string", title: "Length", enum: ["short", "medium", "long"] },
      tone: { type: "string", title: "Brand Voice", enum: ["professional", "friendly", "technical"] },
      outline_only: { type: "boolean", title: "Outline only?" },
    },
  } as const;

  const existingWf = await getOneBy<{ id: UUID }>("workflow", "name", workflowName);
  let workflowId: UUID;
  if (existingWf) {
    workflowId = existingWf.id;
    const { error: updErr } = await admin
      .from("workflow")
      .update({
        public_desc: "Generate a polished AI-written white paper from a topic.",
        internal_notes: "Seed workflow; replace n8n_webhook_url in production.",
        icon_url: null,
        n8n_webhook_url: "https://example.com/webhook-test/whitepaper",
        input_schema: inputSchema as any,
        is_published: true,
      })
      .eq("id", workflowId);
    if (updErr) throw updErr;
  } else {
    const { data, error } = await admin
      .from("workflow")
      .insert([
        {
          name: workflowName,
          public_desc: "Generate a polished AI-written white paper from a topic.",
          internal_notes: "Seed workflow; replace n8n_webhook_url in production.",
          icon_url: null,
          n8n_webhook_url: "https://example.com/webhook-test/whitepaper",
          input_schema: inputSchema as any,
          is_published: true,
        },
      ])
      .select()
      .single();
    if (error) throw error;
    workflowId = data.id;
  }
  console.log(`   ✔ Workflow id: ${workflowId}`);

  console.log("🔗 Ensuring access: Acme → AI White Paper Generator...");
  // Idempotently ensure mapping exists.
  const { data: accessRow, error: accessErr } = await admin
    .from("client_workflow_access")
    .select("id")
    .eq("client_id", clientId)
    .eq("workflow_id", workflowId)
    .maybeSingle();
  if (accessErr && (accessErr as any).code !== "PGRST116") throw accessErr;

  if (!accessRow) {
    const { error } = await admin
      .from("client_workflow_access")
      .insert([{ client_id: clientId, workflow_id: workflowId }]);
    if (error) throw error;
  }
  console.log("   ✔ Access ensured");

  console.log("▶️ Creating example Execution + Event (SUCCESS)...");
  // Insert an execution if none exists for this client+workflow
  const { data: existingExec, error: findExecErr } = await admin
    .from("execution")
    .select("id")
    .eq("client_id", clientId)
    .eq("workflow_id", workflowId)
    .limit(1)
    .maybeSingle();
  if (findExecErr && (findExecErr as any).code !== "PGRST116") throw findExecErr;

  let executionId: UUID;
  if (!existingExec) {
    const { data: exec, error: insExecErr } = await admin
      .from("execution")
      .insert([
        {
          client_id: clientId,
          workflow_id: workflowId,
          status: "SUCCESS",
          source: "USER",
          input_payload: { topic: "AI in Logistics", length: "medium" },
          output_payload: { summary: "Seeded execution output", score: 0.95 },
          n8n_run_id: "seed-12345",
          started_at: new Date().toISOString(),
          finished_at: new Date().toISOString(),
          result_file_url: "https://files.example.com/whitepaper.pdf",
        },
      ])
      .select()
      .single();
    if (insExecErr) throw insExecErr;
    executionId = exec.id;
  } else {
    executionId = existingExec.id;
  }

  // Insert one timeline event
  const { data: anyEvent, error: findEvtErr } = await admin
    .from("execution_event")
    .select("id")
    .eq("execution_id", executionId)
    .limit(1)
    .maybeSingle();
  if (findEvtErr && (findEvtErr as any).code !== "PGRST116") throw findEvtErr;

  if (!anyEvent) {
    const { error: insEvtErr } = await admin.from("execution_event").insert([
      {
        execution_id: executionId,
        stage: "document_analysis",
        message: "Seed event: parsed inputs",
        raw: { ok: true },
      },
    ]);
    if (insEvtErr) throw insEvtErr;
  }

  console.log("✅ Seed complete.");
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});

