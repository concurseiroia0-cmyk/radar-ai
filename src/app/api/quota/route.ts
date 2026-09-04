import { NextResponse } from "next/server";
import { creditsEstimateToday } from "@/lib/schedule";
import { twelveDataDailyBudget } from "@/lib/services/marketData";

/**
 * GET /api/quota — cota Twelve Data (conceitual, exibição no topo).
 * Twelve Data free: 800 créditos/dia. O cron consome Twelve Data apenas dentro
 * das janelas de mercado (IQ Option p/ forex; NYSE p/ ações — schedule.ts) e
 * PARA de usá-la ao atingir o teto do dia, seguindo no fallback Finnhub no
 * mesmo ritmo (sem estourar a meta e sem interromper os sinais).
 */
export async function GET() {
  const now = new Date();
  const budget = twelveDataDailyBudget();
  const used = Math.min(budget, creditsEstimateToday(now, { forex: 11, stock: 3 }));

  return NextResponse.json({
    date: now.toISOString().slice(0, 10),
    used,
    remaining: Math.max(0, budget - used),
    budget,
    source: used >= budget ? "finnhub" : "twelvedata",
    concept: true,
    note: "Twelve Data free: 800 créditos/dia. Consumo só dentro das janelas IQ Option (forex) e NYSE (ações); ao atingir o teto o radar segue no fallback Finnhub sem parar.",
  });
}
