"use server";

import { getSupabaseServerClient, getSupabaseServiceRoleClient } from "../supabase/server";

/**
 * Ensure a row exists in user_profile for the current authenticated user.
 * Idempotent: will no-op if a row already exists.
 * Defaults new users to role CLIENT and null client_id.
 */
export async function ensureUserProfile() {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;

  if (!user) return;

  const admin = getSupabaseServiceRoleClient();
  const { data: existingAdmin, error: adminSelectError } = await admin
    .from("user_profile")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (adminSelectError) {
    throw adminSelectError;
  }

  if (existingAdmin) {
    return;
  }

  const payload = {
    id: user.id,
    email: user.email,
    role: "CLIENT" as const,
    client_id: null as string | null,
    name:
      (user.user_metadata as Record<string, unknown> | undefined)?.full_name ||
      user.email ||
      null,
  };

  const { error: insertError } = await admin.from("user_profile").insert(payload);

  if (insertError && insertError.code !== "23505") {
    throw insertError;
  }
}
