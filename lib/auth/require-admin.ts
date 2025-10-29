import type { User } from "@supabase/supabase-js";

import { AccessDeniedError } from "./guards";
import {
  getSupabaseServerClient,
  getSupabaseServiceRoleClient,
} from "../supabase/server";

/**
 * Ensures the current request is authenticated as an admin user and returns the verified user object.
 * Falls back to querying the `user_profile` table when role metadata is missing on the JWT.
 */
export async function requireAdminSession(): Promise<User> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    console.error("Failed to retrieve Supabase user", error);
    throw new AccessDeniedError();
  }

  const user = data.user;
  if (!user) {
    throw new AccessDeniedError();
  }

  const metadataRole = user.app_metadata?.role;
  if (metadataRole === "ADMIN") {
    return user;
  }

  try {
    const service = getSupabaseServiceRoleClient();
    const { data: profile, error: profileErr } = await service
      .from("user_profile")
      .select("role")
      .eq("id", user.id)
      .maybeSingle<{ role: "ADMIN" | "CLIENT" | null }>();

    if (profileErr) {
      console.error("Failed to load user profile for admin validation", profileErr);
      throw new AccessDeniedError();
    }

    if (profile?.role !== "ADMIN") {
      throw new AccessDeniedError();
    }

    return user;
  } catch (cause) {
    if (cause instanceof AccessDeniedError) {
      throw cause;
    }

    console.error("Unexpected error validating admin session", cause);
    throw new AccessDeniedError();
  }
}
