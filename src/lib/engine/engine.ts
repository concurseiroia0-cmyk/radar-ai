import type { Candle, Direction, EngineResult } from "./types";
import { buildIndicatorPack } from "./indicators";
import { evaluateStrategies } from "./strategies";
import { applyFilters } from "./filters";
import { computeScore } from "./score";
import type { NewsBlockConfig } from "./types";

export interface EngineInput {
  /** base de decisão (fechamento 5m) — OBRIGATÓRIO */
  candles5m: Candle[];
  /** contexto opcional (1m) — não obrigatório */
  candles1m?: Candle[];
  /** contexto opcional (15m) — não obrigatório */
  candles15m?: Candle[];
  /** config de pausa por notícias (stub) */
  news?: NewsBlockConfig | null;
  /** score mínimo (filtro de registro, NÃO bloqueia o motor) */
  scoreMin?: number;
  /** qualidade v2: nº mínimo de estratégias confirmadas (2 = só Confluência). */
  minStrategies?: number;
  /** qualidade v2: banda RSI saudável [min, max] — bloqueia entrada esticada. */
  rsiBand?: [number, number];
}

export const MIN_CANDLES = 60;
export const LOOKBACK = 400;

/**
 * QUALIDADE v2 — ajustes baseados em backtest sobre os candles REAIS
 * (5 dias de mercado, 719 sinais com score>=75):
 *   - 1 estratégia qualquer  → ~44% win (pior que cara ou coroa)
 *   - 2+ estratégias (Confluência) → ~51% win
 *   - Confluência + RSI 40–65  → ~62% win (robusto nos dois splits temporais)
 * Padrão: exigir Confluência + banda 40–65. Relaxável via EngineInput/env.
 */
export const DEFAULT_MIN_STRATEGIES = 2;
export const DEFAULT_RSI_BAND: [number, number] = [40, 65];

/**
 * MOTOR ÚNICO — mesma função roda em tempo real (cron) e no backtest.
 * Fluxo (spec §8):
 *  1. candles5m como base; último índice FECHADO
 *  2. IndicatorPack
 *  3. avaliar estratégias
 *  4. filtros na ordem: lateral → estrutura → contraditório → volatilidade
 *  5. se bloqueou → invalid com invalidReasons
 *  6. direção coerente com estratégia + indicadores
 *  7. score + confluences
 *  8. valid apenas se valid=true AND direction!=NEUTRAL AND score>=0
 *
 * Função PURA e síncrona — sem I/O, sem data/hora, determinística.
 */
export function runEngine(input: EngineInput): EngineResult {
  const { candles5m } = input;
  const invalidReasons: string[] = [];

  if (!candles5m || candles5m.length < MIN_CANDLES) {
    invalidReasons.push(`Dados insuficientes (${candles5m?.length ?? 0} candles 5m, mínimo ${MIN_CANDLES})`);
    return { valid: false, direction: "NEUTRAL", score: 0, strategy: "—", confluences: [], reasons: [], entryPrice: 0, invalidReasons };
  }

  const lastIdx = candles5m.length - 1; // último candle FECHADO
  const lastCandle = candles5m[lastIdx];
  const entryPrice = lastCandle.close;

  const ind = buildIndicatorPack(candles5m.slice(-LOOKBACK));
  const minStrategies = input.minStrategies ?? DEFAULT_MIN_STRATEGIES;
  const rsiBand = input.rsiBand ?? DEFAULT_RSI_BAND;

  const { hits, direction: suggestedDirection, winner } = evaluateStrategies(ind, candles5m, lastIdx);

  const filterReasons = applyFilters({ ind, hits, candles5m, news: input.news ?? null });
  if (filterReasons.length > 0) {
    return {
      valid: false,
      direction: "NEUTRAL",
      score: 0,
      strategy: winner,
      confluences: [],
      reasons: [],
      entryPrice,
      invalidReasons: filterReasons,
    };
  }

  // qualidade v2: mínimo de estratégias confirmadas (padrão 2 = Confluência)
  const confluent = hits.find((h) => h.name === "Confluência")?.passed ?? false;
  const anyHit = hits.some((h) => h.passed);
  if (minStrategies > 1 ? !confluent : !anyHit) {
    const passedCount = hits.filter((h) => h.passed && h.name !== "Confluência").length;
    invalidReasons.push(
      minStrategies > 1
        ? `Confluência insuficiente (${passedCount}/3 estratégias confirmadas, mínimo ${minStrategies}) — sem setup coerente`
        : "Nenhuma estratégia confirmada — sem setup coerente"
    );
    return { valid: false, direction: "NEUTRAL", score: 0, strategy: winner, confluences: [], reasons: [], entryPrice, invalidReasons };
  }

  // direção final: coerente com estratégia + indicadores
  let direction: Direction = suggestedDirection;
  if (direction === "NEUTRAL") {
    direction = ind.trend === "baixa" ? "PUT" : ind.trend === "alta" ? "CALL" : "NEUTRAL";
  }
  // sanidade: nunca CALL com tendência baixa consolidada e MACD negativo, e vice-versa
  if (direction === "CALL" && ind.trend === "baixa" && ind.macd.state === "negativo") direction = "NEUTRAL";
  if (direction === "PUT" && ind.trend === "alta" && ind.macd.state === "positivo") direction = "NEUTRAL";

  if (direction === "NEUTRAL") {
    invalidReasons.push("Nenhuma estratégia confirmada — direção neutra");
    return { valid: false, direction: "NEUTRAL", score: 0, strategy: winner, confluences: [], reasons: [], entryPrice, invalidReasons };
  }

  // qualidade v2: banda RSI saudável (bloqueia entrada esticada —
  // CALL com RSI 70+ e PUT com RSI 30- perdem no backtest real)
  if (ind.rsi < rsiBand[0] || ind.rsi > rsiBand[1]) {
    invalidReasons.push(
      `RSI ${ind.rsi.toFixed(1)} fora da faixa saudável ${rsiBand[0]}–${rsiBand[1]} — movimento esticado demais`
    );
    return { valid: false, direction: "NEUTRAL", score: 0, strategy: winner, confluences: [], reasons: [], entryPrice, invalidReasons };
  }

  const { score, confluences } = computeScore(ind, direction, hits, candles5m);

  // stop sugerido (informativo): lado oposto mais próximo
  let stop: number | undefined;
  if (direction === "CALL") {
    const below = ind.support.filter((s) => s < entryPrice);
    stop = below.length ? Math.max(...below) : ind.swingLow ?? undefined;
  } else {
    const above = ind.resistance.filter((r) => r > entryPrice);
    stop = above.length ? Math.min(...above) : ind.swingHigh ?? undefined;
  }

  const reasons: string[] = [
    `Estratégia: ${winner}`,
    `Tendência: ${ind.trend} (EMA9 ${ind.ema9.toFixed(5)} / 21 ${ind.ema21.toFixed(5)} / 50 ${ind.ema50.toFixed(5)})`,
    `RSI: ${ind.rsi.toFixed(1)} | MACD: ${ind.macd.state} (hist ${ind.macd.hist.toFixed(6)})`,
    `ATR%: ${ind.atrPercent.toFixed(3)}%`,
  ];
  for (const h of hits) if (h.passed) reasons.push(`${h.name}: ${h.reason}`);

  // direction é garantidamente CALL|PUT aqui (NEUTRAL retornou antes)
  const valid = score >= 0;

  return { valid, direction, score, strategy: winner, confluences, reasons, entryPrice, stop, invalidReasons };
}