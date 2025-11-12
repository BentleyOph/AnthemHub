import { redirect } from "next/navigation";
import type { Metadata } from "next";
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
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    console.error("Failed to retrieve authenticated user for admin layout", error);
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
            <div className="flex flex-col gap-6 px-4 py-6 md:gap-8 md:px-6 md:py-8 lg:px-8">
              {children}
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export const metadata: Metadata = {
  title: "Anthem Client /admin Portal",
  description:
    "Administrator portal for managing clients, workflows, executions, and access controls.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  openGraph: {
    title: "Anthem admin Portal",
    description:
      "Administrator portal for managing clients, workflows, executions, and access controls.",
    type: "website",
    images: [
      {
        url: "/anthem_agency_logo.jpeg",
        alt: "Anthem Admin Portal",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/anthem_agency_logo.jpeg"],
  },
};
