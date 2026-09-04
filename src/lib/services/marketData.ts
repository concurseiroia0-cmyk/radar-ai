import type { Candle } from "@/lib/engine";
import { creditsEstimateToday } from "@/lib/schedule";

/**
 * Dados de mercado — Twelve Data (multi-chave, em rotação) + fallback Finnhub.
 * Sem chaves configuradas retorna null (nunca lança).
 *
 * MULTI-CHAVE (800 créditos/dia por conta gratuita):
 *   TWELVEDATA_KEY   → chave 1
 *   TWELVEDATA_KEY2  → chave 2
 *   TWELVEDATA_KEY3  → chave 3 (suporta até 5)
 * O cron busca TODOS os ativos a cada tick (~2 min — mesma cadência que manteve
 * os sinais fluindo), usando a chave 1 enquanto houver cota do dia, depois a 2,
 * depois a 3; esgotadas todas, segue no Finnhub no mesmo ritmo (sem parar).
 * timezone=UTC é obrigatório na chamada à API (senão os candles vêm com o
 * fuso do ativo, ~+10h, e são gravados com timestamp no futuro).
 */

const TIMEOUT_MS = 12_000;

/** Chaves Twelve Data configuradas, na ordem (chave 1 → 2 → 3 …). */
export function twelveDataKeys(): string[] {
  const out: string[] = [];
  for (const k of ["TWELVEDATA_KEY", "TWELVEDATA_KEY2", "TWELVEDATA_KEY3", "TWELVEDATA_KEY4", "TWELVEDATA_KEY5"]) {
    const v = process.env[k];
    if (v) out.push(v);
  }
  return out;
}

export function twelveDataKeyCount(): number {
  return twelveDataKeys().length;
}

/** Teto por chave (free = 800; usamos 790 de margem). TWELVEDATA_KEY_BUDGET sobrescreve. */
export function twelveDataPerKeyBudget(): number {
  const n = Number(process.env.TWELVEDATA_KEY_BUDGET ?? 790);
  return Number.isFinite(n) && n > 0 ? n : 790;
}

/** Teto TOTAL do dia = soma das cotas de todas as chaves configuradas. */
export function twelveDataTotalBudget(): number {
  return twelveDataKeyCount() * twelveDataPerKeyBudget();
}

export interface TdPlan {
  keyCount: number;
  perKeyBudget: number;
  totalBudget: number;
  /** Créditos estimados já consumidos hoje (eixo dia UTC). */
  usedToday: number;
  remaining: number;
  /** Chave ativa neste momento (0-based) — null se todas esgotadas. */
  activeKey: number | null;
  exhausted: boolean;
}

/**
 * Estado Twelve Data do momento (o cron busca TODOS os ativos a cada tick,
 * ~2 min — mesma cadência que manteve os sinais fluindo):
 *  - usa a Twelve Data enquanto houver cota do dia, rotacionando chave 1 → 2 → 3
 *    (estimativa determinística por faixa de créditos no eixo do dia UTC);
 *  - quando todas as chaves esgotam, o cron segue no Finnhub no mesmo ritmo.
 * Sem chave configurada → exhausted=true (Finnhub direto).
 */
export function tdPlan(
  now: Date = new Date(),
  counts: { forex: number; stock: number } = { forex: 11, stock: 3 },
  tickMin = 2
): TdPlan {
  const keyCount = twelveDataKeyCount();
  const perKeyBudget = twelveDataPerKeyBudget();
  const totalBudget = keyCount * perKeyBudget;
  if (!keyCount) {
    return { keyCount: 0, perKeyBudget, totalBudget: 0, usedToday: 0, remaining: 0, activeKey: null, exhausted: true };
  }

  const tick = Math.max(1, Math.min(60, Math.round(tickMin) || 2));
  const usedToday = Math.min(totalBudget, creditsEstimateToday(now, counts, tick));
  const exhausted = usedToday >= totalBudget;
  const activeKey = exhausted ? null : Math.min(keyCount - 1, Math.floor(usedToday / perKeyBudget));

  return {
    keyCount,
    perKeyBudget,
    totalBudget,
    usedToday,
    remaining: Math.max(0, totalBudget - usedToday),
    activeKey,
    exhausted,
  };
}

