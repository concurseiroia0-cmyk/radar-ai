import type { Candle, Direction, IndicatorPack, StrategyHit } from "./types";
import { relDist } from "./utils";

/* ------------------------------------------------------------------ */
/* Helpers de candle (compartilhados com score.ts)                     */
/* ------------------------------------------------------------------ */

/** Corpo relevante: |close-open| >= 35% da amplitude. */
export function hasRelevantBody(c: Candle): boolean {
  const range = c.high - c.low;
  if (range <= 0) return false;
  return Math.abs(c.close - c.open) / range >= 0.35;
}

/** Candle de confirmação de alta: close acima das máximas dos 2-3 candles anteriores + corpo. */
export function isBullishConfirm(candles: Candle[], i: number): boolean {
  if (i < 2) return false;
  const c = candles[i];
  const prevHigh = Math.max(candles[i - 1].high, candles[i - 2].high);
  return c.close > prevHigh && hasRelevantBody(c) && c.close > c.open;
}

/** Candle de confirmação de baixa: close abaixo das mínimas dos 2-3 candles anteriores + corpo. */
export function isBearishConfirm(candles: Candle[], i: number): boolean {
  if (i < 2) return false;
  const c = candles[i];
  const prevLow = Math.min(candles[i - 1].low, candles[i - 2].low);
  return c.close < prevLow && hasRelevantBody(c) && c.close < c.open;
}

export function isBullishEngulf(candles: Candle[], i: number): boolean {
  if (i < 1) return false;
  const c = candles[i];
  const p = candles[i - 1];
  return c.close > c.open && c.open <= p.close && c.close > p.open && hasRelevantBody(c);
}

export function isBearishEngulf(candles: Candle[], i: number): boolean {
  if (i < 1) return false;
  const c = candles[i];
  const p = candles[i - 1];
  return c.close < c.open && c.open >= p.close && c.close < p.open && hasRelevantBody(c);
}

const MAX_REL_DIST = 0.0015; // ~0.15% — distância razoável p/ pullback/zona

function near(value: number, target: number, maxRel = MAX_REL_DIST): boolean {
  return relDist(value, target) <= maxRel;
}

function nearAnyZone(value: number, zones: number[], maxRel = MAX_REL_DIST): boolean {
  return zones.some((z) => near(value, z, maxRel));
}

/* ------------------------------------------------------------------ */
/* Estratégias                                                         */
/* ------------------------------------------------------------------ */

export interface StrategyEvaluation {
  hits: StrategyHit[];
  direction: Direction;
  winner: string;
}

/**
 * Avalia as 4 estratégias sobre o último candle FECHADO (index lastIdx).
 * Retorna hits + melhor direção sugerida + estratégia vencedora.
 */
