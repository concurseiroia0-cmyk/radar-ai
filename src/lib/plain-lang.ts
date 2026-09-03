import type { EngineResult, IndicatorPack } from "@/lib/engine";

/**
 * Linguagem simples (PT-BR) para quem não é técnico.
 * Converte o resultado do motor em uma frase clara e objetiva.
 * Usado no Modo Simples do dashboard e no resumo da página do ativo.
 */

export interface PlainVerdict {
  kind: "call" | "put" | "wait";
  strong: boolean;
  score: number;
  /** Título curto: "CALL", "PUT" ou "ESPERAR" */
  headline: string;
  /** Uma ou duas frases simples explicando o porquê */
  summary: string;
}

export function plainVerdict(engine: EngineResult, pack: IndicatorPack, symbol?: string): PlainVerdict {
  const name = symbol ? `${symbol} ` : "";

  if (!engine.valid || engine.direction === "NEUTRAL" || engine.score < 50) {
    return {
      kind: "wait",
      strong: false,
      score: engine.score,
      headline: "ESPERAR",
      summary:
        `${name}está sem direção clara neste momento. O Radar prefere não arriscar — ` +
        "espere um sinal mais forte (a partir de 75/100) antes de operar.",
    };
  }

  const strong = engine.score >= 75;
  const isCall = engine.direction === "CALL";
  const trendWord = pack.trend === "alta" ? "alta" : pack.trend === "baixa" ? "baixa" : "lateral";
  const rsiWord =
    pack.rsi > 70
      ? "compradores estão no controle (RSI alto)"
      : pack.rsi < 30
        ? "vendedores estão no controle (RSI baixo)"
        : `mercado equilibrado (RSI ${Math.round(pack.rsi)})`;
  const actionWord = isCall ? "subir" : "cair";
  const prefix = strong
    ? `Força ${engine.score}/100 — sinal de ${engine.direction}.`
    : `Sinal de ${engine.direction} ainda fraco (${engine.score}/100).`;

  const summary =
    `${prefix} ${name}mostra tendência de ${trendWord} e ${rsiWord}. ` +
    `O Radar aponta chance maior de o preço ${actionWord} nos próximos minutos — ` +
    "confirme no gráfico antes de operar.";

  return { kind: isCall ? "call" : "put", strong, score: engine.score, headline: engine.direction, summary };
}

/** Frase curta (1 linha) — usada no cartão da página do ativo. */
export function plainOneLiner(engine: EngineResult, pack: IndicatorPack): string {
  const v = plainVerdict(engine, pack);
  if (v.kind === "wait") {
    return "Mercado sem direção clara agora — melhor esperar um sinal mais forte.";
  }
  const op = v.kind === "call" ? "CALL" : "PUT";
  const tend = pack.trend === "alta" ? "de alta" : pack.trend === "baixa" ? "de baixa" : "lateral";
  return `Sinal de ${op} com força ${v.score}/100 — tendência ${tend}. Confirme no gráfico antes de operar.`;
}

/* ------------------------------------------------------------------ */
/* Janela de sessão (horários dos sinais)                              */
/* ------------------------------------------------------------------ */

const HH = (h: number) => String(h).padStart(2, "0");

/** Converte hora UTC para hora de Brasília (UTC−3, sem horário de verão). */
const utcToBrt = (h: number) => (h + 21) % 24; // UTC−3 = +21h módulo 24

export interface SessionInfo {
  active: boolean;
  inicio: number;
  fim: number;
  /** ex.: "07h–12h UTC" */
  windowUtc: string;
  /** ex.: "04h–09h Brasília" */
  windowBrt: string;
  /** ex.: "05h00" — próximo início no horário de Brasília (quando inativo) */
  nextStartBrt: string | null;
}

/**
 * Status da janela de sinais (mesma regra do cron).
 * `now` é opcional (facilita teste); padrão: momento atual.
 */
export function sessionInfo(inicio: number, fim: number, now: Date = new Date()): SessionInfo {
  const hour = now.getUTCHours();
  const active = inicio <= fim ? hour >= inicio && hour < fim : hour >= inicio || hour < fim;

  let nextStartBrt: string | null = null;
  if (!active) {
    const next = new Date(now);
    next.setUTCHours(inicio, 0, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    nextStartBrt = `${HH(utcToBrt(next.getUTCHours()))}h${HH(next.getUTCMinutes())}`;
  }

  return {
    active,
    inicio,
    fim,
    windowUtc: `${HH(inicio)}h–${HH(fim)}h UTC`,
    windowBrt: `${HH(utcToBrt(inicio))}h–${HH(utcToBrt(fim))}h Brasília`,
    nextStartBrt,
  };
}