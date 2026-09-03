import type { Candle, EngineResult, IndicatorPack, Timeframe } from "@/lib/engine";
import { aggregateTo, buildIndicatorPack, runEngine } from "@/lib/engine";
import {
  DEMO_ASSETS,
  getAssetSnapshots,
  getDemoBacktest,
  getDemoCandles,
  getDemoSignalsAll,
  scanSignals,
  type DemoAssetSnapshot,
  type DemoSignal,
} from "@/lib/demo-data";
import { isSupabaseConfigured, createServiceSupabaseClient } from "@/lib/services/supabase-server";
import type { BacktestRunResult } from "@/lib/backtest/runner";

/**
 * Camada de acesso a dados das páginas — demo (sintético, motor real)
 * ou Supabase (produção). As páginas chamam ESTES helpers, nunca acessam
 * banco diretamente.
 */

export interface RadarPageData {
  demo: boolean;
  snapshots: DemoAssetSnapshot[];
  signals: DemoSignal[];
}

export async function getRadarData(): Promise<RadarPageData> {
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_KEY) {
    // Sem service key não há como ler via service role → demo em vez de erro 500.
    return { demo: true, snapshots: getAssetSnapshots(), signals: getDemoSignalsAll(4) };
  }
  const supabase = await createServiceSupabaseClient();
  const { data: assets } = await supabase!.from("assets").select("*").eq("active", true).order("symbol");
  const list = (assets ?? []) as { id: string; symbol: string; active: boolean; type: string }[];
  const snapshots: DemoAssetSnapshot[] = [];
  for (const a of list) {
    const { data: rows } = await supabase!
      .from("candles")
      .select("ts,open,high,low,close")
      .eq("asset_id", a.id)
      .eq("timeframe", "1m")
      .order("ts", { ascending: false })
      .limit(400);
    if (!rows?.length) continue;
    const candles1m: Candle[] = [...rows].reverse().map((r) => ({
      ts: Number(r.ts),
      open: Number(r.open),
      high: Number(r.high),
      low: Number(r.low),
      close: Number(r.close),
    }));
    const candles5m = aggregateTo(candles1m, "5m");
    if (candles5m.length < 60) continue;
    const pack = buildIndicatorPack(candles5m.slice(-400));
    const engine = runEngine({ candles5m: candles5m.slice(-400) });
    const price = candles5m[candles5m.length - 1].close;
    const prev = candles5m[candles5m.length - 6]?.close ?? price;
    snapshots.push({
      asset: { symbol: a.symbol, active: true, type: a.type },
      price,
      changePct: ((price - prev) / prev) * 100,
      pack,
      engine,
      lastSignal: null,
    });
  }

  // sinais reais recentes (o Modo Simples mostra a instrução de entrada com prazo)
  const { data: sigRows } = await supabase!
    .from("signals")
    .select("*, assets(symbol)")
    .order("created_at", { ascending: false })
    .limit(15);
  const signals: DemoSignal[] = (sigRows ?? []).map((r) => ({
    id: String(r.id),
    symbol: (r.assets as { symbol?: string })?.symbol ?? "—",
    timeframe: r.timeframe as Timeframe,
    direction: r.direction as DemoSignal["direction"],
    score: Number(r.score),
    strategy: r.strategy ?? "",
    confluences: [],
    reasons: [],
    entryPrice: Number(r.entry_price),
    ts: new Date(String(r.created_at)).getTime() / 1000,
    result: (r.result as DemoSignal["result"]) ?? "pending",
    aiPass: Boolean(r.ai_pass),
    aiConsensusLabel: (r.ai_consensus as { favoravel?: string })?.favoravel
      ? `${String((r.ai_consensus as { favoravel?: string }).favoravel)} ✓`
      : "—",
    invalidReasons: [],
  }));
  return { demo: false, snapshots, signals };
}

export interface AssetPageData {
  demo: boolean;
  symbol: string;
  candles: Record<Timeframe, Candle[]>;
  pack: IndicatorPack;
  signals: DemoSignal[];
  engine: EngineResult;
}

