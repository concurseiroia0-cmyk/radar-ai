"use client";

import { useEffect, useState } from "react";
import { Activity, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createBrowserSupabaseClient } from "@/lib/services/supabase";
import { useRouter } from "next/navigation";

interface TopbarProps {
  email?: string | null;
  demo: boolean;
  quota?: {
    date: string;
    used: number;
    remaining: number;
    budget?: number;
    source: string;
    keys?: number;
    activeKey?: number | null;
  };
}

function formatUtc(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

export default function Topbar({ email, demo, quota }: TopbarProps) {
  const [now, setNow] = useState<Date | null>(null);
  const router = useRouter();

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const signOut = async () => {
    const supabase = createBrowserSupabaseClient();
    if (supabase) await supabase.auth.signOut();
    router.push("/");
  };

  return (
    <header className="flex h-14 items-center justify-between gap-3 border-b border-border bg-background px-4">
      <div className="flex items-center gap-2 text-sm">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-call opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-call" />
        </span>
        <span className="font-medium">Monitorando</span>
        {quota && (
          <span
            className="hidden text-xs text-muted-foreground sm:inline"
            title={`Twelve Data: ${quota.keys ?? 0} chave(s) × 800 créditos/dia. Todos os ativos são buscados a cada ~2 min; o cron usa a chave 1 até o teto, depois 2, depois 3. Esgotadas → fallback Finnhub (sem parar).`}
          >
            • cota TD {quota.used}/{quota.budget ?? quota.remaining}
            {quota.source === "twelvedata" && quota.activeKey != null && (
              <span className="text-call"> · chave {quota.activeKey + 1}/{quota.keys}</span>
            )}
            {quota.source === "finnhub" && <span className="text-warn"> · fallback Finnhub ativo</span>}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {now && (
          <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
            <Activity className="size-3.5" />
            <span className="tabular-nums">{formatUtc(now)} UTC</span>
          </div>
        )}
        {demo && (
          <span className="rounded-md border border-warn/50 bg-warn/10 px-2 py-0.5 text-xs font-medium text-warn">
            Modo demonstração
          </span>
        )}
        <div className="flex items-center gap-1.5 text-sm">
          <span className="flex size-7 items-center justify-center rounded-full bg-muted">
            <User className="size-4 text-muted-foreground" />
          </span>
          <span className="hidden max-w-40 truncate text-muted-foreground md:inline">
            {email ?? (demo ? "demo@radar.ai" : "—")}
          </span>
          <Button variant="ghost" size="icon-sm" onClick={signOut} title="Sair">
            <LogOut className="size-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}