export function evaluateStrategies(ind: IndicatorPack, candles5m: Candle[], lastIdx: number): StrategyEvaluation {
  const i = lastIdx;
  const c = candles5m[i];
  const closes = candles5m.map((x) => x.close);

  const bullishCandle = isBullishConfirm(candles5m, i) || isBullishEngulf(candles5m, i);
  const bearishCandle = isBearishConfirm(candles5m, i) || isBearishEngulf(candles5m, i);

  /* ---------------- Estratégia 1: Tendência + Pullback ---------------- */
  const trendUp = ind.trend === "alta" && ind.ema9 > ind.ema21 && ind.ema21 > ind.ema50;
  const trendDown = ind.trend === "baixa" && ind.ema9 < ind.ema21 && ind.ema21 < ind.ema50;

  const pullbackUp =
    trendUp &&
    (near(c.close, ind.ema21) || near(c.close, ind.ema50) || nearAnyZone(c.close, ind.support)) &&
    bullishCandle;

  const pullbackDown =
    trendDown &&
    (near(c.close, ind.ema21) || near(c.close, ind.ema50) || nearAnyZone(c.close, ind.resistance)) &&
    bearishCandle;

  const s1: StrategyHit = {
    name: "Tendência + Pullback",
    passed: pullbackUp || pullbackDown,
    weight: 20,
    reason: pullbackUp
      ? "Tendência alta (EMA9>21>50) + pullback na EMA/zona + candle de confirmação"
      : pullbackDown
        ? "Tendência baixa (EMA9<21<50) + pullback na EMA/zona + candle de confirmação"
        : trendUp
          ? "Tendência alta, mas sem pullback/confirmação"
          : trendDown
            ? "Tendência baixa, mas sem pullback/confirmação"
            : "Sem pilha de EMAs alinhada",
  };

  /* ---------------- Estratégia 2: Suporte/Resistência ---------------- */
  const supHit = nearAnyZone(c.close, ind.support, 0.0012);
  const resHit = nearAnyZone(c.close, ind.resistance, 0.0012);

  const srCall =
    supHit &&
    (bullishCandle || (c.close > c.open && hasRelevantBody(c))) &&
    ind.support.some((z) => c.close > z + ind.atr * 0.05);
  const srPut =
    resHit &&
    (bearishCandle || (c.close < c.open && hasRelevantBody(c))) &&
    ind.resistance.some((z) => c.close < z - ind.atr * 0.05);

  let s2Dir: Direction = "NEUTRAL";
  if (srCall && !srPut) s2Dir = "CALL";
  else if (srPut && !srCall) s2Dir = "PUT";

  const s2: StrategyHit = {
    name: "Suporte/Resistência",
    passed: s2Dir !== "NEUTRAL",
    weight: 20,
    reason: s2Dir === "CALL"
      ? "Reação confirmada em zona de suporte (fechamento acima da região)"
      : s2Dir === "PUT"
        ? "Rejeição confirmada em zona de resistência (fechamento abaixo da região)"
        : supHit && resHit
          ? "Zona dupla — suporte e resistência próximos (estrutura ambígua)"
          : supHit
            ? "Em suporte, mas sem confirmação de reação"
            : resHit
              ? "Em resistência, mas sem confirmação de rejeição"
              : "Fora de zonas de S/R",
  };

  /* ---------------- Estratégia 3: Rompimento (Breakout) ----------------
   * Nível rompido = teto/piso recente (máx/mín dos últimos 15 candles), NÃO a
   * zona de S/R (que por construção fica do lado oposto ao rompimento).
   * Confirmação: fechamento além do teto/piso por margem >= 0.15*ATR + volOk
   * (evita whipsaw — close confirmado, não intrabar).
   */
  const breakoutVolOk = ind.volOk;
  const LOOKBACK_BO = 15;
  let ceiling = -Infinity;
  let floor = Infinity;
  for (let k = Math.max(0, i - LOOKBACK_BO); k < i; k++) {
    if (candles5m[k].high > ceiling) ceiling = candles5m[k].high;
    if (candles5m[k].low < floor) floor = candles5m[k].low;
  }

  const breakoutUp = breakoutVolOk && c.close > ceiling + ind.atr * 0.15;
  const breakoutDown = breakoutVolOk && c.close < floor - ind.atr * 0.15;

  // Retest opcional: preço rompeu antes e voltou para a região sem perder (pullback retest)
  const retestUp =
    breakoutVolOk &&
    c.close > ceiling + ind.atr * 0.05 &&
    candles5m.slice(Math.max(0, i - 3), i).some((k) => k.low < ceiling + ind.atr * 0.05) &&
    bullishCandle;

  const retestDown =
    breakoutVolOk &&
    c.close < floor - ind.atr * 0.05 &&
    candles5m.slice(Math.max(0, i - 3), i).some((k) => k.high > floor - ind.atr * 0.05) &&
    bearishCandle;

  const s3: StrategyHit = {
    name: "Breakout",
    passed: breakoutUp || breakoutDown || retestUp || retestDown,
    weight: 20,
    reason: breakoutUp
      ? `Rompimento de teto confirmado (close acima de ${ceiling.toFixed(5)})`
      : breakoutDown
        ? `Rompimento de piso confirmado (close abaixo de ${floor.toFixed(5)})`
        : retestUp
          ? "Retest de teto rompido confirmado (pullback retest)"
          : retestDown
            ? "Retest de piso rompido confirmado (pullback retest)"
            : "Sem rompimento confirmado",
  };

  /* ---------------- Estratégia 4: Confluência (PRINCIPAL) ---------------- */
  const passed = [s1, s2, s3].filter((h) => h.passed);
  const weightSum = passed.reduce((acc, h) => acc + h.weight, 0);
  const confluent = weightSum >= 40; // >= 2 de 3 estratégias

  const s4: StrategyHit = {
    name: "Confluência",
    passed: confluent,
    weight: weightSum,
    reason: confluent
      ? `${passed.length}/3 estratégias confirmadas (peso ${weightSum}/60)`
      : `Apenas ${passed.length}/3 estratégias confirmadas (peso ${weightSum}/60)`,
  };

  /* ---------------- Direção + vencedora ---------------- */
  const calls = passed.filter((h) => hitDirection(h, s2Dir) === "CALL").length;
  const puts = passed.filter((h) => hitDirection(h, s2Dir) === "PUT").length;

  let direction: Direction = "NEUTRAL";
  if (calls > puts) direction = "CALL";
  else if (puts > calls) direction = "PUT";
  else if (passed.length > 0) {
    direction = ind.trend === "baixa" ? "PUT" : ind.trend === "alta" ? "CALL" : "NEUTRAL";
  }

  let winner = "Nenhuma";
  if (confluent) winner = "Confluência";
  else if (passed.length === 1) winner = passed[0].name;
  else if (passed.length > 1) winner = "Confluência parcial";

  void closes;

  return { hits: [s1, s2, s3, s4], direction, winner };
}

function hitDirection(h: StrategyHit, s2Dir: Direction): Direction {
  switch (h.name) {
    case "Tendência + Pullback":
      return h.reason.startsWith("Tendência alta") ? "CALL" : h.reason.startsWith("Tendência baixa") ? "PUT" : "NEUTRAL";
    case "Suporte/Resistência":
      return s2Dir;
    case "Breakout":
      return h.reason.includes("teto") ? "CALL" : h.reason.includes("piso") ? "PUT" : "NEUTRAL";
    default:
      return "NEUTRAL";
  }
}