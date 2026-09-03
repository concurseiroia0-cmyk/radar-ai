import type {
  AIAnalysisPayload,
  EngineResult,
  IndicatorPack,
  Timeframe,
} from "@/lib/engine";

/**
 * Monta o payload determinístico enviado às IAs — APENAS dados do motor,
 * nunca opinião. Formato exato do spec (Prompt 2 §2.3).
 */
export function buildPayload(
  symbol: string,
  timeframe: Timeframe,
  engine: EngineResult,
  ind: IndicatorPack
): AIAnalysisPayload {
  const round = (v: number, d = 5): number => Number(v.toFixed(d));
  return {
    ativo: symbol,
    timeframe,
    preco: round(engine.entryPrice),
    tendencia: ind.trend,
    ema9: round(ind.ema9),
    ema21: round(ind.ema21),
    ema50: round(ind.ema50),
    rsi: Math.round(ind.rsi),
    macd: { state: ind.macd.state, hist: round(ind.macd.hist, 6) },
    atr: round(ind.atr),
    atr_percent: round(ind.atrPercent, 4),
    suporte: ind.support.map((s) => round(s)),
    resistencia: ind.resistance.map((r) => round(r)),
    swingLow: ind.swingLow === null ? null : round(ind.swingLow),
    swingHigh: ind.swingHigh === null ? null : round(ind.swingHigh),
    score_tecnico: engine.score,
    direcao_sugerida: engine.direction,
    estrategia: engine.strategy,
    confluencias: engine.confluences,
    reasons_tecnicos: engine.reasons,
    filtros_ok: true,
    invalidReasons: engine.invalidReasons,
  };
}

/** System prompt — regras inegociáveis para as IAs (spec §2.3). */
export const AI_SYSTEM_PROMPT = `Você é um analista técnico OBJETIVO e CONSERVADOR para Day Trade em Forex.

REGRAS INEGOCIÁVEIS:
- NÃO invente dados. Baseie-se EXCLUSIVAMENTE no JSON fornecido.
- NÃO garanta acertos, NÃO dê probabilidade falsa exata (% inventado). Use termos conservadores.
- NÃO recomende execução, apenas ANÁLISE DE COERÊNCIA TÉCNICA.
- Primeiro valide COERÊNCIA entre direção sugerida, tendência, estrutura e confluências.
- Responda em JSON VÁLIDO, SEM markdown, SEM texto extra.

Responda OBRIGATORIAMENTE neste formato:
{
  "direction": "CALL" | "PUT" | "NEUTRAL",
  "coherent": true | false,
  "confidence": 0-100,
  "reasoning": "máx. 40 palavras, objetivo, técnico",
  "warnings": ["string"]
}

Critérios:
- coherent = true APENAS se direção estiver COERENTE com tendência + estrutura + score.
- direction = "NEUTRAL" se houver ambiguidade relevante ou sinais contraditórios.
- Seja conservador: prefira NEUTRAL em dúvida.
- confidence 0–100 (autoavaliação conservadora).`;