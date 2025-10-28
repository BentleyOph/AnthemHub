import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import {
  getSupabaseServerClient,
  getSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/session";

async function resolveRole(user: User): Promise<AppRole> {
  const metadata =
    (user.app_metadata as Record<string, unknown> | undefined) ?? {};
  const rawRole = metadata.role;

  if (rawRole === "ADMIN" || rawRole === "CLIENT") {
    return rawRole;
  }

  // Fallback to persisted profile role if claims are missing.
  const admin = getSupabaseServiceRoleClient();
  const { data } = await admin
    .from("user_profile")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (data?.role === "ADMIN" || data?.role === "CLIENT") {
    return data.role;
  }

  return "CLIENT";
}

export default async function Home() {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) {
    redirect("/login");
  }

  const role = await resolveRole(user!);

  if (role === "ADMIN") {
    redirect("/admin/overview");
  }

  redirect("/overview");
}
