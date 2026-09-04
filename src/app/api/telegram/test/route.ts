import { NextResponse } from "next/server";
import { sendTelegramMessage, formatAlert } from "@/lib/services/telegram";
import type { ConsensusResult, IndicatorPack } from "@/lib/engine";

/**
 * POST { botToken?, chatId?, full? } — teste de conexão.
 * Padrão: "✅ Teste de conexão – Radar AI".
 * Com { full: true }: envia um ALERTA DE EXEMPLO formatado igual ao real
 * (CALL/EUR-USD com score, estratégia, consenso e prazo em Brasília) —
 * ideal para validar o visual/entrega de ponta a ponta.
 * Usa env como padrão; aceita override por request (nunca retorna o token).
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    botToken?: string;
    chatId?: string;
    full?: boolean;
  };
  const botToken = body.botToken || process.env.TELEGRAM_BOT_TOKEN || undefined;
  const chatId = body.chatId || process.env.TELEGRAM_CHAT_ID || undefined;

  if (!botToken || !chatId) {
    return NextResponse.json(
      { ok: false, error: "Telegram não configurado (env TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)" },
      { status: 400 }
    );
  }

  const text = body.full
    ? [
        "🧪 *TESTE DO RADAR — alerta de exemplo*",
        "_Não é um sinal real — serve para você conferir o formato._",
        "",
        formatAlert({
          symbol: "EUR/USD",
          timeframe: "5m",
          direction: "CALL",
          score: 86,
          strategy: "Confluência",
          ind: {
            trend: "alta",
            rsi: 72,
            macd: { state: "positivo" },
            support: [1.0839],
            resistance: [1.0851],
            // campos exibidos no alerta — o restante não entra na mensagem
          } as unknown as IndicatorPack,
          confluencesTotal: 4,
          confluencesPassed: 4,
          consensus: {
            passed: true,
            favoravel: "3/3",
            totalModels: 3,
            modelos: [
              { status: "ok", model: "gpt-4o-mini" },
              { status: "ok", model: "claude-haiku" },
              { status: "ok", model: "gemini-flash" },
            ],
          } as unknown as ConsensusResult,
          entryPrice: 1.0842,
          createdAt: new Date(),
        }),
      ].join("\n")
    : "✅ Teste de conexão – Radar AI";

  const res = await sendTelegramMessage(text, { botToken, chatId });
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
