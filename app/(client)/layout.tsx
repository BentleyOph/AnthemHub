import { redirect } from "next/navigation";
import { ReactNode } from "react";

import {
  getSupabaseServerClient,
  getSupabaseServiceRoleClient,
} from "@/lib/supabase/server";

export default async function ClientLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    console.error("Failed to retrieve authenticated user for client layout", error);
    redirect("/login");
  }

  const user = data.user;

  if (!user) {
    redirect("/login");
  }

  const metadataRole = user.app_metadata?.role;
  let role: "ADMIN" | "CLIENT" | null =
    metadataRole === "ADMIN" || metadataRole === "CLIENT"
      ? metadataRole
      : null;

  if (!role) {
    const service = getSupabaseServiceRoleClient();
    const { data: profile } = await service
      .from("user_profile")
      .select("role")
      .eq("id", user.id)
      .maybeSingle<{ role: "ADMIN" | "CLIENT" | null }>();

    if (profile?.role === "ADMIN" || profile?.role === "CLIENT") {
      role = profile.role;
    }
  }

  if (!role) {
    role = "CLIENT";
  }

  if (role !== "CLIENT") {
    if (role === "ADMIN") {
      redirect("/admin/overview");
    }
    redirect("/login");
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
        {children}
      </div>
    </div>
  );
}
