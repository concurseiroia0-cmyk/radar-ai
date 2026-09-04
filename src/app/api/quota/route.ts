import { NextResponse } from "next/server";
import { tdPlan } from "@/lib/services/marketData";

/**
 * GET /api/quota — cota Twelve Data (conceitual, exibição no topo).
 * Multi-chave (TWELVEDATA_KEY / KEY2 / KEY3…): cada conta free dá 800
 * créditos/dia; o cron usa a chave 1 até ~790, depois a 2, depois a 3, com
 * cadência por ativo que caiba no dia. Esgotadas todas → fallback Finnhub.
 */
export async function GET() {
  const now = new Date();
  const plan = tdPlan(now, { forex: 11, stock: 3 });

  return NextResponse.json({
    date: now.toISOString().slice(0, 10),
    used: plan.usedToday,
    remaining: plan.remaining,
    budget: plan.totalBudget,
    keys: plan.keyCount,
    activeKey: plan.activeKey === null ? null : plan.activeKey + 1, // 1-based p/ exibição
    intervalMin: plan.intervalMin,
    source: plan.exhausted ? "finnhub" : "twelvedata",
    concept: true,
    note: `Twelve Data: ${plan.keyCount} chave(s) × ${plan.perKeyBudget} créditos/dia. Chave ativa: ${
      plan.activeKey === null ? "nenhuma (esgotadas)" : `#${plan.activeKey + 1}`
    } · polling a cada ${plan.intervalMin} min por ativo dentro das janelas (IQ Option p/ forex, NYSE p/ ações).`,
  });
}
