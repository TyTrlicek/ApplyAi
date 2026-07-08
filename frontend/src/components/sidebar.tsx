"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart2,
  Building2,
  Kanban,
  LayoutDashboard,
  Search,
  Settings,
  User,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/discover", label: "Discover", icon: Search },
  { href: "/pipeline", label: "Pipeline", icon: Kanban },
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/profile", label: "Profile", icon: User },
] as const;

const BOTTOM_ITEMS = [
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

function NavItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      title={label}
      className={cn(
        "flex items-center justify-center gap-3 rounded-md px-2 py-2 text-sm font-medium transition-colors md:justify-start md:px-3",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="hidden md:block">{label}</span>
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-12 shrink-0 flex-col border-r border-border bg-sidebar md:w-56">
      {/* Brand */}
      <div className="flex h-14 items-center justify-center gap-2 border-b border-border px-2 md:justify-start md:px-4">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary">
          <Zap className="h-3.5 w-3.5 text-primary-foreground" />
        </div>
        <span className="hidden text-sm font-semibold tracking-tight text-foreground md:block">
          ApplyAi
        </span>
      </div>

      {/* Main nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-1.5 md:p-2">
        {NAV_ITEMS.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={pathname.startsWith(item.href)}
          />
        ))}
      </nav>

      {/* Bottom nav */}
      <div className="border-t border-border p-1.5 md:p-2">
        {BOTTOM_ITEMS.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={pathname.startsWith(item.href)}
          />
        ))}
      </div>
    </aside>
  );
}
