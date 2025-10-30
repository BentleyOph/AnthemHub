import Link from "next/link";
import {
  IconChevronRight,
  IconInnerShadowTop,
  IconLogout,
} from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { logout } from "@/app/actions/logout";

export const CLIENT_NAV_ITEMS = [
  { label: "My Workflows", href: "/overview" },
  { label: "Catalog", href: "/catalog" },
  { label: "Executions", href: "/executions" },
] as const;

type ClientNavItem = (typeof CLIENT_NAV_ITEMS)[number];

interface ClientNavProps {
  clientName: string;
  clientCompany: string | null;
  activeHref: string;
  items?: readonly ClientNavItem[];
}

export function ClientNav({
  clientName,
  clientCompany,
  activeHref,
  items = CLIENT_NAV_ITEMS,
}: ClientNavProps) {
  return (
    <nav className="bg-card text-card-foreground flex flex-col gap-4 rounded-xl border p-4 shadow-sm md:flex-row md:items-center md:justify-between md:p-6">
      <div className="flex items-center gap-3">
        <span className="bg-primary/10 text-primary flex size-11 items-center justify-center rounded-full">
          <IconInnerShadowTop className="size-5" />
        </span>
        <div>
          <p className="text-sm font-semibold">Anthem Agency</p>
          <p className="text-sm text-muted-foreground">
            {clientCompany ? `${clientCompany} • ${clientName}` : clientName}
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
          >
            <Link href={item.href}>
              {item.label}
              {item.href === activeHref ? null : (
                <IconChevronRight className="size-3.5" />
              )}
            </Link>
          </Button>
        ))}
        <form action={logout}>
          <Button size="sm" variant="ghost" type="submit">
            <IconLogout className="mr-2 size-4" />
            Log out
          </Button>
        </form>
      </div>
    </nav>
  );
}
