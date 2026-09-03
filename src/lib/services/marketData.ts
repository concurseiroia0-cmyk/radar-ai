import type { Candle } from "@/lib/engine";

/**
 * Dados de mercado — Twelve Data primeiro, fallback Finnhub.
 * Sem chaves configuradas retorna null (nunca lança).
 */

const TIMEOUT_MS = 12_000;

interface TwelveDataValue {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
}

export async function fetchCandlesTwelveData(
  symbol: string,
  interval: "1min" | "5min" | "15min" = "1min",
  outputsize = 200
): Promise<Candle[] | null> {
  const key = process.env.TWELVEDATA_KEY;
  if (!key) return null;
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${outputsize}&apikey=${key}`;
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const json = (await res.json()) as { status?: string; values?: TwelveDataValue[] };
    if (json.status !== "ok" || !json.values?.length) return null;
    // values vêm mais recentes primeiro → inverter p/ ordem crescente
    return json.values
      .map((v) => ({
        ts: twelveDataToEpoch(v.datetime),
        open: parseFloat(v.open),
        high: parseFloat(v.high),
        low: parseFloat(v.low),
        close: parseFloat(v.close),
      }))
      .filter((c) => Number.isFinite(c.ts))
      .sort((a, b) => a.ts - b.ts);
  } catch {
    return null;
  }
}

/** Converte "2024-01-15 10:35:00" (ou ISO) para unix epoch SECONDS. */
export function twelveDataToEpoch(datetime: string): number {
  const d = new Date(datetime.replace(" ", "T") + "Z");
  const t = d.getTime();
  return Number.isFinite(t) ? Math.floor(t / 1000) : NaN;
}

interface FinnhubCandle {
  s: string;
  t: number[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
}

export async function fetchCandlesFinnhub(
  symbol: string,
  resolution: "1" | "5" | "15" = "1",
  count = 200
): Promise<Candle[] | null> {
  const key = process.env.FINNHUB_KEY;
  if (!key) return null;
  const oanda = symbol.replace("/", "_");
  const url = `https://finnhub.io/api/v1/stock/candle?symbol=OANDA:${oanda}&resolution=${resolution}&count=${count}&token=${key}`;
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const json = (await res.json()) as FinnhubCandle;
    if (json.s !== "ok" || !json.t?.length) return null;
    return json.t.map((ts, i) => ({
      ts, // finnhub já retorna em segundos
      open: json.o[i],
      high: json.h[i],
      low: json.l[i],
      close: json.c[i],
    }));
  } catch {
    return null;
  }
}

/** Twelve Data primeiro; Finnhub como fallback. */
export async function fetchCandles(symbol: string, outputsize = 200): Promise<Candle[] | null> {
  const td = await fetchCandlesTwelveData(symbol, "1min", outputsize);
  if (td && td.length) return td;
  const fh = await fetchCandlesFinnhub(symbol, "1", outputsize);
  if (fh && fh.length) return fh;
  return null;
}

export function hasMarketDataProvider(): boolean {
  return Boolean(process.env.TWELVEDATA_KEY || process.env.FINNHUB_KEY);
}