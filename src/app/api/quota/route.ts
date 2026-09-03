import { NextResponse } from "next/server";
import { creditsEstimateToday } from "@/lib/schedule";

/**
 * GET /api/quota — cota CONCEITUAL (exibição no topo).
 * Twelve Data free: 800 requisições/dia. O cron só consome cota dentro das
 * janelas de mercado (IQ Option p/ forex; NYSE p/ ações — src/lib/schedule.ts),
 * 1 requisição por ativo a cada 5 min.
 */
export async function GET() {
  const now = new Date();
  const used = creditsEstimateToday(now, { forex: 10, stock: 3 });

  return NextResponse.json({
    date: now.toISOString().slice(0, 10),
    used,
    remaining: Math.max(0, 800 - used),
    source: "twelvedata",
    concept: true,
    note: "Valor conceitual — Twelve Data free oferece 800 créditos/dia (8/min). Cron consome apenas dentro das janelas IQ Option (forex) e NYSE (ações).",
  });
}
