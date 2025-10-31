import Link from "next/link";
import {
  IconChevronRight,
  IconInnerShadowTop,
  IconLogout,
} from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { logout } from "@/app/actions/logout";

export const CLIENT_NAV_ITEMS = [
  { label: "Overview", href: "/overview" },
  { label: "Catalog", href: "/catalog" },
  { label: "Executions", href: "/executions" },
] as const;

type ClientNavItem = (typeof CLIENT_NAV_ITEMS)[number];

interface ClientNavProps {
  clientName: string;
  clientCompany: string | null;
  userName: string | null;
  activeHref: string;
  items?: readonly ClientNavItem[];
}

export function ClientNav({
  clientName,
  clientCompany,
  userName,
  activeHref,
  items = CLIENT_NAV_ITEMS,
}: ClientNavProps) {
  // Display format: "Company • UserName" if both exist, otherwise fallback to clientName
  const displayText = clientCompany && userName 
    ? `${clientCompany} • ${userName}` 
    : userName || clientName;

  return (
    <nav className="bg-card text-card-foreground flex flex-col gap-6 rounded-xl border p-6 shadow-sm md:flex-row md:items-center md:justify-between lg:p-8">
      <div className="flex items-center gap-4">
        <span className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full ring-1 ring-primary/20">
          <IconInnerShadowTop className="size-6" />
        </span>
        <div className="space-y-1">
          <p className="font-semibold leading-none">Anthem Agency</p>
          <p className="text-sm text-muted-foreground leading-none">
            {displayText}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {items.map((item) => (
          <Button
            key={item.href}
            variant={item.href === activeHref ? "secondary" : "ghost"}
            asChild
            size="sm"
            className="transition-colors"
          >
            <Link href={item.href}>
              {item.label}
              {item.href === activeHref ? null : (
                <IconChevronRight className="ml-1 size-3.5" />
              )}
            </Link>
          </Button>
        ))}
        <form action={logout}>
          <Button size="sm" variant="ghost" type="submit" className="transition-colors">
            <IconLogout className="mr-2 size-4" />
            Log out
          </Button>
        </form>
      </div>
    </nav>
  );
}
