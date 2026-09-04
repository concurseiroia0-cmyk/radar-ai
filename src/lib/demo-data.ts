import type {
  Candle,
  ConfluenceItem,
  Direction,
  EngineResult,
  IndicatorPack,
  SignalResult,
  Timeframe,
} from "@/lib/engine";
import { aggregateTo, buildIndicatorPack, runEngine } from "@/lib/engine";
import { runBacktest, type BacktestRunResult } from "@/lib/backtest/runner";
import { RADAR_ASSETS } from "@/lib/assets";

/**
 * MODO DEMONSTRAÇÃO — dados 100% sintéticos e DETERMINÍSTICOS (seed por símbolo),
 * gerados pelo MESMO motor real (runEngine / runBacktest). Nada aqui é inventado
 * como resultado: os sinais vêm do motor sobre candles sintéticos.
 * Tudo é claramente marcado como demo na UI.
 */

export interface DemoAsset {
  symbol: string;
  active: boolean;
  type: string;
}

/** Catálogo único (src/lib/assets.ts) — demo usa os mesmos símbolos/ordem. */
export const DEMO_ASSETS: DemoAsset[] = RADAR_ASSETS.map((a) => ({
  symbol: a.symbol,
  active: true,
  type: a.type,
}));

const BASE_PRICE: Record<string, number> = {
  "EUR/USD": 1.0842,
  "GBP/USD": 1.2715,
  "USD/JPY": 149.42,
  "AUD/USD": 0.6612,
  "EUR/JPY": 162.03,
  "GBP/JPY": 190.06,
  "EUR/GBP": 0.852,
  "USD/CHF": 0.855,
  "AUD/JPY": 96.5,
  "USD/CAD": 1.365,
  "NZD/USD": 0.6142,
  AAPL: 228.5,
  TSLA: 246,
  NVDA: 128,
};

const BASE_TS = Math.floor(Date.now() / 1000) - 7 * 86400;