export async function getAssetPageData(symbol: string): Promise<AssetPageData | null> {
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_KEY) {
    const candles = {
      "1m": getDemoCandles(symbol, "1m"),
      "5m": getDemoCandles(symbol, "5m"),
      "15m": getDemoCandles(symbol, "15m"),
    };
    const c5 = candles["5m"];
    if (!c5.length) return null;
    const pack = buildIndicatorPack(c5.slice(-400));
    const engine = runEngine({ candles5m: c5.slice(-400) });
    return {
      demo: true,
      symbol,
      candles,
      pack,
      signals: scanSignals(symbol, "5m", 720, 8),
      engine,
    };
  }
  const supabase = await createServiceSupabaseClient();
  const { data: asset } = await supabase!.from("assets").select("*").eq("symbol", symbol).maybeSingle();
  if (!asset) return null;
  const fetchTf = async (tf: Timeframe): Promise<Candle[]> => {
    const { data: rows } = await supabase!
      .from("candles")
      .select("ts,open,high,low,close")
      .eq("asset_id", asset.id)
      .eq("timeframe", tf)
      .order("ts", { ascending: false })
      .limit(500);
    if (!rows) return [];
    return [...rows].reverse().map((r) => ({
      ts: Number(r.ts),
      open: Number(r.open),
      high: Number(r.high),
      low: Number(r.low),
      close: Number(r.close),
    }));
  };
  const candles = { "1m": await fetchTf("1m"), "5m": await fetchTf("5m"), "15m": await fetchTf("15m") };
  const c5 = candles["5m"];
  if (!c5.length) return { demo: false, symbol, candles, pack: buildIndicatorPack(c5.length ? c5 : fallbackPack()), signals: [], engine: runEngine({ candles5m: fallbackPack() }) };
  const pack = buildIndicatorPack(c5.slice(-400));
  const engine = runEngine({ candles5m: c5.slice(-400) });
  const { data: sigRows } = await supabase!
    .from("signals")
    .select("*")
    .eq("asset_id", asset.id)
    .order("created_at", { ascending: false })
    .limit(12);
  const signals: DemoSignal[] = (sigRows ?? []).map((r) => ({
    id: String(r.id),
    symbol,
    timeframe: r.timeframe as Timeframe,
    direction: r.direction as DemoSignal["direction"],
    score: Number(r.score),
    strategy: r.strategy ?? "",
    confluences: (r.confluences as DemoSignal["confluences"]) ?? [],
    reasons: [],
    entryPrice: Number(r.entry_price),
    ts: new Date(String(r.created_at)).getTime() / 1000,
    result: (r.result as DemoSignal["result"]) ?? "pending",
    aiPass: Boolean(r.ai_pass),
    aiConsensusLabel: (r.ai_consensus as { favoravel?: string })?.favoravel
      ? `${String((r.ai_consensus as { favoravel?: string }).favoravel)} ✓`
      : "—",
    invalidReasons: [],
  }));
  return { demo: false, symbol, candles, pack, signals, engine };
}

function fallbackPack(): Candle[] {
  const c: Candle = { ts: 0, open: 1, high: 1, low: 1, close: 1 };
  return Array.from({ length: 100 }, (_, i) => ({ ...c, ts: i * 300 }));
}

export async function getSinaisPageData(): Promise<{ demo: boolean; signals: DemoSignal[] }> {
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_KEY) {
    return { demo: true, signals: getDemoSignalsAll(10) };
  }
  const supabase = await createServiceSupabaseClient();
  const { data: rows } = await supabase!
    .from("signals")
    .select("*, assets(symbol)")
    .order("created_at", { ascending: false })
    .limit(200);
  const signals: DemoSignal[] = (rows ?? []).map((r) => ({
    id: String(r.id),
    symbol: (r.assets as { symbol?: string })?.symbol ?? "—",
    timeframe: r.timeframe as Timeframe,
    direction: r.direction as DemoSignal["direction"],
    score: Number(r.score),
    strategy: r.strategy ?? "",
    confluences: [],
    reasons: [],
    entryPrice: Number(r.entry_price),
    ts: new Date(String(r.created_at)).getTime() / 1000,
    result: (r.result as DemoSignal["result"]) ?? "pending",
    aiPass: Boolean(r.ai_pass),
    aiConsensusLabel: (r.ai_consensus as { favoravel?: string })?.favoravel
      ? `${String((r.ai_consensus as { favoravel?: string }).favoravel)} ✓`
      : "—",
    invalidReasons: [],
  }));
  return { demo: false, signals };
}

export async function getBacktestResult(id: string): Promise<{ result: BacktestRunResult; symbol: string; timeframe: Timeframe; demo: boolean } | null> {
  if (id.startsWith("demo-")) {
    const parts = id.replace("demo-", "").split("-");
    const tf = (parts.pop() ?? "5m") as Timeframe;
    const symbol = DEMO_ASSETS.find((a) => a.symbol.toLowerCase().replace(/[^a-z0-9]/g, "") === parts.join("-"))?.symbol ?? "EUR/USD";
    const result = await getDemoBacktest(symbol, tf);
    return { result, symbol, timeframe: tf, demo: true };
  }
  const supabase = await createServiceSupabaseClient();
  if (!supabase) return null;
  const { data: bt } = await supabase!.from("backtests").select("*, assets(symbol)").eq("id", id).maybeSingle();
  if (!bt) return null;
  const { data: tradeRows } = await supabase!
    .from("backtest_trades")
    .select("*")
    .eq("backtest_id", id)
    .order("ts", { ascending: true });
  const trades = (tradeRows ?? []).map((t) => ({
    ts: Number(t.ts),
    direction: t.direction as "CALL" | "PUT",
    score: Number(t.score),
    strategy: t.strategy ?? "",
    entryPrice: Number(t.entry_price),
    result: t.result as "win" | "loss" | "void",
  }));
  // reconstrói stats a partir das trades (fonte única: runner)
  const { computeStats } = await import("@/lib/backtest/runner");
  const stats = (bt.stats as BacktestRunResult["stats"]) ?? computeStats(trades, 1, 80);
  return {
    result: { trades, stats },
    symbol: (bt.assets as { symbol?: string })?.symbol ?? "—",
    timeframe: bt.timeframe as Timeframe,
    demo: false,
  };
}

export async function getSymbols(): Promise<string[]> {
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_KEY)
    return DEMO_ASSETS.map((a) => a.symbol);
  const supabase = await createServiceSupabaseClient();
  const { data } = await supabase!.from("assets").select("symbol").eq("active", true).order("symbol");
  return (data ?? []).map((r) => r.symbol as string);
}