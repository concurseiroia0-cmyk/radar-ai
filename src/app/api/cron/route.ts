import { NextResponse } from "next/server";
import { aggregateTo5m, aggregateTo15m, runEngine, buildIndicatorPack } from "@/lib/engine";
import { fetchCandles } from "@/lib/services/marketData";
import { createServiceSupabaseClient, isSupabaseConfigured } from "@/lib/services/supabase-server";
import { buildPayload } from "@/lib/ai/payload";
import { runConsensus, aiAvailable } from "@/lib/ai/consensus";
import { formatAlert, sendTelegramMessage } from "@/lib/services/telegram";
import { resolveExpired } from "@/lib/services/paperResolution";

/**
 * CRON — heartbeat do sistema (chamar via cron-job.org a cada 2 min).
 * Protegido por CRON_SECRET (header x-cron-secret ou ?secret=).
 *
 * Fluxo:
 *  1. ler configurações (sessao_inicio/fim, score_minimo, ativos)
 *  2. fora da janela de sessão → { skipped: 'outside_session' } (economiza quota)
 *  3. buscar últimos ~200 candles 1m por ativo ATIVO (Twelve Data → Finnhub)
 *  4. upsert candles (asset_id, '1m', ts) — sem duplicados
 *  5. agregar 1m -> 5m e 1m -> 15m (só blocos completos)
 *  6. gatilho: SÓ processa quando um candle 5m FOI FECHADO (cron_state)
 *  7. runEngine por ativo com 5m recém-fechado
 *  8. se valid AND score >= score_minimo → grava signals (pending)
 *  9. IA + consenso (se chave configurada) → ai_consensus/ai_pass + ai_analyses
 * 10. consenso válido → alerta Telegram
 * 11. resolver sinais/paper_trades expirados
 * 12. try/catch por ativo (um falha não quebra os outros)
 */
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
  const { data: profRows } = await supabase.from("profiles").select("*").limit(1);
  const prof = (profRows ?? [])[0] as
    | { sessao_inicio?: number; sessao_fim?: number; score_minimo?: number; ativos_ativos?: string[] }
    | undefined;
  const sessaoInicio = Number(prof?.sessao_inicio ?? process.env.SESSION_START ?? 7);
  const sessaoFim = Number(prof?.sessao_fim ?? process.env.SESSION_END ?? 12);
  const scoreMin = Number(prof?.score_minimo ?? process.env.DEFAULT_SCORE_MIN ?? 75);
  const ativos = (prof?.ativos_ativos?.length ? prof.ativos_ativos : [
    "EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "EUR/JPY", "GBP/JPY",
  ]).slice(0, 6);

  // ---- 2) janela de sessão (UTC) ----
  const now = new Date();
  const hour = now.getUTCHours();
  const outsideSession =
    sessaoFim > sessaoInicio ? hour < sessaoInicio || hour >= sessaoFim : hour < sessaoInicio && hour >= sessaoFim;
  if (outsideSession) {
    return NextResponse.json({
      ok: true,
      skipped: "outside_session",
      processed: 0,
      signalsCreated: 0,
      session: { inicio: sessaoInicio, fim: sessaoFim, hora: hour },
    });
  }

  // ---- assets ativos no banco ----
  const { data: assetRows } = await supabase.from("assets").select("id, symbol").eq("active", true);
  const assets = (assetRows ?? []).filter((a) => ativos.includes(a.symbol));

  const summary = {
    ok: true as boolean,
    processed: 0,
    signalsCreated: 0,
    alertsSent: 0,
    paperResolved: 0,
    errors: [] as string[],
    quota: { source: "twelvedata", used: assets.length, remainingConcept: 800 - assets.length },
  };

  for (const asset of assets) {
    try {
      // ---- 3/4) fetch + upsert 1m ----
      const candles1m = await fetchCandles(asset.symbol as string, 200);
      if (!candles1m || candles1m.length < 10) {
        summary.errors.push(`${asset.symbol}: sem dados (provedor sem chave ou offline)`);
        continue;
      }
      const rows = candles1m.map((c) => ({
        asset_id: asset.id,
        timeframe: "1m" as const,
        ts: c.ts,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
      const { error: upsertErr } = await supabase
        .from("candles")
        .upsert(rows, { onConflict: "asset_id,timeframe,ts" });
      if (upsertErr) throw upsertErr;
      summary.processed += rows.length;

      // ---- 5) agregação ----
      const candles5m = aggregateTo5m(candles1m);
      const candles15m = aggregateTo15m(candles1m);
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

      // ---- 10) alerta Telegram (apenas consenso válido) ----
      if (consensus?.passed) {
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
        });
        const sent = await sendTelegramMessage(text);
        if (sent.ok) summary.alertsSent++;
      }
    } catch (e) {
      summary.errors.push(`${asset.symbol}: ${String(e).slice(0, 120)}`);
    }
  }

  // ---- 11) resolução de expirados ----
  try {
    const resolved = await resolveExpired(supabase);
    summary.paperResolved = resolved.signalsResolved + resolved.paperResolved;
  } catch (e) {
    summary.errors.push(`resolução: ${String(e).slice(0, 120)}`);
  }

  return NextResponse.json(summary);
}