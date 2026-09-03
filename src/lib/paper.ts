import type { Direction, SignalResult, Timeframe } from "@/lib/engine";

/**
 * PAPER TRADING — lógica pura (sem I/O). O resolver com banco fica em
 * /lib/services/paperResolution.ts (usado pelo cron).
 */

/** Payout % sobre o stake em caso de WIN (configurável via env). */
export function paperPayoutPct(): number {
  return Number(process.env.PAPER_PAYOUT_PCT ?? 80);
}

/** Duração do timeframe em segundos (expiração do sinal). */
export const TF_DURATION_SECONDS: Record<Timeframe, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
};

/** Stake = banca * risco% / 100. */
export function calculateStake(banca: number, riscoPct: number): number {
  const stake = (banca * riscoPct) / 100;
  return Math.max(0, stake);
}

/** Resultado: fechamento na expiração vs entrada. */
export function resolveResult(direction: Direction, entry: number, exit: number): SignalResult {
  if (exit === entry) return "void";
  if (direction === "CALL") return exit > entry ? "win" : "loss";
  return exit < entry ? "win" : "loss";
}

/** PnL em unidades monetárias (R$): win → +stake*payout%, loss → -stake, void → 0. */
export function resolvePnl(result: SignalResult, stake: number): number {
  if (result === "win") return stake * (paperPayoutPct() / 100);
  if (result === "loss") return -stake;
  return 0;
}

/** Expiração = hora do candle de entrada + duração do timeframe. */
export function expiresAt(entryTs: number, timeframe: Timeframe): number {
  return entryTs + TF_DURATION_SECONDS[timeframe];
}

export function timeframeLabel(tf: Timeframe): string {
  return tf === "15m" ? "15 minutos" : tf === "1m" ? "1 minuto" : "5 minutos";
}