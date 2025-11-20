import { redirect } from "next/navigation";
import { ReactNode } from "react";

import {
  getSupabaseServerClient,
  getSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { ClientSidebar } from "@/components/client/client-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

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
    <SidebarProvider>
      <ClientSidebar user={user} />
      <SidebarInset className="md:pl-4 lg:pl-6">
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/overview">
                    Anthem Hub
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Dashboard</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
