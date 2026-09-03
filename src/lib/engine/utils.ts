import type { Candle } from "./types";

/** Clamp value between min and max. */
export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Arredondamento APENAS para exibição — nunca usar em cálculo. */
export function fmt(v: number | null | undefined, decimals = 5): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return v.toFixed(decimals);
}

export function pctChange(a: number, b: number): number {
  if (!b || !Number.isFinite(b)) return 0;
  return ((a - b) / b) * 100;
}

export function last<T>(arr: T[]): T | undefined {
  return arr[arr.length - 1];
}

export function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) sum += values[i];
  return sum / period;
}

export function maxOf(arr: number[]): number {
  let m = -Infinity;
  for (const v of arr) if (v > m) m = v;
  return m;
}

export function minOf(arr: number[]): number {
  let m = Infinity;
  for (const v of arr) if (v < m) m = v;
  return m;
}

/** Média dos candles do bucket — usada em testes e demos. */
export function candlesToCloses(candles: Candle[]): number[] {
  return candles.map((c) => c.close);
}

export function candlesToHighs(candles: Candle[]): number[] {
  return candles.map((c) => c.high);
}

export function candlesToLows(candles: Candle[]): number[] {
  return candles.map((c) => c.low);
}

/** Distância relativa |a-b|/b em percentual. */
export function relDist(a: number, b: number): number {
  if (!b || !Number.isFinite(b)) return Infinity;
  return Math.abs(a - b) / b;
}