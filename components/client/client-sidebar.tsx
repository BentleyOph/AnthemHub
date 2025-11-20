"use client"

import * as React from "react"
import {
  IconDashboard,
  IconFolder,
  IconListDetails,
  IconSettings,
  IconPlus,
} from "@tabler/icons-react"
import Link from "next/link"
import Image from "next/image"

import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

// This data would ideally come from props or a store, but for now we'll hardcode the structure
// The user object will be passed down from the layout
const data = {
  navMain: [
    {
      title: "Overview",
      url: "/overview",
      icon: IconDashboard,
    },
    {
      title: "Catalog",
      url: "/catalog",
      icon: IconPlus,
    },
    {
      title: "My Workflows",
      url: "/workflows",
      icon: IconFolder,
    },
    {
      title: "Executions",
      url: "/executions",
      icon: IconListDetails,
    },
  ],
  navSecondary: [
    {
      title: "Settings",
      url: "/settings",
      icon: IconSettings,
    },
  ],
}

export function ClientSidebar({ user, ...props }: React.ComponentProps<typeof Sidebar> & { user: { email?: string; user_metadata?: { full_name?: string; avatar_url?: string } } }) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/overview">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <Image
                    src="/logo.svg"
                    alt="Anthem logo"
                    width={20}
                    height={20}
                    className="size-4"
                    priority
                  />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Anthem Hub</span>
                  <span className="truncate text-xs">Client Portal</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={{
            name: user?.user_metadata?.full_name || user?.email || "User",
            email: user?.email || "",
            avatar: user?.user_metadata?.avatar_url || "",
        }} />
      </SidebarFooter>
    </Sidebar>
  )
}
