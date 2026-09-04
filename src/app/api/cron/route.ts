import { NextResponse } from "next/server";
import { aggregateTo5m, aggregateTo15m, runEngine, buildIndicatorPack, type Candle } from "@/lib/engine";
import { fetchCandlesFinnhub, fetchTwelveDataRotated, tdPlan, tdSlotMatches } from "@/lib/services/marketData";
import { createServiceSupabaseClient, isSupabaseConfigured } from "@/lib/services/supabase-server";
import { buildPayload } from "@/lib/ai/payload";
import { runConsensus, aiAvailable } from "@/lib/ai/consensus";
import { formatAlert, sendTelegramMessage } from "@/lib/services/telegram";
import { resolveExpired } from "@/lib/services/paperResolution";
import { marketOpen } from "@/lib/schedule";
import { ACTIVE_SYMBOLS } from "@/lib/assets";
import { fetchColdCheck } from "@/lib/signalMemory";
import { refreshTelegramCountdowns } from "@/lib/services/telegramLive";

/**
 * CRON — heartbeat do sistema (chamar via cron-job.org a cada 2 min).
 * Protegido por CRON_SECRET (header x-cron-secret ou ?secret=).
 *
 * Fluxo:
 *  1. ler configurações (score_minimo, ativos)
 *  2. janela de mercado por tipo (src/lib/schedule.ts): forex segue os
 *     horários da IQ Option EM HORÁRIO DE BRASÍLIA (UTC−3); ações dos EUA seguem o pregão da NYSE.
 *     Fora da janela NÃO busca candles (economiza cota da API).
 *  3. buscar candles 1m por ativo ATIVO e aberto — Twelve Data multi-chave
 *     (1 → 2 → 3, cadência por ativo que caiba no dia) ou Finnhub se esgotar
 *  4. upsert candles (asset_id, timeframe, ts) 1m/5m/15m — sem duplicados
 *  5. gatilho: SÓ processa quando um candle 5m FOI FECHADO (cron_state)
 *  6. runEngine por ativo com 5m recém-fechado
 *  7. se valid AND score >= score_minimo → grava signals (pending)
 *  8. IA + consenso (se chave configurada) → ai_consensus/ai_pass + ai_analyses
 *  9. alerta Telegram para TODO sinal técnico (consenso enriquece a msg;
 *     TG_REQUIRE_CONSENSUS=1 restaura o modo estrito) + countdown ao vivo
 * 10. resolver sinais/paper_trades expirados (roda SEMPRE — não usa cota)
 * 11. try/catch por ativo (um falha não quebra os outros)
 */

/** Lista padrão quando o perfil ainda não tem ativos (mesma da Config/seed). */
const DEFAULT_ATIVOS = ACTIVE_SYMBOLS;

