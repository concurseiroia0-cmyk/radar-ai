import PaperBoard, { type PaperTradeUI } from "@/components/paper/PaperBoard";
import AutoRefresh from "@/components/app/AutoRefresh";
import type { Timeframe } from "@/lib/engine";
import { getProfile } from "@/lib/actions/profile";
import { getDemoSignalsAll } from "@/lib/demo-data";
import { createServerSupabaseClient, isSupabaseConfigured } from "@/lib/services/supabase-server";

export const dynamic = "force-dynamic";

export default async function PaperPage() {
  const demo = !isSupabaseConfigured();
  const profile = await getProfile();

  let banca = profile?.banca ?? 500;
  const riscoPct = profile?.risco_pct ?? 1;
  let signals = getDemoSignalsAll(12);
  let initialTrades: PaperTradeUI[] = [];
  let canEnter = false;

  if (!demo) {
    const supabase = await createServerSupabaseClient();
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      canEnter = Boolean(user);
      if (user) {
        banca = profile?.banca ?? 500;
        const { data: rows } = await supabase
          .from("paper_trades")
          .select("*, signals(asset_id, assets(symbol))")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50);
        initialTrades = (rows ?? []).map((r) => {
          const asset = (r.signals as { assets?: { symbol?: string } })?.assets;
          return {
            id: String(r.id),
            symbol: asset?.symbol ?? "—",
            timeframe: "5m" as Timeframe,
            direction: r.direction as "CALL" | "PUT",
            stake: Number(r.stake),
            entryPrice: Number(r.entry_price),
            expiresAt: r.expires_at ? new Date(String(r.expires_at)).getTime() / 1000 : 0,
            result: (r.result as PaperTradeUI["result"]) ?? "pending",
            pnl: Number(r.pnl),
            createdAt: new Date(String(r.created_at)).getTime() / 1000,
          };
        });
        const { data: sigRows } = await supabase
          .from("signals")
          .select("*, assets(symbol)")
          .eq("result", "pending")
          .order("created_at", { ascending: false })
          .limit(12);
        signals = (sigRows ?? []).map((r) => ({
          id: String(r.id),
          symbol: (r.assets as { symbol?: string })?.symbol ?? "—",
          timeframe: (r.timeframe as Timeframe) ?? "5m",
          direction: r.direction as "CALL" | "PUT",
          score: Number(r.score),
          strategy: r.strategy ?? "",
          confluences: [],
          reasons: [],
          entryPrice: Number(r.entry_price),
          ts: new Date(String(r.created_at)).getTime() / 1000,
          result: "pending",
          aiPass: Boolean(r.ai_pass),
          aiConsensusLabel: "—",
          invalidReasons: [],
        }));
      }
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Paper Trading</h1>
          <p className="text-sm text-muted-foreground">
            Simulador com banca inicial R$ 500 • risco {riscoPct}% por operação • expiração automática por timeframe.
          </p>
        </div>
        <AutoRefresh intervalMs={20000} />
      </div>
      <PaperBoard
        demo={demo}
        initialBanca={banca}
        riscoPct={riscoPct}
        signals={signals}
        initialTrades={initialTrades}
        canEnter={canEnter}
      />
    </div>
  );
}