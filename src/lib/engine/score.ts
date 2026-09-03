import type { Candle, ConfluenceItem, Direction, IndicatorPack, StrategyHit } from "./types";
import { clamp } from "./utils";
import { isBearishConfirm, isBullishConfirm } from "./strategies";

/**
 * Score TRANSPARENTE 0–100. Distribuição (soma máxima = 100):
 *   Tendência alinhada           +20
 *   Estrutura (S/R + pullback)   +20
 *   Confirmação de candle        +20
 *   Momentum (RSI + MACD)        +20
 *   Volatilidade/Qualidade       +20
 *
 * Cada item vira um ConfluenceItem (label + passed + points) exibido na UI.
 */
export interface ScoreResult {
  score: number;
  confluences: ConfluenceItem[];
}

export function computeScore(
  ind: IndicatorPack,
  direction: Direction,
  strategyHits: StrategyHit[],
  candles5m: Candle[]
): ScoreResult {
  const confluences: ConfluenceItem[] = [];
  const lastIdx = candles5m.length - 1;

  /* 1) Tendência alinhada (20) */
  let tendencia = 0;
  if (direction === "CALL" && ind.trend === "alta") tendencia = 20;
  else if (direction === "PUT" && ind.trend === "baixa") tendencia = 20;
  else if (direction !== "NEUTRAL" && (ind.trend === "lateral" || ind.trend === "indefinida")) tendencia = 5;
  confluences.push({
    label: "Tendência alinhada",
    passed: tendencia >= 20,
    points: tendencia,
  });

  /* 2) Estrutura (S/R + pullback) (20) */
  const s2 = strategyHits.find((h) => h.name === "Suporte/Resistência");
  const s1 = strategyHits.find((h) => h.name === "Tendência + Pullback");
  let estrutura = 0;
  if (s2?.passed) estrutura = 20;
  else if (s1?.passed) estrutura = 16;
  else if (ind.support.length || ind.resistance.length) estrutura = 8;
  confluences.push({
    label: "Estrutura (S/R + pullback)",
    passed: estrutura >= 16,
    points: estrutura,
  });

  /* 3) Confirmação de candle (20) */
  let confirmacao = 0;
  if (lastIdx >= 0) {
    const bull = isBullishConfirm(candles5m, lastIdx);
    const bear = isBearishConfirm(candles5m, lastIdx);
    const c = candles5m[lastIdx];
    if (direction === "CALL" && bull) confirmacao = 20;
    else if (direction === "PUT" && bear) confirmacao = 20;
    else if (direction === "CALL" && c.close > c.open) confirmacao = 10;
    else if (direction === "PUT" && c.close < c.open) confirmacao = 10;
  }
  confluences.push({
    label: "Confirmação de candle",
    passed: confirmacao >= 20,
    points: confirmacao,
  });

  /* 4) Momentum (RSI + MACD) (20) */
  let momentum = 0;
  if (direction === "CALL") {
    momentum += ind.rsi >= 55 && ind.rsi <= 78 ? 10 : ind.rsi >= 50 ? 5 : 0;
    momentum += ind.macd.state === "positivo" ? 10 : ind.macd.state === "zero" ? 4 : 0;
  } else if (direction === "PUT") {
    momentum += ind.rsi <= 45 && ind.rsi >= 22 ? 10 : ind.rsi <= 50 ? 5 : 0;
    momentum += ind.macd.state === "negativo" ? 10 : ind.macd.state === "zero" ? 4 : 0;
  }
  confluences.push({
    label: "Momentum (RSI + MACD)",
    passed: momentum >= 16,
    points: momentum,
  });

  /* 5) Volatilidade/Qualidade do setup (20) */
  let qualidade = 0;
  if (ind.volOk && ind.atrOk) qualidade += 12;
  else if (ind.atrOk) qualidade += 4;
  const structureClean = !(ind.support.length && ind.resistance.length && Math.abs(ind.support[0] - ind.resistance[0]) < ind.atr * 1.5);
  if (structureClean) qualidade += 8;
  confluences.push({
    label: "Volatilidade/Qualidade",
    passed: qualidade >= 16,
    points: qualidade,
  });

  const score = clamp(confluences.reduce((acc, c) => acc + c.points, 0), 0, 100);
  return { score, confluences };
}

/* ------------------------------------------------------------------ */
/* Faixas de score para UI (badges / ScoreBar)                         */
/* ------------------------------------------------------------------ */

export interface ScoreBand {
  min: number;
  max: number;
  color: string;
  label: string;
  emoji: string;
}

export function scoreBandInfo(score: number): ScoreBand {
  if (score >= 85)
    return { min: 85, max: 100, color: "#22d3b5", label: "Excelente", emoji: "🔥" };
  if (score >= 75)
    return { min: 75, max: 84, color: "#16c784", label: "Bom", emoji: "🟢" };
  if (score >= 65)
    return { min: 65, max: 74, color: "#f5a623", label: "Moderado", emoji: "🟡" };
  if (score >= 50)
    return { min: 50, max: 64, color: "#f0b90b", label: "Fraco", emoji: "⚠️" };
  return { min: 0, max: 49, color: "#6b7280", label: "Não operar", emoji: "❌" };
}