function hashSymbol(symbol: string): number {
  let h = 2166136261;
  for (let i = 0; i < symbol.length; i++) {
    h ^= symbol.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Gera candles 1m sintéticos (7 dias) com estrutura REALISTA:
 * âncora com drift por regime (tendência/consolidação) + ruído AR(1)
 * que oscila ao redor da âncora — cria pullbacks naturais, swing points
 * e períodos laterais. Determinístico por símbolo.
 */
export function getDemoCandles1m(symbol: string, days = 7): Candle[] {
  const key = `${symbol}:${days}`;
  const cached = demoCache.get(key);
  if (cached) return cached;

  const rnd = mulberry32(hashSymbol(symbol) + days * 7919);
  const n = days * 1440;
  const price0 = BASE_PRICE[symbol] ?? 1.0;
  const out: Candle[] = [];
  let anchor = price0;
  let noise = 0;
  let driftPct = 0; // % por minuto (regime)
  let prevClose = price0;

  for (let i = 0; i < n; i++) {
    // regime shift a cada ~4h: 50% tendência (alta/baixa), 50% consolidação.
    // drift realista: 0.1–0.4% por regime de 4h (forex 5m varia ~0.5–1.5%/dia)
    if (i % 240 === 0) {
      const r = rnd();
      driftPct = r < 0.5 ? (rnd() < 0.5 ? 1 : -1) * (0.0004 + rnd() * 0.0016) : 0;
    }
    anchor += anchor * (driftPct / 100);
    const volPct = 0.015 + rnd() * 0.017; // % por minuto (ATR% 5m ~0.04–0.09%)
    const step = (price0 * volPct) / 100;
    noise = 0.92 * noise + (rnd() - 0.5) * step; // AR(1): oscilação suave
    const open = i === 0 ? price0 : prevClose;
    const close = anchor + noise;
    const wick = Math.abs(rnd()) * step * 0.6;
    const high = Math.max(open, close) + wick;
    const low = Math.min(open, close) - wick;
    out.push({ ts: BASE_TS + i * 60, open, high, low, close });
    prevClose = close;
  }

  demoCache.set(key, out);
  return out;
}

const demoCache = new Map<string, Candle[]>();

export function getDemoCandles(symbol: string, tf: Timeframe, days = 7): Candle[] {
  return aggregateTo(getDemoCandles1m(symbol, days), tf);
}

/* ------------------------------------------------------------------ */
/* Sinais                                                              */
/* ------------------------------------------------------------------ */

export interface DemoSignal {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  direction: Direction;
  score: number;
  strategy: string;
  confluences: ConfluenceItem[];
  reasons: string[];
  entryPrice: number;
  stop?: number;
  ts: number; // unix seconds (created_at)
  result: SignalResult;
  aiPass: boolean;
  aiConsensusLabel: string;
  invalidReasons: string[];
  /** Status do envio do alerta Telegram (preenchido apenas no modo real). */
  tg?: { ok: boolean; error?: string };
}

/** Varre as últimas ~N janelas com o motor real e coleta sinais válidos. */
export function scanSignals(symbol: string, tf: Timeframe, scanCandles = 480, maxSignals = 6): DemoSignal[] {
  const candles = getDemoCandles(symbol, tf);
  const signals: DemoSignal[] = [];
  const start = Math.max(0, candles.length - scanCandles);

  for (let i = start; i < candles.length - 1; i++) {
    const window = candles.slice(Math.max(0, i - 399), i + 1);
    const r = runEngine({ candles5m: window });
    if (!r.valid || r.direction === "NEUTRAL" || r.score < 50) continue;

    const nextClose = candles[i + 1].close;
    const resolved: SignalResult = r.entryPrice === nextClose ? "void" : resolveDemo(r.direction, r.entryPrice, nextClose);

    signals.push({
      id: `demo-${symbol.replace("/", "")}-${tf}-${candles[i].ts}`,
      symbol,
      timeframe: tf,
      direction: r.direction,
      score: r.score,
      strategy: r.strategy,
      confluences: r.confluences,
      reasons: r.reasons,
      entryPrice: r.entryPrice,
      stop: r.stop,
      ts: candles[i].ts,
      result: resolved,
      aiPass: r.score >= 75,
      aiConsensusLabel: r.score >= 75 ? "3/3 ✓" : "—",
      invalidReasons: r.invalidReasons,
    });
    if (signals.length >= maxSignals) break;
  }
  // o sinal mais recente fica PENDENTE (aguardando expiração) — alimenta o paper
  if (signals.length) signals[signals.length - 1].result = "pending";
  return signals.reverse(); // mais recentes primeiro
}

function resolveDemo(direction: Direction, entry: number, nextClose: number): "win" | "loss" | "void" {
  if (nextClose === entry) return "void";
  if (direction === "CALL") return nextClose > entry ? "win" : "loss";
  return nextClose < entry ? "win" : "loss";
}

/** Snapshot atual de um ativo (dashboard / tabela). */
export interface DemoAssetSnapshot {
  asset: DemoAsset;
  price: number;
  changePct: number;
  pack: IndicatorPack;
  engine: EngineResult;
  lastSignal: DemoSignal | null;
}

export function getAssetSnapshots(): DemoAssetSnapshot[] {
  return DEMO_ASSETS.filter((a) => a.active).map((asset) => {
    const candles5m = getDemoCandles(asset.symbol, "5m");
    const last = candles5m[candles5m.length - 1];
    const prev = candles5m[candles5m.length - 6] ?? last;
    const pack = buildIndicatorPack(candles5m.slice(-400));
    const engine = runEngine({ candles5m: candles5m.slice(-400) });
    const signals = scanSignals(asset.symbol, "5m", 480, 3);
    return {
      asset,
      price: last.close,
      changePct: prev ? ((last.close - prev.close) / prev.close) * 100 : 0,
      pack,
      engine,
      lastSignal: signals[0] ?? null,
    };
  });
}

export function getDemoSignalsAll(maxPerAsset = 4): DemoSignal[] {
  const all: DemoSignal[] = [];
  for (const a of DEMO_ASSETS) {
    all.push(...scanSignals(a.symbol, "5m", 720, maxPerAsset));
  }
  return all.sort((a, b) => b.ts - a.ts);
}

/* ------------------------------------------------------------------ */
/* Backtest demo (mesmo runner da API real)                            */
/* ------------------------------------------------------------------ */

const demoBacktestCache = new Map<string, BacktestRunResult>();

export async function getDemoBacktest(symbol: string, tf: Timeframe = "5m"): Promise<BacktestRunResult> {
  const key = `${symbol}:${tf}`;
  const cached = demoBacktestCache.get(key);
  if (cached) return cached;
  const candles = getDemoCandles1m(symbol, 7);
  const result = await runBacktest(candles, { timeframe: tf, scoreMin: 50 });
  demoBacktestCache.set(key, result);
  return result;
}