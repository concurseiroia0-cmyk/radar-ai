"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Radar,
  BarChart3,
  Wallet,
  PieChart,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/sinais", label: "Sinais", icon: Radar },
  { href: "/app/backtest", label: "Backtest", icon: BarChart3 },
  { href: "/app/paper", label: "Paper", icon: Wallet },
  { href: "/app/stats", label: "Stats", icon: PieChart },
  { href: "/app/config", label: "Configurações", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-sidebar md:flex">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <div className="flex size-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Radar className="size-4" />
        </div>
        <span className="text-sm font-bold tracking-tight">Radar AI</span>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {NAV.map((item) => {
          const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-accent text-foreground font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-3 text-[11px] leading-relaxed text-muted-foreground/60">
        Sistema educacional — não constitui recomendação financeira. Day Trade envolve risco elevado.
      </div>
    </aside>
  );
}