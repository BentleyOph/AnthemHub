import { redirect } from "next/navigation";
import { ReactNode, type CSSProperties } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import {
  getSupabaseServerClient,
  getSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.auth.getSession();
  const session = data.session;

  if (!session) {
    redirect("/login");
  }

  const metadataRole = session.user?.app_metadata?.role;
  let role: "ADMIN" | "CLIENT" | null =
    metadataRole === "ADMIN" || metadataRole === "CLIENT"
      ? metadataRole
      : null;

  if (!role) {
    const service = getSupabaseServiceRoleClient();
    const { data: profile } = await service
      .from("user_profile")
      .select("role")
      .eq("id", session.user.id)
      .maybeSingle<{ role: "ADMIN" | "CLIENT" | null }>();

    if (profile?.role === "ADMIN" || profile?.role === "CLIENT") {
      role = profile.role;
    }
  }

  if (role !== "ADMIN") {
    redirect(role === "CLIENT" ? "/overview" : "/login");
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
              {children}
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
