import { NextResponse } from "next/server";

/**
 * GET /api/quota — cota CONCEITUAL (exibição no topo).
 * Twelve Data free: 800 requisições/dia. Cron a cada 2 min × 6 ativos
 * dentro da janela de sessão (7–12 UTC) ≈ dentro do limite.
 */
export async function GET() {
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);

  const runs = Math.max(0, Math.floor((now.getTime() - dayStart.getTime()) / (2 * 60 * 1000)));
  const hour = now.getUTCHours();
  const inSession = hour >= 7 && hour < 12;
  const perRun = inSession ? 6 : 0; // 6 ativos dentro da sessão; 0 fora (cron pula)
  const used = Math.min(800, runs * perRun);

  return NextResponse.json({
    date: now.toISOString().slice(0, 10),
    used,
    remaining: Math.max(0, 800 - used),
    source: "twelvedata",
    concept: true,
    note: "Valor conceitual — Twelve Data free oferece 800 créditos/dia (8/min). Cron a cada 2 min dentro da sessão 7–12 UTC cabe no plano.",
  });
}