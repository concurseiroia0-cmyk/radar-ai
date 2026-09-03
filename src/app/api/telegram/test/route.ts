import { NextResponse } from "next/server";
import { sendTelegramMessage } from "@/lib/services/telegram";

/**
 * POST { botToken?, chatId? } — testa envio "✅ Teste de conexão – Radar AI".
 * Usa env como padrão; aceita override por request (nunca retorna o token).
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { botToken?: string; chatId?: string };
  const botToken = body.botToken || process.env.TELEGRAM_BOT_TOKEN || undefined;
  const chatId = body.chatId || process.env.TELEGRAM_CHAT_ID || undefined;

  if (!botToken || !chatId) {
    return NextResponse.json(
      { ok: false, error: "Telegram não configurado (env TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)" },
      { status: 400 }
    );
  }

  const res = await sendTelegramMessage("✅ Teste de conexão – Radar AI", { botToken, chatId });
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}