export async function POST(req: Request) {
  // ---- segurança ----
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided =
      req.headers.get("x-cron-secret") ?? new URL(req.url).searchParams.get("secret");
    if (provided !== secret) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET não configurado" },
      { status: 401 }
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true, skipped: "no_supabase", processed: 0, signalsCreated: 0 });
  }

  const supabase = await createServiceSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ ok: true, skipped: "no_supabase", processed: 0, signalsCreated: 0 });
  }

  // ---- 1) configurações ----
  const { data: profRows } = await supabase
    .from("profiles")
    .select("score_minimo, ativos_ativos, telegram_chat_id")
    .limit(1);
  const prof = (profRows ?? [])[0] as
    | { score_minimo?: number; ativos_ativos?: string[]; telegram_chat_id?: string | null }
    | undefined;
  const scoreMin = Number(prof?.score_minimo ?? process.env.DEFAULT_SCORE_MIN ?? 75);
  const ativos = prof?.ativos_ativos?.length ? prof.ativos_ativos : DEFAULT_ATIVOS;
  // destino do alerta: Chat ID salvo na Config (perfil) tem prioridade; senão o env.
  const tgChatId = prof?.telegram_chat_id?.trim() || process.env.TELEGRAM_CHAT_ID || undefined;
  const tgCfg = { botToken: process.env.TELEGRAM_BOT_TOKEN || undefined, chatId: tgChatId };
  // atenção à cota do provedor: N ativos × chamadas por dia ≤ cota gratuita —
  // as janelas abaixo já eliminam as chamadas fora do horário de mercado.

  // ---- 2) janela de mercado (horários IQ Option em Brasília/UTC−3 — src/lib/schedule.ts) ----
  const now = new Date();
  const forexOpen = marketOpen("forex", now, 150);
  const stockOpen = marketOpen("stock", now, 150);

  // ---- assets ativos no banco ----
  const { data: assetRows } = await supabase.from("assets").select("id, symbol, type").eq("active", true);
  const assets = (assetRows ?? []).filter((a) => ativos.includes(a.symbol));

  // ---- plano Twelve Data do dia: cadência sustentável (intervalo por ativo
  // que caiba na soma das 3 chaves × 800) + rotação de chaves (1 → 2 → 3).
  const counts = {
    forex: assets.filter((a) => a.type !== "stock").length,
    stock: assets.filter((a) => a.type === "stock").length,
  };
  const td = tdPlan(now, counts);

  // Resolução de sinais/paper expirados roda SEMPRE (não consome cota de dados):
  // um trade que venceu fora da janela resolve no próximo tick, mesmo sábado.
  let paperResolvedGlobal = 0;
  try {
    const resolved = await resolveExpired(supabase);
    paperResolvedGlobal = resolved.signalsResolved + resolved.paperResolved;
  } catch {
    // erro de resolução não derruba o resto do cron
  }

  if (!forexOpen && !stockOpen) {
    return NextResponse.json({
      ok: true,
      skipped: "outside_session",
      processed: 0,
      signalsCreated: 0,
      paperResolved: paperResolvedGlobal,
      windows: { forex: forexOpen, stock: stockOpen },
    });
  }

  const summary = {
    ok: true as boolean,
    processed: 0,
    signalsCreated: 0,
    alertsSent: 0,
    paperResolved: paperResolvedGlobal,
    memorySuppressed: [] as string[],
    telegramLive: { edited: 0, expired: 0, failed: 0 },
    errors: [] as string[],
    windows: { forex: forexOpen, stock: stockOpen },
    quota: {
      provider: td.exhausted ? "finnhub-only" : "twelvedata",
      tdBudget: td.totalBudget,
      tdUsed: td.usedToday,
      tdKeys: td.keyCount,
      tdActiveKey: td.activeKey, // 0-based — null quando todas esgotadas
      tdIntervalMin: td.intervalMin,
      fallbackFinnhub: td.exhausted,
    },
  };

  for (const asset of assets) {
    try {
      // ---- 2b) ativo fora da janela do próprio tipo? pula (economiza cota) ----
      const isStock = asset.type === "stock";
      if (isStock ? !stockOpen : !forexOpen) continue;

      // ---- 3) cadência sustentável: em modo Twelve Data cada ativo é buscado
      // a cada td.intervalMin (grupos sobre ticks de 2 min). Fora da vez, pula
      // este tick — o cron_state evita reprocessar quando voltar.
      const canonicalIdx = Math.max(0, ACTIVE_SYMBOLS.indexOf(asset.symbol as string));
      if (!td.exhausted && !tdSlotMatches(now, canonicalIdx, td.intervalMin)) continue;

      // ---- 4) fetch + upsert 1m/5m/15m ----
      // Histórico profundo: o motor exige >= 60 candles 5m (300 de 1m).
      // Com ~2000 de 1m temos ~400 de 5m e ~133 de 15m (lookback real).
      // Provedor: Twelve Data (chave ativa → rotaciona 1→2→3 ao esgotar) e,
      // esgotadas todas (ou erro), cai no Finnhub no mesmo tick.
      let candles1m: Candle[] | null = null;
      if (td.exhausted) {
        candles1m = await fetchCandlesFinnhub(asset.symbol as string, "1", 2000);
      } else {
        const r = await fetchTwelveDataRotated(asset.symbol as string, "1min", 2000, td.activeKey ?? 0);
        candles1m = r.candles;
        if (!candles1m) candles1m = await fetchCandlesFinnhub(asset.symbol as string, "1", 2000);
      }
      if (!candles1m || candles1m.length < 10) {
        summary.errors.push(`${asset.symbol}: sem dados (provedor sem chave ou offline)`);
        continue;
      }
      // ---- 5) agregação (antes do upsert — gravamos os 3 timeframes) ----
      const candles5m = aggregateTo5m(candles1m);
      const candles15m = aggregateTo15m(candles1m);

      const rows1m = candles1m.map((c) => ({
        asset_id: asset.id,
        timeframe: "1m",
        ts: c.ts,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
      const toRows = (tf: "5m" | "15m", cs: typeof candles1m) =>
        cs.map((c) => ({
          asset_id: asset.id,
          timeframe: tf,
          ts: c.ts,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }));
      // ---- 4) upsert 1m + 5m + 15m (sem duplicados) ----
      const { error: upsertErr } = await supabase
        .from("candles")
        .upsert([...rows1m, ...toRows("5m", candles5m), ...toRows("15m", candles15m)], {
          onConflict: "asset_id,timeframe,ts",
        });
      if (upsertErr) throw upsertErr;
      summary.processed += rows1m.length;

      if (candles5m.length < 60) continue;

      // ---- 6) gatilho 5m fechado ----
      const last5mTs = candles5m[candles5m.length - 1].ts;
      const { data: state } = await supabase
        .from("cron_state")
        .select("last_5m_ts")
        .eq("asset_id", asset.id)
        .maybeSingle();
      const lastProcessed = Number(state?.last_5m_ts ?? 0);
      if (last5mTs <= lastProcessed) continue; // nenhum 5m novo fechado
      await supabase
        .from("cron_state")
        .upsert({ asset_id: asset.id, last_5m_ts: last5mTs, updated_at: new Date().toISOString() }, { onConflict: "asset_id" });

      // ---- 7) engine ----
      const engine = runEngine({ candles5m: candles5m.slice(-400), candles1m, candles15m });
      if (!engine.valid || engine.direction === "NEUTRAL" || engine.score < scoreMin) continue;

      // ---- 7b) memória de estratégias (reuso conservador do histórico): um
      // combo ativo+direção+estratégia com amostra suficiente e acerto baixo
      // deixa de gerar sinal/alerta — o resto segue EXATAMENTE como hoje. ----
      const cold = await fetchColdCheck(supabase, {
        assetId: asset.id,
        direction: engine.direction,
        strategy: engine.strategy,
      });
      if (cold.cold) {
        summary.memorySuppressed.push(
          `${asset.symbol} ${engine.direction} (${engine.strategy}) — histórico ${cold.stat.wins}W/${cold.stat.losses}L (${Math.round(cold.stat.winRate * 100)}%)`
        );
        continue;
      }

      // ---- 8) grava signal ----
      const { data: sig, error: sigErr } = await supabase
        .from("signals")
        .insert({
          asset_id: asset.id,
          timeframe: "5m",
          direction: engine.direction,
          score: engine.score,
          strategy: engine.strategy,
          confluences: engine.confluences,
          entry_price: engine.entryPrice,
          result: "pending",
          ai_pass: false,
          ai_consensus: {},
        })
        .select("id")
        .single();
      if (sigErr) throw sigErr;
      summary.signalsCreated++;

      // ---- 9) IA + consenso (Prompt 2) ----
      const ind = buildIndicatorPack(candles5m.slice(-400));
      const payload = buildPayload(asset.symbol as string, "5m", engine, ind);
      let consensus = null;
      if (aiAvailable()) {
        try {
          consensus = await runConsensus(payload);
          const analyses = consensus.modelos
            .filter((m) => m.status === "ok")
            .map((m) => ({
              signal_id: sig.id,
              model: m.model,
              direction: m.direction,
              reasoning: m.reasoning,
              confidence: m.confidence,
              latency_ms: m.latencyMs,
            }));
          if (analyses.length) {
            await supabase.from("ai_analyses").insert(analyses);
          }
          await supabase
            .from("signals")
            .update({ ai_pass: consensus.passed, ai_consensus: consensus as unknown as Record<string, unknown> })
            .eq("id", sig.id);
        } catch (e) {
          summary.errors.push(`${asset.symbol}: consenso IA falhou (${String(e).slice(0, 80)})`);
        }
      }

      // ---- 10) alerta Telegram — TODO sinal técnico válido vira alerta.
      // (Antes só enviava com consenso IA aprovado; o consenso agora apenas
      // enriquece a mensagem. TG_REQUIRE_CONSENSUS=1 restaura o modo estrito.)
      const consensusRequired = (process.env.TG_REQUIRE_CONSENSUS ?? "0") === "1";
      if (!consensusRequired || consensus?.passed) {
        const passedConfluences = engine.confluences.filter((c) => c.passed).length;
        const text = formatAlert({
          symbol: asset.symbol as string,
          timeframe: "5m",
          direction: engine.direction,
          score: engine.score,
          strategy: engine.strategy,
          ind,
          confluencesTotal: engine.confluences.length,
          confluencesPassed: passedConfluences,
          consensus,
          entryPrice: engine.entryPrice,
          createdAt: new Date(),
        });
        const sent = await sendTelegramMessage(text, tgCfg);
        // guarda o resultado do envio no próprio sinal (message_id p/ o
        // countdown ao vivo; error p/ diagnóstico na página Sinais)
        const tgMeta =
          sent.ok && sent.messageId
            ? { messageId: sent.messageId, text, lastLeft: 300 }
            : { error: sent.error ?? "falha ao enviar mensagem" };
        await supabase
          .from("signals")
          .update({ ai_consensus: { ...(consensus ?? ({} as object)), tg: tgMeta } })
          .eq("id", sig.id);
        if (sent.ok && sent.messageId) summary.alertsSent++;
        else summary.errors.push(`${asset.symbol}: alerta Telegram falhou — ${tgMeta.error}`);
      }
    } catch (e) {
      summary.errors.push(`${asset.symbol}: ${String(e).slice(0, 120)}`);
    }
  }

  // ---- 11) countdown ao vivo: edita as mensagens de alerta pendentes a cada
  // tick, mostrando o tempo que falta p/ o sinal expirar (e o aviso final). ----
  try {
    summary.telegramLive = await refreshTelegramCountdowns(supabase, Date.now(), tgCfg);
  } catch {
    summary.telegramLive = { edited: 0, expired: 0, failed: 0 };
  }

  return NextResponse.json(summary);
}
