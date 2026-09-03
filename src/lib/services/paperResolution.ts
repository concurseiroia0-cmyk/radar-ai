import type { SupabaseClient } from "@supabase/supabase-js";
import type { Timeframe } from "@/lib/engine";
import { TF_DURATION_SECONDS, resolvePnl, resolveResult } from "@/lib/paper";

/**
 * Resolução automática por expiração (Prompt 2 §5).
 * Chamada pelo cron: sinais/paper_trades pendentes e vencidos são resolvidos
 * contra o preço do candle 1m no instante da expiração (ou o mais próximo
 * depois, tolerância 120s). Sem candle → void.
 */

interface PendingSignal {
  id: string;
  asset_id: string;
  timeframe: Timeframe;
  direction: "CALL" | "PUT";
  entry_price: number;
  created_at: string;
}

interface PendingPaper {
  id: string;
  user_id: string;
  signal_id: string | null;
  direction: "CALL" | "PUT";
  entry_price: number;
  stake: number;
  expires_at: string | null;
  created_at: string;
}

export interface ResolutionSummary {
  signalsResolved: number;
  paperResolved: number;
  pnlApplied: number;
}

const TOLERANCE_S = 120;

export async function resolveExpired(
  supabase: SupabaseClient,
  now = Date.now()
): Promise<ResolutionSummary> {
  const summary: ResolutionSummary = { signalsResolved: 0, paperResolved: 0, pnlApplied: 0 };

  // 1) sinais pendentes vencidos
  const { data: signals } = await supabase
    .from("signals")
    .select("id, asset_id, timeframe, direction, entry_price, created_at")
    .eq("result", "pending")
    .limit(200);
  if (signals) {
    for (const s of signals as PendingSignal[]) {
      const created = new Date(s.created_at).getTime() / 1000;
      const expiry = created + TF_DURATION_SECONDS[s.timeframe] + TOLERANCE_S;
      if (expiry > now / 1000) continue; // ainda não venceu
      const exit = await exitPriceAt(supabase, s.asset_id, expiry);
      const result = exit === null ? "void" : resolveResult(s.direction, s.entry_price, exit);
      await supabase
        .from("signals")
        .update({ result, resolved_at: new Date().toISOString() })
        .eq("id", s.id);
      summary.signalsResolved++;
    }
  }

  // 2) paper_trades pendentes vencidos
  const { data: papers } = await supabase
    .from("paper_trades")
    .select("id, user_id, signal_id, direction, entry_price, stake, expires_at, created_at")
    .eq("result", "pending")
    .limit(200);
  if (papers) {
    for (const p of papers as PendingPaper[]) {
      const expiryTs = p.expires_at ? new Date(p.expires_at).getTime() / 1000 : null;
      const createdTs = new Date(p.created_at).getTime() / 1000;
      const expiry = expiryTs ?? createdTs + 300;
      if (expiry > now / 1000) continue;
      const signal = p.signal_id
        ? await signalInfo(supabase, p.signal_id)
        : null;
      if (!signal) {
        // sem sinal → void (sem preço de referência confiável)
        await supabase
          .from("paper_trades")
          .update({ result: "void", resolved_at: new Date().toISOString(), pnl: 0 })
          .eq("id", p.id);
        summary.paperResolved++;
        continue;
      }
      const exit = await exitPriceAt(supabase, signal.asset_id, expiry);
      const result = exit === null ? "void" : resolveResult(p.direction, p.entry_price, exit);
      const pnl = resolvePnl(result, p.stake);
      await supabase
        .from("paper_trades")
        .update({ result, resolved_at: new Date().toISOString(), pnl })
        .eq("id", p.id);
      // atualiza banca do usuário
      if (pnl !== 0) {
        await supabase.rpc("adjust_banca", { p_user_id: p.user_id, p_pnl: pnl });
        summary.pnlApplied += pnl;
      }
      summary.paperResolved++;
    }
  }

  return summary;
}

async function signalInfo(
  supabase: SupabaseClient,
  signalId: string
): Promise<{ asset_id: string } | null> {
  const { data } = await supabase
    .from("signals")
    .select("asset_id")
    .eq("id", signalId)
    .maybeSingle();
  return data as { asset_id: string } | null;
}

/** Preço 1m no instante da expiração (ou o mais próximo após, tolerância 120s). */
async function exitPriceAt(
  supabase: SupabaseClient,
  assetId: string,
  tsSeconds: number
): Promise<number | null> {
  const { data } = await supabase
    .from("candles")
    .select("close, ts")
    .eq("asset_id", assetId)
    .eq("timeframe", "1m")
    .gte("ts", Math.floor(tsSeconds) - TOLERANCE_S)
    .lte("ts", Math.floor(tsSeconds) + TOLERANCE_S)
    .order("ts", { ascending: true })
    .limit(1);
  if (data && data.length > 0) return Number(data[0].close);
  return null;
}