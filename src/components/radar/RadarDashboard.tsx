"use client";

import { useEffect, useState } from "react";
import type { DemoAssetSnapshot, DemoSignal } from "@/lib/demo-data";
import AssetTable from "./AssetTable";
import SignalCard from "./SignalCard";
import { createBrowserSupabaseClient } from "@/lib/services/supabase";

interface RadarDashboardProps {
  initialSnapshots: DemoAssetSnapshot[];
  initialSignals: DemoSignal[];
  demo: boolean;
}

export default function RadarDashboard({ initialSnapshots, initialSignals, demo }: RadarDashboardProps) {
  const [signals, setSignals] = useState<DemoSignal[]>(initialSignals);

  useEffect(() => {
    if (demo) return;
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;
    const channel = supabase
      .channel("signals-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "signals" },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const sig: DemoSignal = {
            id: String(row.id),
            symbol: "—",
            timeframe: (row.timeframe as DemoSignal["timeframe"]) ?? "5m",
            direction: (row.direction as DemoSignal["direction"]) ?? "NEUTRAL",
            score: Number(row.score ?? 0),
            strategy: String(row.strategy ?? ""),
            confluences: [],
            reasons: [],
            entryPrice: Number(row.entry_price ?? 0),
            ts: row.created_at ? Math.floor(new Date(String(row.created_at)).getTime() / 1000) : Date.now() / 1000,
            result: "pending",
            aiPass: Boolean(row.ai_pass),
            aiConsensusLabel: (row.ai_consensus as { favoravel?: string })?.favoravel
              ? `${String((row.ai_consensus as { favoravel?: string }).favoravel)} ✓`
              : "—",
            invalidReasons: [],
          };
          setSignals((prev) => [sig, ...prev].slice(0, 12));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [demo]);

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">ÚLTIMOS SINAIS</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {signals.slice(0, 2).map((s) => (
            <SignalCard key={s.id} signal={s} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">RADAR — 6 ATIVOS</h2>
        <AssetTable snapshots={initialSnapshots} />
      </section>
    </div>
  );
}