import { NextResponse } from "next/server";
import type { Timeframe } from "@/lib/engine";
import { runBacktest, type BacktestTradeRecord } from "@/lib/backtest/runner";
import { getDemoBacktest, DEMO_ASSETS } from "@/lib/demo-data";
import { createServiceSupabaseClient, isSupabaseConfigured } from "@/lib/services/supabase-server";

/**
 * POST { symbol, timeframe, periodoInicio?, periodoFim?, scoreMinRegister? }
 * Cria backtests(status='running'), roda o runner em LOTES DE 5000 CANDLES
 * (atualizando processed/progress a cada lote), persiste trades e stats.
 * Retorna { backtestId }.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    symbol?: string;
    timeframe?: Timeframe;
    periodoInicio?: string | null;
    periodoFim?: string | null;
    scoreMinRegister?: number;
  };

  const symbol = body.symbol ?? "EUR/USD";
  const timeframe: Timeframe = ["1m", "5m", "15m"].includes(body.timeframe ?? "")
    ? (body.timeframe as Timeframe)
    : "5m";
  const scoreMin = Math.max(0, Math.min(100, Number(body.scoreMinRegister ?? 50)));

  // ---- modo demo ----
  if (!isSupabaseConfigured()) {
    const demoAsset = DEMO_ASSETS.find((a) => a.symbol === symbol);
    const result = await getDemoBacktest(demoAsset?.symbol ?? "EUR/USD", timeframe);
    const id = `demo-${(demoAsset?.symbol ?? "EUR/USD").toLowerCase().replace(/[^a-z0-9]/g, "")}-${timeframe}`;
    return NextResponse.json({
      backtestId: id,
      done: true,
      progress: 100,
      processed: result.trades.length,
      total_candles: result.trades.length,
      demo: true,
    });
  }

  const supabase = await createServiceSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado" }, { status: 500 });
  }

  const { data: asset } = await supabase.from("assets").select("id, symbol").eq("symbol", symbol).maybeSingle();
  if (!asset) {
    return NextResponse.json({ error: `Ativo ${symbol} não encontrado` }, { status: 400 });
  }

  // ---- cria registro running ----
  const { data: bt, error: btErr } = await supabase
    .from("backtests")
    .insert({
      asset_id: asset.id,
      timeframe,
      periodo_inicio: body.periodoInicio || null,
      periodo_fim: body.periodoFim || null,
      params: { scoreMin },
      status: "running",
      progress: 0,
    })
    .select("id")
    .single();
  if (btErr || !bt) {
    return NextResponse.json({ error: btErr?.message ?? "Falha ao criar backtest" }, { status: 500 });
  }
  const backtestId = bt.id as string;

  // ---- busca candles 1m do período ----
  let query = supabase
    .from("candles")
    .select("ts, open, high, low, close")
    .eq("asset_id", asset.id)
    .eq("timeframe", "1m")
    .order("ts", { ascending: true });
  if (body.periodoInicio) {
    const startTs = Math.floor(new Date(`${body.periodoInicio}T00:00:00Z`).getTime() / 1000);
    query = query.gte("ts", startTs);
  }
  if (body.periodoFim) {
    const endTs = Math.floor(new Date(`${body.periodoFim}T23:59:59Z`).getTime() / 1000);
    query = query.lte("ts", endTs);
  }
  const { data: rows, error: rowsErr } = await query.limit(200_000);
  if (rowsErr) {
    await supabase.from("backtests").update({ status: "error", error_msg: rowsErr.message }).eq("id", backtestId);
    return NextResponse.json({ error: rowsErr.message }, { status: 500 });
  }
  if (!rows?.length) {
    await supabase
      .from("backtests")
      .update({ status: "error", error_msg: "Nenhum candle 1m encontrado no período (importe um CSV primeiro)" })
      .eq("id", backtestId);
    return NextResponse.json({ error: "Nenhum candle encontrado. Importe um CSV primeiro." }, { status: 400 });
  }

  const candles = rows.map((r) => ({
    ts: Number(r.ts),
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
  }));

  // ---- roda (lotes de 5000, progresso a cada lote) ----
  let lastChunk: BacktestTradeRecord[] = [];
  const { stats } = await runBacktest(candles, {
    timeframe,
    scoreMin,
    onProgress: async (processed, total, chunkTrades) => {
      lastChunk = chunkTrades;
      const pct = total > 0 ? Math.round((processed / total) * 100) : 100;
      await supabase
        .from("backtests")
        .update({ processed, total_candles: total, progress: pct, updated_at: new Date().toISOString() })
        .eq("id", backtestId);
    },
  });

  // ---- persiste trades (lotes de 1000) ----
  for (let i = 0; i < lastChunk.length; i += 1000) {
    const chunk = lastChunk.slice(i, i + 1000).map((t) => ({
      backtest_id: backtestId,
      ts: t.ts,
      direction: t.direction,
      score: t.score,
      strategy: t.strategy,
      entry_price: t.entryPrice,
      result: t.result,
    }));
    const { error } = await supabase.from("backtest_trades").insert(chunk);
    if (error) {
      await supabase.from("backtests").update({ status: "error", error_msg: error.message }).eq("id", backtestId);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // ---- finaliza ----
  await supabase
    .from("backtests")
    .update({
      status: "done",
      progress: 100,
      stats: stats as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    })
    .eq("id", backtestId);

  return NextResponse.json({ backtestId, done: true });
}