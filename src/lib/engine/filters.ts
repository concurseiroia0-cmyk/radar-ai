import type { Candle, IndicatorPack, NewsBlockConfig, StrategyHit } from "./types";
import { fmt } from "./utils";

export interface FiltersInput {
  ind: IndicatorPack;
  hits: StrategyHit[];
  candles5m: Candle[];
  news?: NewsBlockConfig | null;
}

/**
 * Cadeia de filtros críticos — ORDEM (spec §8):
 * lateral → estrutura → contraditório → volatilidade → notícias (stub).
 * Se QUALQUER filtro bloquear, retorna o motivo claro em invalidReasons.
 */
export function applyFilters({ ind, hits, candles5m, news }: FiltersInput): string[] {
  const reasons: string[] = [];

  /* 1) Lateralidade */
  if (ind.trend === "lateral" || ind.trend === "indefinida" || ind.isSideways) {
    reasons.push(
      `Mercado lateral/indefinido (trend '${ind.trend}', isSideways=${ind.isSideways}) — sem trade`
    );
    return reasons; // bloqueio definitivo
  }

  /* 2) Estrutura confusa (S/R sobrepostos) */
  if (structureConfused(ind)) {
    reasons.push("Estrutura confusa — zonas de suporte e resistência sobrepostas");
    return reasons;
  }

  /* 3) Sinais contraditórios */
  const contra = contradictorySignals(ind, hits);
  if (contra) {
    reasons.push(contra);
    return reasons;
  }

  /* 4) Volatilidade */
  if (!ind.volOk || !ind.atrOk) {
    reasons.push(
      ind.atrOk
        ? `Volatilidade fora da faixa conservadora (ATR% ${fmt(ind.atrPercent, 3)}%, esperado 0.03–0.25%)`
        : "ATR plano — mercado sem movimento suficiente"
    );
    return reasons;
  }

  /* 5) Notícias (stub seguro — estrutura pronta para pausa futura) */
  const newsBlock = checkNewsBlock(news);
  if (newsBlock.blocked) {
    reasons.push(newsBlock.reason);
  }

  return reasons;
}

/** S/R muito próximos/sobrepostos → estrutura confusa → NO TRADE. */
export function structureConfused(ind: IndicatorPack): boolean {
  if (!ind.support.length || !ind.resistance.length) return false;
  let minGap = Infinity;
  for (const s of ind.support) {
    for (const r of ind.resistance) {
      const gap = Math.abs(s - r);
      if (gap < minGap) minGap = gap;
    }
  }
  return minGap < ind.atr * 1.5;
}

/** Conflito direto: EMA aponta um lado + MACD fortemente contra + RSI extremo. */
export function contradictorySignals(ind: IndicatorPack, _hits: StrategyHit[]): string | null {
  if (ind.trend === "alta" && ind.macd.state === "negativo" && ind.rsi < 40) {
    return "Sinais contraditórios — tendência alta vs MACD negativo e RSI < 40";
  }
  if (ind.trend === "baixa" && ind.macd.state === "positivo" && ind.rsi > 60) {
    return "Sinais contraditórios — tendência baixa vs MACD positivo e RSI > 60";
  }
  void _hits;
  return null;
}

interface NewsCheck {
  blocked: boolean;
  reason: string;
}

/**
 * Stub seguro de bloqueio por notícias.
 * Estrutura pronta: pausa X minutos antes/depois de eventos de alto impacto.
 * NÃO trava o sistema se vazio (enabled=false → nunca bloqueia).
 */
export function checkNewsBlock(news?: NewsBlockConfig | null): NewsCheck {
  if (!news || !news.enabled) return { blocked: false, reason: "" };
  // TODO(Prompt 3): consultar news_events e bloquear dentro da janela
  // news.minutesBefore/minutesAfter em torno de eventos 'high' da moeda do ativo.
  return { blocked: false, reason: "" };
}