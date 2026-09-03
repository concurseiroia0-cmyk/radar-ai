import type { Candle, IndicatorPack, MacdState, Trend } from "./types";
import { candlesToCloses, candlesToHighs, candlesToLows, maxOf, minOf } from "./utils";

/* ------------------------------------------------------------------ */
/* EMA                                                                 */
/* ------------------------------------------------------------------ */

/**
 * EMA iterativa padrão: seed = SMA dos primeiros `period` valores,
 * depois EMA = close * k + prevEMA * (1 - k), k = 2 / (period + 1).
 * Retorna a série completa (mesmo tamanho da entrada; os primeiros
 * `period - 1` valores são preenchidos com null-safe de chamada).
 */
export function emaSeries(closes: number[], period: number): number[] {
  const out: number[] = new Array(closes.length);
  if (closes.length < period) return out.fill(NaN);

  let sum = 0;
  for (let i = 0; i < period; i++) sum += closes[i];
  const k = 2 / (period + 1);
  let prev = sum / period;
  for (let i = 0; i < period; i++) out[i] = prev;
  for (let i = period; i < closes.length; i++) {
    prev = closes[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Valor atual (último) da EMA. */
export function ema(closes: number[], period: number): number | null {
  const s = emaSeries(closes, period);
  const v = s[s.length - 1];
  return Number.isFinite(v) ? v : null;
}

/* ------------------------------------------------------------------ */
/* RSI (Wilder)                                                        */
/* ------------------------------------------------------------------ */

export function rsiSeries(closes: number[], period = 14): number[] {
  const out: number[] = new Array(closes.length).fill(NaN);
  if (closes.length <= period) return out;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gainSum += d;
    else lossSum -= d;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = rsiFromAverages(avgGain, avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = rsiFromAverages(avgGain, avgLoss);
  }
  return out;
}

function rsiFromAverages(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return 100;
  if (avgGain === 0) return 0;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** RSI (Wilder) atual. */
export function rsi(closes: number[], period = 14): number | null {
  const s = rsiSeries(closes, period);
  const v = s[s.length - 1];
  return Number.isFinite(v) ? v : null;
}

/* ------------------------------------------------------------------ */
/* MACD (12, 26, 9)                                                    */
/* ------------------------------------------------------------------ */

export interface MacdResult {
  line: number;
  signal: number;
  hist: number;
  state: MacdState;
}

export function macd(closes: number[], fast = 12, slow = 26, signalPeriod = 9): MacdResult | null {
  if (closes.length < slow + signalPeriod) return null;
  const emaFast = emaSeries(closes, fast);
  const emaSlow = emaSeries(closes, slow);
  const lineSeries: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    // ambos finitos a partir de slow-1
    lineSeries.push(emaFast[i] - emaSlow[i]);
  }
  // EMA da linha apenas sobre o trecho válido (evita poluir o seed com NaN/0)
  const valid = lineSeries.slice(slow - 1);
  const sigValid = emaSeries(valid, signalPeriod);
  const signalSeries: number[] = [...new Array(slow - 1).fill(NaN), ...sigValid];
  const n = closes.length;
  const line = lineSeries[n - 1];
  const sig = signalSeries[n - 1];
  const hist = line - sig;
  return { line, signal: sig, hist, state: macdState(hist) };
}

/** Estado do histograma: positivo/negativo/zero com banda ~0.00005 (forex 5m). */
export function macdState(hist: number): MacdState {
  if (hist > 0.00005) return "positivo";
  if (hist < -0.00005) return "negativo";
  return "zero";
}

/* ------------------------------------------------------------------ */
/* ATR (Wilder)                                                        */
/* ------------------------------------------------------------------ */

function trueRange(c: Candle, prevClose: number): number {
  return Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
}

export function atrSeries(candles: Candle[], period = 14): number[] {
  const out: number[] = new Array(candles.length).fill(NaN);
  if (candles.length <= period) return out;

  let trSum = 0;
  for (let i = 1; i <= period; i++) trSum += trueRange(candles[i], candles[i - 1].close);
  let prev = trSum / period;
  out[period] = prev;
  for (let i = period + 1; i < candles.length; i++) {
    prev = (prev * (period - 1) + trueRange(candles[i], candles[i - 1].close)) / period;
    out[i] = prev;
  }
  return out;
}

/** ATR (Wilder) atual. */
export function atr(candles: Candle[], period = 14): number | null {
  const s = atrSeries(candles, period);
  const v = s[s.length - 1];
  return Number.isFinite(v) ? v : null;
}

/** ATR % = (ATR / close) * 100. */
export function atrPercent(atrValue: number, close: number): number {
  if (!close) return 0;
  return (atrValue / close) * 100;
}

/* ------------------------------------------------------------------ */
/* Tendência                                                           */
/* ------------------------------------------------------------------ */

/**
 * Detecta tendência pela pilha de EMAs.
 * - alta:  EMA9 > EMA21 > EMA50
 * - baixa: EMA9 < EMA21 < EMA50
 * - lateral: EMAs dentro de uma faixa estreita (threshold flexível, não agressivo)
 * - indefinida: qualquer outra configuração (cautela)
 */
export function detectTrend(e9: number, e21: number, e50: number): Trend {
  const band9 = 0.0005; // 0.05% — faixa flexível, não hardcode agressivo
  const band21 = 0.0005;
  if (e9 > e21 && e21 > e50) return "alta";
  if (e9 < e21 && e21 < e50) return "baixa";
  if (Math.abs(e9 - e21) / e21 <= band9 && Math.abs(e21 - e50) / e50 <= band21) {
    return "lateral";
  }
  return "indefinida";
}

/* ------------------------------------------------------------------ */
/* Suporte / Resistência (swing points)                                */
/* ------------------------------------------------------------------ */

export interface SrResult {
  support: number[];
  resistance: number[];
  swingHigh: number | null;
  swingLow: number | null;
}

/**
 * Detecção de suporte/resistência por swing points (máximas/mínimas locais)
 * em janela conservadora (~20–40 candles). Os níveis são agrupados em zonas
 * (valores próximos viram uma única zona na média) e retornadas as zonas
 * mais próximas do preço atual (dentro de ~1.5%).
 */
export function supportResistance(
  candles: Candle[],
  opts: { swingWindow?: number; lookback?: number; maxZonesPerSide?: number; maxZoneDistPct?: number } = {}
): SrResult {
  const { swingWindow = 10, lookback = 140, maxZonesPerSide = 3, maxZoneDistPct = 1.5 } = opts;
  if (candles.length < 30) return { support: [], resistance: [], swingHigh: null, swingLow: null };

  const start = Math.max(0, candles.length - lookback);
  const window = candles.slice(start);
  const n = window.length;
  const highs = candlesToHighs(window);
  const lows = candlesToLows(window);
  const closes = candlesToCloses(window);
  const lastClose = closes[n - 1];

  const swingHighs: number[] = [];
  const swingLows: number[] = [];

  for (let i = swingWindow; i < n - swingWindow; i++) {
    let isHi = true;
    let isLo = true;
    for (let j = i - swingWindow; j <= i + swingWindow; j++) {
      if (j === i) continue;
      if (highs[j] >= highs[i]) isHi = false;
      if (lows[j] <= lows[i]) isLo = false;
      if (!isHi && !isLo) break;
    }
    if (isHi) swingHighs.push(highs[i]);
    if (isLo) swingLows.push(lows[i]);
  }

  // swing mais recente
  let swingHigh: number | null = null;
  let swingLow: number | null = null;
  for (let i = n - 1; i >= 0; i--) {
    let isHi = true;
    let isLo = true;
    for (let j = Math.max(0, i - swingWindow); j <= Math.min(n - 1, i + swingWindow); j++) {
      if (j === i) continue;
      if (highs[j] >= highs[i]) isHi = false;
      if (lows[j] <= lows[i]) isLo = false;
    }
    if (isHi && swingHigh === null) swingHigh = highs[i];
    if (isLo && swingLow === null) swingLow = lows[i];
    if (swingHigh !== null && swingLow !== null) break;
  }

  // agrupar em zonas (merge distância ~0.25 * ATR ou 0.03%)
  const mergeDist = Math.max((atr(window) ?? lastClose * 0.001) * 0.25, lastClose * 0.0003);
  const cluster = (values: number[]): number[] => {
    const sorted = [...values].sort((a, b) => a - b);
    const zones: number[] = [];
    for (const v of sorted) {
      const lastZone = zones[zones.length - 1];
      if (lastZone !== undefined && v - lastZone <= mergeDist * 2) {
        zones[zones.length - 1] = (lastZone + v) / 2;
      } else {
        zones.push(v);
      }
    }
    return zones;
  };

  const maxDist = (lastClose * maxZoneDistPct) / 100;
  const support = cluster(swingLows)
    .filter((z) => z < lastClose && lastClose - z <= maxDist)
    .sort((a, b) => b - a)
    .slice(0, maxZonesPerSide);
  const resistance = cluster(swingHighs)
    .filter((z) => z > lastClose && z - lastClose <= maxDist)
    .sort((a, b) => a - b)
    .slice(0, maxZonesPerSide);

  return { support, resistance, swingHigh, swingLow };
}

/* ------------------------------------------------------------------ */
/* Lateralidade / Volatilidade                                         */
/* ------------------------------------------------------------------ */

/**
 * Lateralidade por faixa (range) vs ATR — threshold flexível.
 * Range dos últimos N candles pequeno em relação ao ATR (ou em % absoluto)
 * indica consolidação/lateralidade. Conservador: só marca lateral quando
 * claramente apertado.
 */
export function isSidewaysRange(candles: Candle[], atrValue: number, windowSize = 60): boolean {
  if (candles.length < windowSize) return false;
  const window = candles.slice(-windowSize);
  const hi = maxOf(candlesToHighs(window));
  const lo = minOf(candlesToLows(window));
  const range = hi - lo;
  if (atrValue <= 0) return false;
  if (range < atrValue * 2.0) return true; // faixa menor que 2x ATR → apertado
  const rangePct = (range / lo) * 100;
  return rangePct < 0.06; // < 0.06% de amplitude em 60 candles → flat
}

/** Faixa de ATR% inicial conservadora (apenas filtro, não bloqueia sem motivo). */
export const VOL_MIN_ATR_PCT = 0.03;
export const VOL_MAX_ATR_PCT = 0.25;

export function volatilityOk(atrPct: number, atrValue: number, close: number): { volOk: boolean; atrOk: boolean } {
  const atrOk = atrValue > 0 && close > 0 && atrPct > 0.01; // não flat
  const volOk = atrOk && atrPct >= VOL_MIN_ATR_PCT && atrPct <= VOL_MAX_ATR_PCT;
  return { volOk, atrOk };
}

/* ------------------------------------------------------------------ */
/* IndicatorPack (montagem)                                            */
/* ------------------------------------------------------------------ */

/**
 * Monta o IndicatorPack a partir dos candles 5m fechados.
 * candles1m/candles15m podem ser passados para contexto futuro;
 * a decisão base é sempre o 5m (close-on-complete).
 */
export function buildIndicatorPack(candles5m: Candle[]): IndicatorPack {
  const closes = candlesToCloses(candles5m);
  const lastClose = closes[closes.length - 1];

  const e9 = ema(closes, 9) ?? lastClose;
  const e21 = ema(closes, 21) ?? lastClose;
  const e50 = ema(closes, 50) ?? lastClose;
  const trend = detectTrend(e9, e21, e50);
  const rsiValue = rsi(closes, 14) ?? 50;
  const macdResult = macd(closes) ?? { line: 0, signal: 0, hist: 0, state: "zero" as MacdState };
  const atrValue = atr(candles5m, 14) ?? lastClose * 0.001;
  const atrPct = atrPercent(atrValue, lastClose);
  const { volOk, atrOk } = volatilityOk(atrPct, atrValue, lastClose);
  const sr = supportResistance(candles5m);
  const sideways = isSidewaysRange(candles5m, atrValue) || trend === "lateral";

  return {
    trend,
    ema9: e9,
    ema21: e21,
    ema50: e50,
    rsi: rsiValue,
    macd: macdResult,
    atr: atrValue,
    atrPercent: atrPct,
    support: sr.support,
    resistance: sr.resistance,
    swingHigh: sr.swingHigh,
    swingLow: sr.swingLow,
    isSideways: sideways,
    volOk,
    atrOk,
  };
}