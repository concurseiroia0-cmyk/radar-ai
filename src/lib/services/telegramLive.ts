/**
 * Countdown ao vivo no Telegram.
 *
 * Quando um alerta com consenso é enviado, o cron guarda (dentro do jsonb
 * ai_consensus → tg) o message_id e o texto enviado. A cada tick seguinte do
 * cron, enquanto o sinal ainda está pendente, editamos a própria mensagem
 * (editMessageText) trocando a linha "⏳ Entre até…" pelo tempo que falta —
 * e, ao zerar, pela versão final "⏰ SINAL EXPIRADO — NÃO opere mais nele.".
 *
 * Não cria tabela nova: os metadados vivem no ai_consensus do sinal.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTelegramConfig, editTelegramMessage } from "./telegram";
import { TF_DURATION_SECONDS } from "@/lib/paper";

interface TgMeta {
  messageId: number;
  text: string;
  lastLeft?: number;
  final?: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");

function fmtClock(sec: number): string {
  const d = new Date(sec * 1000);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function fmtLeft(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}m ${pad(s)}s`;
}

/** Linha de status com o countdown (substitui a linha "⏳ Entre até…"). */
export function liveCountdownLine(remaining: number, deadlineSec: number): string {
  if (remaining <= 0) {
    return `⏰ *SINAL EXPIRADO* (era até ${fmtClock(deadlineSec)} UTC) — *NÃO opere mais nele*. Espere o próximo.`;
  }
  return (
    `⏳ *Faltam ${fmtLeft(remaining)}* p/ o sinal expirar (até ${fmtClock(deadlineSec)} UTC) — ` +
    `depois disso *NÃO é recomendado operar*.`
  );
}

/** Troca a linha de status do alerta pelo countdown atualizado. */
export function patchAlertStatus(text: string, remaining: number, deadlineSec: number): string {
  const line = liveCountdownLine(remaining, deadlineSec);
  const lines = text.split("\n");
  const idx = lines.findIndex((l) => l.trim().startsWith("⏳") || l.trim().startsWith("⏰"));
  if (idx >= 0) {
    lines[idx] = line;
    return lines.join("\n");
  }
  // fallback: anexa antes da linha "Validado"
  const vIdx = lines.findIndex((l) => l.includes("Validado:"));
  if (vIdx >= 0) {
    lines.splice(vIdx - 1, 0, line);
    return lines.join("\n");
  }
  return `${text}\n\n${line}`;
}

export interface LiveRefreshResult {
  edited: number;
  expired: number;
  failed: number;
}

/**
 * Varre os sinais pendentes recentes que já têm alerta enviado e atualiza o
 * countdown na mensagem. Chamado pelo cron em cada tick (a cada ~2 min) —
 * edita apenas quando o tempo restante caiu o suficiente (ou zerou).
 */
export async function refreshTelegramCountdowns(
  supabase: SupabaseClient,
  now: number = Date.now()
): Promise<LiveRefreshResult> {
  const res: LiveRefreshResult = { edited: 0, expired: 0, failed: 0 };
  const cfg = getTelegramConfig();
  if (!cfg.botToken || !cfg.chatId || !cfg.chatId) return res;

  const { data: rows } = await supabase
    .from("signals")
    .select("id, timeframe, created_at, ai_consensus")
    .eq("result", "pending")
    .order("created_at", { ascending: false })
    .limit(25);

  for (const row of rows ?? []) {
    try {
      const consensus = (row.ai_consensus ?? {}) as Record<string, unknown> & { tg?: TgMeta };
      const tg = consensus.tg;
      if (!tg || !tg.messageId || tg.final) continue;
      const createdSec = new Date(row.created_at as string).getTime() / 1000;
      const windowSec = TF_DURATION_SECONDS[row.timeframe as keyof typeof TF_DURATION_SECONDS] ?? 300;
      const deadlineSec = createdSec + windowSec;
      const remaining = Math.max(0, deadlineSec - now / 1000);

      // só edita quando mudou de forma relevante (evita spam de edição)
      if (remaining > 0 && tg.lastLeft !== undefined && tg.lastLeft - remaining < 30) continue;

      const final = remaining <= 0;
      const newText = patchAlertStatus(tg.text, remaining, deadlineSec);
      const sent = await editTelegramMessage(cfg.chatId, tg.messageId, newText);
      if (!sent.ok) {
        res.failed++;
        continue;
      }
      if (final) res.expired++;
      else res.edited++;

      const nextTg: TgMeta = {
        messageId: tg.messageId,
        text: newText,
        lastLeft: Math.floor(remaining),
        ...(final ? { final: true } : {}),
      };
      await supabase
        .from("signals")
        .update({ ai_consensus: { ...consensus, tg: nextTg } })
        .eq("id", row.id);
    } catch {
      res.failed++;
    }
  }
  return res;
}
