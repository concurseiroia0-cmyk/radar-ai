import { NextResponse } from "next/server";
import { getDemoBacktest } from "@/lib/demo-data";
import { createServiceSupabaseClient, isSupabaseConfigured } from "@/lib/services/supabase-server";

/** GET /api/backtest/status/[id] — polling (client ~900ms). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (id.startsWith("demo-")) {
    // demo: resultado já pronto
    const parts = id.replace("demo-", "").split("-");
    const tf = (parts.pop() ?? "5m") as "1m" | "5m" | "15m";
    const symbol = ["eurusd", "gbpusd", "usdjpy", "audusd", "eurjpy", "gbpjpy"].includes(parts.join("-"))
      ? parts.join("-").toUpperCase().replace("EURUSD", "EUR/USD").replace("GBPUSD", "GBP/USD").replace("USDJPY", "USD/JPY").replace("AUDUSD", "AUD/USD").replace("EURJPY", "EUR/JPY").replace("GBPJPY", "GBP/JPY")
      : "EUR/USD";
    const result = await getDemoBacktest(symbol, tf);
    return NextResponse.json({
      id,
      status: "done",
      progress: 100,
      processed: result.trades.length,
      total_candles: result.trades.length,
      stats: result.stats,
      demo: true,
    });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ id, status: "error", error_msg: "Supabase não configurado" });
  }
  const supabase = await createServiceSupabaseClient();
  if (!supabase) return NextResponse.json({ id, status: "error", error_msg: "Supabase não configurado" });

  const { data } = await supabase.from("backtests").select("*").eq("id", id).maybeSingle();
  if (!data) return NextResponse.json({ id, status: "error", error_msg: "Backtest não encontrado" }, { status: 404 });

  return NextResponse.json({
    id,
    status: data.status,
    progress: data.progress,
    processed: data.processed,
    total_candles: data.total_candles,
    stats: data.stats,
    error_msg: data.error_msg,
  });
}