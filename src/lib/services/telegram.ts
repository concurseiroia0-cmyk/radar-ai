import type { ConsensusResult, Direction, IndicatorPack } from "@/lib/engine";

/**
 * Telegram — stub SEGURO: sem token/chatId configurados NUNCA quebra,
 * retorna { ok:false, error }.
 */

export interface TelegramConfig {
  botToken?: string;
  chatId?: string;
}

export function getTelegramConfig(): TelegramConfig {
  return {
    botToken: process.env.TELEGRAM_BOT_TOKEN || undefined,
    chatId: process.env.TELEGRAM_CHAT_ID || undefined,
  };
}

export async function sendTelegramMessage(
  text: string,
  cfg: TelegramConfig = getTelegramConfig()
): Promise<{ ok: boolean; error?: string }> {
  if (!cfg.botToken || !cfg.chatId) {
    return { ok: false, error: "Telegram não configurado (TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID)" };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: cfg.chatId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json()) as { ok?: boolean; description?: string };
    return json.ok ? { ok: true } : { ok: false, error: json.description ?? "Erro desconhecido do Telegram" };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export interface AlertOptions {
  symbol: string;
  timeframe: string;
  direction: Direction;
  score: number;
  strategy: string;
  ind: IndicatorPack;
  confluencesTotal: number;
  confluencesPassed: number;
  consensus: ConsensusResult | null;
  entryPrice: number;
  /** Momento em que o sinal foi criado (fechamento da vela) — usado p/ o prazo de validade. */
  createdAt?: Date;
}

function fmtUtcClock(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

const DIR_EMOJI: Record<Direction, string> = { CALL: "🟢", PUT: "🔴", NEUTRAL: "⚪" };

/**
 * Mensagem de alerta — formato EXATO do spec (Prompt 2 §3).
 * Enviada APENAS após consenso válido.
 */
export function formatAlert(o: AlertOptions): string {
  const srLine =
    o.direction === "CALL"
      ? `Suporte: ${o.ind.support.length ? "Confirmado" : "—"}`
      : `Resistência: ${o.ind.resistance.length ? "Confirmado" : "—"}`;
  const pullbackLine = `Pullback: ${o.strategy.includes("Pullback") || o.strategy === "Confluência" ? "Confirmado" : "—"}`;
  const consenso = o.consensus
    ? `Consenso IA: *${o.consensus.favoravel} favorável* ✅`
    : "Consenso IA: —";
  const modelos = o.consensus
    ? `Modelos OK: *${o.consensus.modelos.filter((m) => m.status === "ok").length}/${o.consensus.totalModels}*`
    : "";

  return [
    "🚨 *SETUP ENCONTRADO*",
    "",
    `*${o.symbol}* • *${o.timeframe}*`,
    "",
    `Direção: *${o.direction}* ${DIR_EMOJI[o.direction]}`,
    `Score: *${o.score}/100* • Estratégia: *${o.strategy}*`,
    `Tendência: *${capitalize(o.ind.trend)}* | RSI: *${Math.round(o.ind.rsi)}* | MACD: *${capitalize(o.ind.macd.state)}*`,
    `${srLine} | ${pullbackLine}`,
    "",
    consenso,
    modelos,
    "",
    `Confluências: ${o.confluencesPassed}/${o.confluencesTotal}`,
    "",
    "⚠️ Entrada somente se o preço permanecer na região",
    `⏱️ Expiração sugerida: *${o.timeframe === "15m" ? "15" : o.timeframe === "1m" ? "1" : "5"} minutos*`,
    ...(o.createdAt
      ? [
          `⏳ *Entre até* ${fmtUtcClock(new Date(o.createdAt.getTime() + 5 * 60_000))} UTC — depois desse horário o sinal expira e *NÃO é recomendado operar* nele.`,
        ]
      : []),
    "",
    `*Validado: Técnico + Consenso IA*`,
    "",
    `Preço de entrada: ${o.entryPrice.toFixed(5)}`,
  ].join("\n");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}