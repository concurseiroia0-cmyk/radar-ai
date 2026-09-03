import type { Candle, Direction, Timeframe } from "@/lib/engine";
import { aggregateTo, runEngine, LOOKBACK, MIN_CANDLES } from "@/lib/engine";

/**
 * Backtest compartilhado — ÚNICO source of truth.
 * Mesmo runEngine() do tempo real; resultado avaliado no fechamento do
 * candle seguinte (t+1, close-on-close, SEM lookahead).
 *
 * Trade: entra no fechamento t (entry = close[t]), resultado no fechamento
 * t+1 (close[t+1]) do timeframe escolhido.
 */

export type TradeResult = "win" | "loss" | "void";

export interface BacktestTradeRecord {
  ts: number;
  direction: Direction;
  score: number;
  strategy: string;
  entryPrice: number;
  result: TradeResult;
}

export interface ScoreBandStat {
  band: string;
  min: number;
  max: number;
  trades: number;
  wins: number;
  winRate: number;
}

export interface GroupStat {
  key: string;
  trades: number;
  wins: number;
  winRate: number;
}

export interface BacktestStats {
  total: number;
  wins: number;
  losses: number;
  voids: number;
  winRate: number;
  maxDrawdown: number;
  maxLossStreak: number;
  expectancy: number;
  equity: number[];
  byScore: ScoreBandStat[];
  byStrategy: GroupStat[];
  byHour: GroupStat[];
  byAsset: GroupStat[];
}

export interface BacktestRunResult {
  trades: BacktestTradeRecord[];
  stats: BacktestStats;
}

export interface BacktestOptions {
  timeframe: Timeframe;
  /** filtro de REGISTRO apenas — não bloqueia o motor */
  scoreMin?: number;
  /** risco % por trade na curva de equity simulada */
  riskPct?: number;
  /** payout % (win) na curva de equity simulada */
  payoutPct?: number;
  /** callback async por lote (ex.: 5000 candles) — atualiza progresso/DB */
  onProgress?: (processed: number, total: number, chunkTrades: BacktestTradeRecord[]) => Promise<void> | void;
  /** interrompe a execução */
  signal?: AbortSignal;
  label?: string;
}

export const SCORE_BANDS: { band: string; min: number; max: number }[] = [
  { band: "50–59", min: 50, max: 59 },
  { band: "60–69", min: 60, max: 69 },
  { band: "70–79", min: 70, max: 79 },
  { band: "80–89", min: 80, max: 89 },
  { band: "90–100", min: 90, max: 100 },
];

/** Resolve o resultado de um trade: close t+1 vs entry (close t). */
export function resolveCloseOnClose(direction: Direction, entry: number, nextClose: number): TradeResult {
  if (nextClose === entry) return "void";
  if (direction === "CALL") return nextClose > entry ? "win" : "loss";
  return nextClose < entry ? "win" : "loss";
}

export function computeStats(trades: BacktestTradeRecord[], riskPct: number, payoutPct: number): BacktestStats {
  const total = trades.length;
  const wins = trades.filter((t) => t.result === "win").length;
  const losses = trades.filter((t) => t.result === "loss").length;
  const voids = trades.filter((t) => t.result === "void").length;

  // curva de equity (base 100, risco fixo fracional)
  let equity = 100;
  const equityCurve: number[] = [100];
  let peak = 100;
  let maxDD = 0;
  let lossStreak = 0;
  let maxLossStreak = 0;
  let pnlSum = 0;

  for (const t of trades) {
    const pnlFrac =
      t.result === "win" ? (payoutPct / 100) * (riskPct / 100) : t.result === "loss" ? -(riskPct / 100) : 0;
    pnlSum += pnlFrac;
    equity = equity * (1 + pnlFrac);
    equityCurve.push(equity);
    if (equity > peak) peak = equity;
    const dd = ((peak - equity) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
    lossStreak = t.result === "loss" ? lossStreak + 1 : 0;
    if (lossStreak > maxLossStreak) maxLossStreak = lossStreak;
  }

  const winRate = wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0;
  const expectancy = total > 0 ? pnlSum / total : 0;

  // desempenho por faixa de score
  const byScore: ScoreBandStat[] = SCORE_BANDS.map((b) => {
    const bandTrades = trades.filter((t) => t.score >= b.min && t.score <= b.max);
    const bandWins = bandTrades.filter((t) => t.result === "win").length;
    return {
      band: b.band,
      min: b.min,
      max: b.max,
      trades: bandTrades.length,
      wins: bandWins,
      winRate: bandTrades.length ? (bandWins / bandTrades.filter((t) => t.result !== "void").length) * 100 : 0,
    };
  });

  const groupBy = (keyFn: (t: BacktestTradeRecord) => string): GroupStat[] => {
    const map = new Map<string, { trades: number; wins: number }>();
    for (const t of trades) {
      const k = keyFn(t);
      const e = map.get(k) ?? { trades: 0, wins: 0 };
      e.trades++;
      if (t.result === "win") e.wins++;
      map.set(k, e);
    }
    return [...map.entries()]
      .map(([key, v]) => ({
        key,
        trades: v.trades,
        wins: v.wins,
        winRate: v.trades ? (v.wins / v.trades) * 100 : 0,
      }))
      .sort((a, b) => b.trades - a.trades);
  };

  return {
    total,
    wins,
    losses,
    voids,
    winRate,
    maxDrawdown: maxDD,
    maxLossStreak,
    expectancy,
    equity: equityCurve,
    byScore,
    byStrategy: groupBy((t) => t.strategy || "Outros"),
    byHour: groupBy((t) => String(new Date(t.ts * 1000).getUTCHours())),
    byAsset: groupBy((t) => "single"),
  };
}

/**
 * Executa o backtest sobre candles 1m (upserted do CSV ou live).
 * O loop roda em LOTES (5000 candles) chamando onProgress entre lote e lote
 * — evita timeout em ambiente serverless.
 */
export async function runBacktest(
  candles1m: Candle[],
  opts: BacktestOptions
): Promise<BacktestRunResult> {
  const { timeframe, scoreMin = 50, riskPct = 1, payoutPct = 80, onProgress, signal } = opts;
  const base = aggregateTo(candles1m, timeframe);
  const trades: BacktestTradeRecord[] = [];
  const BATCH = 5000;

  const total = Math.max(0, base.length - MIN_CANDLES - 1);
  let processed = 0;

  for (let start = MIN_CANDLES; start < base.length - 1; start += BATCH) {
    const end = Math.min(base.length - 1, start + BATCH);
    for (let i = start; i < end; i++) {
      if (signal?.aborted) return { trades, stats: computeStats(trades, riskPct, payoutPct) };
      const window = base.slice(Math.max(0, i - LOOKBACK + 1), i + 1);
      const r = runEngine({ candles5m: window });
      processed++;
      if (r.valid && r.score >= scoreMin && r.direction !== "NEUTRAL") {
        const result = resolveCloseOnClose(r.direction, r.entryPrice, base[i + 1].close);
        trades.push({
          ts: base[i].ts,
          direction: r.direction,
          score: r.score,
          strategy: r.strategy,
          entryPrice: r.entryPrice,
          result,
        });
      }
    }
    if (onProgress) await onProgress(processed, total, trades.slice());
  }

  const stats = computeStats(trades, riskPct, payoutPct);
  return { trades, stats };
}