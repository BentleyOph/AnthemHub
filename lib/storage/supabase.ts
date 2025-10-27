import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

let serviceRoleClient: SupabaseClient | null = null;

function resolveServiceRoleEnv(): { supabaseUrl: string; serviceRoleKey: string } {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }

  return { supabaseUrl, serviceRoleKey };
}

function getServiceRoleClient(): SupabaseClient {
  if (!serviceRoleClient) {
    const { supabaseUrl, serviceRoleKey } = resolveServiceRoleEnv();
    serviceRoleClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return serviceRoleClient;
}

type UploadBody = Blob | ArrayBuffer | ArrayBufferView | Buffer;

export interface UploadOptions {
  contentType?: string;
  upsert?: boolean;
}

export async function uploadToSupabase(
  bucket: string,
  path: string,
  body: UploadBody,
  options: UploadOptions = {},
) {
  const client = getServiceRoleClient();

  const response = await client.storage.from(bucket).upload(path, body, {
    cacheControl: "3600",
    contentType: options.contentType,
    upsert: options.upsert ?? false,
  });

  if (response.error) {
    throw response.error;
  }

  return response.data;
}

export async function createSignedUrl(
  bucket: string,
  path: string,
  expiresInSeconds: number,
) {
  const client = getServiceRoleClient();
  const response = await client.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);

  if (response.error) {
    throw response.error;
  }

  return response.data;
}
