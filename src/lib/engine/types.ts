/**
 * Tipos compartilhados do motor Radar AI.
 * Único source of truth — usado por tempo real (cron) e backtest.
 * NUNCA duplicar lógica entre /lib/engine e outras partes do sistema.
 *
 * Convenções:
 * - `ts` é SEMPRE unix epoch em SEGUNDOS (consistente entre agregação e comparação).
 * - Todos os valores numéricos NUNCA são arredondados no cálculo;
 *   arredondamento acontece apenas na exibição (2–5 casas p/ Forex).
 */

export interface Candle {
  /** unix epoch seconds */
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface OHLCV extends Candle {
  volume?: number;
}

export type Timeframe = "1m" | "5m" | "15m";

export type Trend = "alta" | "baixa" | "lateral" | "indefinida";

export type Direction = "CALL" | "PUT" | "NEUTRAL";

export type SignalResult = "pending" | "win" | "loss" | "void";

export type MacdState = "positivo" | "negativo" | "zero";

export interface IndicatorPack {
  trend: Trend;
  ema9: number;
  ema21: number;
  ema50: number;
  rsi: number;
  macd: {
    line: number;
    signal: number;
    hist: number;
    state: MacdState;
  };
  atr: number;
  atrPercent: number;
  support: number[];
  resistance: number[];
  swingHigh: number | null;
  swingLow: number | null;
  isSideways: boolean;
  volOk: boolean;
  atrOk: boolean;
}

export interface StrategyHit {
  name: string;
  passed: boolean;
  weight: number;
  reason: string;
}

export interface ConfluenceItem {
  label: string;
  passed: boolean;
  points: number;
}

export interface EngineResult {
  valid: boolean;
  direction: Direction;
  score: number;
  strategy: string;
  confluences: ConfluenceItem[];
  reasons: string[];
  entryPrice: number;
  stop?: number;
  invalidReasons: string[];
}

export interface NewsBlockConfig {
  enabled: boolean;
  minutesBefore: number;
  minutesAfter: number;
}

/** Payload determinístico enviado às IAs (Prompt 2) — apenas dados do motor. */
export interface AIAnalysisPayload {
  ativo: string;
  timeframe: Timeframe;
  preco: number;
  tendencia: Trend;
  ema9: number;
  ema21: number;
  ema50: number;
  rsi: number;
  macd: { state: MacdState; hist: number };
  atr: number;
  atr_percent: number;
  suporte: number[];
  resistencia: number[];
  swingLow: number | null;
  swingHigh: number | null;
  score_tecnico: number;
  direcao_sugerida: Direction;
  estrategia: string;
  confluencias: ConfluenceItem[];
  reasons_tecnicos: string[];
  filtros_ok: boolean;
  invalidReasons: string[];
}

/** Resposta esperada das IAs (JSON estrito). */
export interface AIResult {
  direction: Direction;
  coherent: boolean;
  confidence: number;
  reasoning: string;
  warnings: string[];
}

/** Voto de um modelo dentro do consenso. */
export interface ModelVote {
  model: string;
  status: "ok" | "erro" | "pulado";
  direction: Direction;
  coherent: boolean;
  confidence: number;
  reasoning: string;
  warnings: string[];
  latencyMs: number;
  error?: string;
}

/** Resultado agregado do consenso entre IAs. */
export interface ConsensusResult {
  passed: boolean;
  favoravel: string; // ex.: "3/3"
  favoravelCount: number;
  totalModels: number;
  direction: Direction;
  confidenceMedia: number;
  modelos: ModelVote[];
  timestamp: number;
}