import type { Candle, Timeframe } from "./types";

/**
 * Agrega candles de timeframe menor para maior (ex.: 1m -> 5m -> 15m)
 * por FECHAMENTO (close-on-complete).
 *
 * Regras:
 * - Agrupa por bloco alinhado ao timeframe (bucket = floor(ts / tf) * tf).
 * - Só blocos COMPLETOS entram: um bloco só existe se sua janela inteira
 *   já decorreu (bucketEnd <= último ts). NUNCA inventa candle parcial.
 * - Retorna array ordenado por ts crescente.
 */
export function aggregate(candles: Candle[], tfSeconds: number): Candle[] {
  if (!candles.length) return [];

  const sorted = [...candles].sort((a, b) => a.ts - b.ts);
  const lastTs = sorted[sorted.length - 1].ts;

  const buckets = new Map<number, Candle>();

  for (const c of sorted) {
    const bucketStart = Math.floor(c.ts / tfSeconds) * tfSeconds;
    const existing = buckets.get(bucketStart);
    if (!existing) {
      buckets.set(bucketStart, {
        ts: bucketStart,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      });
    } else {
      existing.high = Math.max(existing.high, c.high);
      existing.low = Math.min(existing.low, c.low);
      existing.close = c.close;
    }
  }

  const out: Candle[] = [];
  for (const c of buckets.values()) {
    const bucketEnd = c.ts + tfSeconds;
    // bloco completo apenas se a janela já fechou nos dados disponíveis
    if (bucketEnd <= lastTs) out.push(c);
  }

  return out.sort((a, b) => a.ts - b.ts);
}

const TF_SECONDS: Record<Timeframe, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
};

/** Agregação 1m -> 5m. */
export function aggregateTo5m(candles1m: Candle[]): Candle[] {
  return aggregate(candles1m, TF_SECONDS["5m"]);
}

/** Agregação 1m -> 15m. */
export function aggregateTo15m(candles1m: Candle[]): Candle[] {
  return aggregate(candles1m, TF_SECONDS["15m"]);
}

/** Agregação genérica por timeframe nomeado. */
export function aggregateTo(candles: Candle[], tf: Timeframe): Candle[] {
  return aggregate(candles, TF_SECONDS[tf]);
}