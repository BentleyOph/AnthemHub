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

  // Check existence
  const { data: existing, error: selectError } = await supabase
    .from("user_profile")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (selectError) {
    // As a fallback (e.g., strict RLS on select), try service role to check
    const admin = getSupabaseServiceRoleClient();
    const { data: existingAdmin } = await admin
      .from("user_profile")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    if (existingAdmin) return; // already exists
  } else if (existing) {
    return; // already exists
  }

  // Attempt insert as the user (preferred, respects RLS)
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

  const { error: insertError } = await supabase.from("user_profile").insert(payload);

  if (insertError) {
    // Fallback insert via service role (guarded on server)
    const admin = getSupabaseServiceRoleClient();
    await admin.from("user_profile").upsert(payload, { onConflict: "id" });
  }
}