interface TwelveDataValue {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
}

/** 1 requisição com uma chave específica → candles (ou null em erro/limite). */
async function tdRequest(symbol: string, interval: string, outputsize: number, key: string): Promise<Candle[] | null> {
  // timezone=UTC é OBRIGATÓRIO: sem ele a Twelve Data devolve o datetime no
  // fuso do ativo (~+10h p/ forex) e o parser (que assume UTC) grava candles
  // com timestamp no FUTURO — o que travou o gatilho de "nova vela 5m" do cron.
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${outputsize}&timezone=UTC&apikey=${key}`;
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const json = (await res.json()) as { status?: string; values?: TwelveDataValue[] };
    if (json.status !== "ok" || !json.values?.length) return null;
    const nowSec = Math.floor(Date.now() / 1000);
    // values vêm mais recentes primeiro → inverter p/ ordem crescente
    return json.values
      .map((v) => ({
        ts: twelveDataToEpoch(v.datetime),
        open: parseFloat(v.open),
        high: parseFloat(v.high),
        low: parseFloat(v.low),
        close: parseFloat(v.close),
      }))
      // defesa em profundidade: descarta qualquer candle com ts no futuro
      // (além da tolerância de relógio) ou absurdamente antigo
      .filter((c) => Number.isFinite(c.ts) && c.ts <= nowSec + 150 && c.ts >= nowSec - 45 * 86400)
      .sort((a, b) => a.ts - b.ts);
  } catch {
    return null;
  }
}

/**
 * Busca na Twelve Data começando pela chave `startKeyIndex` e, se ela falhar
 * (limite diário/por minuto ou erro), tenta as próximas — até a última e então
 * volta à primeira. Retorna { candles, keyIndex } (keyIndex = chave usada).
 */
export async function fetchTwelveDataRotated(
  symbol: string,
  interval: "1min" | "5min" | "15min" = "1min",
  outputsize = 200,
  startKeyIndex = 0
): Promise<{ candles: Candle[] | null; keyIndex: number }> {
  const keys = twelveDataKeys();
  if (!keys.length) return { candles: null, keyIndex: -1 };
  const start = Math.max(0, Math.min(keys.length - 1, startKeyIndex));
  for (let i = 0; i < keys.length; i++) {
    const idx = (start + i) % keys.length;
    const candles = await tdRequest(symbol, interval, outputsize, keys[idx]);
    if (candles?.length) return { candles, keyIndex: idx };
  }
  return { candles: null, keyIndex: -1 };
}

export async function fetchCandlesTwelveData(
  symbol: string,
  interval: "1min" | "5min" | "15min" = "1min",
  outputsize = 200
): Promise<Candle[] | null> {
  const { candles } = await fetchTwelveDataRotated(symbol, interval, outputsize, 0);
  return candles;
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
  const isFx = symbol.includes("/");
  // forex/commodities na Finnhub vivem sob o prefixo OANDA: (ex.: OANDA:EUR_USD);
  // ações dos EUA (AAPL, TSLA…) usam o símbolo direto.
  const query = isFx ? `OANDA:${symbol.replace("/", "_")}` : symbol;
  const url = `https://finnhub.io/api/v1/stock/candle?symbol=${query}&resolution=${resolution}&count=${count}&token=${key}`;
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

/** Twelve Data (todas as chaves) primeiro; Finnhub como fallback. */
export async function fetchCandles(symbol: string, outputsize = 200): Promise<Candle[] | null> {
  const td = await fetchCandlesTwelveData(symbol, "1min", outputsize);
  if (td && td.length) return td;
  const fh = await fetchCandlesFinnhub(symbol, "1", outputsize);
  if (fh && fh.length) return fh;
  return null;
}

export function hasMarketDataProvider(): boolean {
  return Boolean(twelveDataKeys().length || process.env.FINNHUB_KEY);
}
