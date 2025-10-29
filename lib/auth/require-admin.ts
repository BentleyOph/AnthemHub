import type { Session } from "@supabase/supabase-js";

import { AccessDeniedError } from "./guards";
import {
  getSupabaseServerClient,
  getSupabaseServiceRoleClient,
} from "../supabase/server";

/**
 * Ensures the current request is authenticated as an admin user and returns the session.
 * Falls back to querying the `user_profile` table when role metadata is missing on the JWT.
 */
export async function requireAdminSession(): Promise<Session> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.error("Failed to retrieve Supabase session", error);
    throw new AccessDeniedError();
  }

  const session = data.session;
  if (!session) {
    throw new AccessDeniedError();
  }

  const metadataRole = session.user?.app_metadata?.role;
  if (metadataRole === "ADMIN") {
    return session;
  }

  try {
    const service = getSupabaseServiceRoleClient();
    const { data: profile, error: profileErr } = await service
      .from("user_profile")
      .select("role")
      .eq("id", session.user.id)
      .maybeSingle<{ role: "ADMIN" | "CLIENT" | null }>();

    if (profileErr) {
      console.error("Failed to load user profile for admin validation", profileErr);
      throw new AccessDeniedError();
    }

    if (profile?.role !== "ADMIN") {
      throw new AccessDeniedError();
    }

    return session;
  } catch (cause) {
    if (cause instanceof AccessDeniedError) {
      throw cause;
    }

    console.error("Unexpected error validating admin session", cause);
    throw new AccessDeniedError();
  }
}
