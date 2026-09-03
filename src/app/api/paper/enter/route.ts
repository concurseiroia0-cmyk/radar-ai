import { NextResponse } from "next/server";
import type { Timeframe } from "@/lib/engine";
import { calculateStake, expiresAt } from "@/lib/paper";
import { createServerSupabaseClient, createServiceSupabaseClient, isSupabaseConfigured } from "@/lib/services/supabase-server";
import { getDemoSignalsAll } from "@/lib/demo-data";

/**
 * POST { signalId } — entra em um sinal pendente no Paper Trading.
 * stake = banca × risco% / 100. Expiração = created_at + duração do timeframe.
 * Retorna { trade, banca, stake }.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { signalId?: string };
  if (!body.signalId) {
    return NextResponse.json({ error: "signalId é obrigatório" }, { status: 400 });
  }

  // ---- demo: devolve um trade de demonstração ----
  if (!isSupabaseConfigured()) {
    const signal = getDemoSignalsAll(50).find((s) => s.id === body.signalId);
    if (!signal) {
      return NextResponse.json({ error: "Sinal não encontrado (demo)" }, { status: 404 });
    }
    const stake = calculateStake(500, 1);
    return NextResponse.json({
      demo: true,
      banca: 500 - stake,
      trade: {
        id: `demo-pt-${Date.now()}`,
        symbol: signal.symbol,
        timeframe: signal.timeframe,
        direction: signal.direction,
        stake,
        entryPrice: signal.entryPrice,
        expiresAt: expiresAt(signal.ts, signal.timeframe),
        result: "pending",
        pnl: 0,
        createdAt: Date.now() / 1000,
      },
    });
  }

  // ---- real ----
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const service = await createServiceSupabaseClient();
  if (!service) return NextResponse.json({ error: "Serviço indisponível" }, { status: 500 });

  const { data: signal } = await service
    .from("signals")
    .select("id, direction, entry_price, timeframe, created_at, result")
    .eq("id", body.signalId)
    .maybeSingle();
  if (!signal) return NextResponse.json({ error: "Sinal não encontrado" }, { status: 404 });
  if (signal.result !== "pending") {
    return NextResponse.json({ error: "Sinal já resolvido ou expirado" }, { status: 400 });
  }

  const { data: profile } = await service
    .from("profiles")
    .select("banca, risco_pct")
    .eq("id", user.id)
    .maybeSingle();
  const banca = Number(profile?.banca ?? 500);
  const riscoPct = Number(profile?.risco_pct ?? 1);
  const stake = calculateStake(banca, riscoPct);
  if (stake <= 0) {
    return NextResponse.json({ error: "Banca zerada ou risco inválido" }, { status: 400 });
  }

  const createdSec = new Date(String(signal.created_at)).getTime() / 1000;
  const expirySec = expiresAt(createdSec, signal.timeframe as Timeframe);

  const { data: trade, error } = await service
    .from("paper_trades")
    .insert({
      user_id: user.id,
      signal_id: signal.id,
      stake,
      entry_price: Number(signal.entry_price),
      direction: signal.direction,
      result: "pending",
      pnl: 0,
      expires_at: new Date(expirySec * 1000).toISOString(),
    })
    .select("id, stake, entry_price, direction, expires_at, result, pnl, created_at")
    .single();
  if (error) {
    return NextResponse.json({ error: `Falha ao entrar: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({
    banca,
    trade: {
      id: String(trade.id),
      symbol: "—",
      timeframe: signal.timeframe,
      direction: trade.direction as "CALL" | "PUT",
      stake: Number(trade.stake),
      entryPrice: Number(trade.entry_price),
      expiresAt: new Date(String(trade.expires_at)).getTime() / 1000,
      result: trade.result as "pending",
      pnl: Number(trade.pnl),
      createdAt: new Date(String(trade.created_at)).getTime() / 1000,
    },
  });
}