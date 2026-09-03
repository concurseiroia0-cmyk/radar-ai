"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { DemoAssetSnapshot, DemoSignal } from "@/lib/demo-data";
import AssetTable from "./AssetTable";
import SignalCard from "./SignalCard";
import SimpleBoard from "./SimpleBoard";
import { createBrowserSupabaseClient, SUPABASE_SCHEMA } from "@/lib/services/supabase";
import type { SessionInfo } from "@/lib/plain-lang";

interface RadarDashboardProps {
  initialSnapshots: DemoAssetSnapshot[];
  initialSignals: DemoSignal[];
  demo: boolean;
  /** perfil do usuário (modo simples: quanto colocar por operação) */
  banca: number;
  riscoPct: number;
  /** janela de sessão (quando os sinais estão ativos) */
  sessao: SessionInfo;
}

type ViewMode = "simples" | "tecnico";

const MODE_KEY = "radar-ai-view-mode";

function readMode(): ViewMode {
  if (typeof window === "undefined") return "simples";
  try {
    const saved = localStorage.getItem(MODE_KEY);
    return saved === "simples" || saved === "tecnico" ? saved : "simples";
  } catch {
    return "simples";
  }
}

const modeListeners = new Set<() => void>();

export default function RadarDashboard({ initialSnapshots, initialSignals, demo, banca, riscoPct, sessao }: RadarDashboardProps) {
  const router = useRouter();

  // modo de exibição persistido (padrão: Simples). useSyncExternalStore é
  // hydration-safe e evita setState em effect.
  const mode = useSyncExternalStore(
    (cb) => {
      modeListeners.add(cb);
      return () => {
        modeListeners.delete(cb);
      };
    },
    readMode,
    () => "simples" as ViewMode
  );

  const setMode = (m: ViewMode) => {
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* ignore */
    }
    modeListeners.forEach((l) => l());
  };

  // realtime: sinal novo entra no banco → revalida a página na hora
  // (router.refresh traz o símbolo correto e os dados completos do servidor)
  useEffect(() => {
    if (demo) return;
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;
    const channel = supabase
      .channel("signals-live")
      .on("postgres_changes", { event: "INSERT", schema: SUPABASE_SCHEMA, table: "signals" }, () => {
        router.refresh();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [demo, router]);

  const tabCls = (active: boolean) =>
    `rounded-md px-3 py-1 text-sm transition-colors ${
      active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex rounded-lg border border-border bg-surface p-1">
          <button type="button" className={tabCls(mode === "simples")} onClick={() => setMode("simples")}>
            Simples
          </button>
          <button type="button" className={tabCls(mode === "tecnico")} onClick={() => setMode("tecnico")}>
            Técnico
          </button>
        </div>
      </div>

      {mode === "simples" ? (
        <SimpleBoard snapshots={initialSnapshots} banca={banca} riscoPct={riscoPct} sessao={sessao} />
      ) : (
        <>
          <section>
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">ÚLTIMOS SINAIS</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {initialSignals.slice(0, 2).map((s) => (
                <SignalCard key={s.id} signal={s} />
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">RADAR — 6 ATIVOS</h2>
            <AssetTable snapshots={initialSnapshots} />
          </section>
        </>
      )}
    </div>
  );
}