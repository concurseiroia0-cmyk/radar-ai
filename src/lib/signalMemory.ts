/**
 * Memória de estratégias — reuso CONSERVADOR do histórico real.
 *
 * Todo sinal já é gravado no banco com direção, estratégia, score e RESULTADO
 * (win/loss/void) resolvido pelo cron. Aqui transformamos esse histórico em
 * duas coisas:
 *
 * 1) fetchColdCheck  — usado pelo cron ANTES de criar um novo sinal: se um
 *    combo (ativo + direção + estratégia) tiver amostra suficiente e acerto
 *    baixo demais, o sinal NÃO é criado/alertado (evita repetir o que vem
 *    errando). Conservador por padrão: exige muitas amostras e um acerto bem
 *    baixo para disparar — com pouca história o comportamento é idêntico ao
 *    de hoje.
 *
 * 2) fetchMemorySummary — painel de acerto real por estratégia (página Sinais),
 *    para enxergar o que está funcionando.
 *
 * Tudo configurável por env (ver .env.example); pode ser desligado com
 * SIGNAL_MEMORY_ENABLED=0.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface SignalMemoryConfig {
  enabled: boolean;
  /** amostras resolvidas mínimas antes de considerar o histórico */
  minSamples: number;
  /** acerto (0–1) abaixo do qual o combo é considerado "frio" */
  coldWinRate: number;
  /** janela do histórico em dias */
  lookbackDays: number;
}

function num(v: string | undefined, d: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
}

export function signalMemoryConfig(): SignalMemoryConfig {
  const dis = process.env.SIGNAL_MEMORY_ENABLED;
  return {
    enabled: dis !== "0" && dis !== "false",
    minSamples: num(process.env.SIGNAL_MEMORY_MIN_SAMPLES, 15),
    coldWinRate: Math.max(0, Math.min(1, num(process.env.SIGNAL_MEMORY_COLD_WINRATE, 0.35))),
    lookbackDays: num(process.env.SIGNAL_MEMORY_LOOKBACK_DAYS, 60),
  };
}

export interface MemoryStat {
  total: number;
  wins: number;
  losses: number;
  winRate: number; // 0–1
}

export interface ColdCheckResult {
  cold: boolean;
  stat: MemoryStat;
  cfg: SignalMemoryConfig;
}

/** Consulta o histórico resolvido de um combo (ativo + direção + estratégia). */
export async function fetchColdCheck(
  supabase: SupabaseClient,
  opts: { assetId: string; direction: "CALL" | "PUT"; strategy: string; timeframe?: string; now?: number }
): Promise<ColdCheckResult> {
  const cfg = signalMemoryConfig();
  const empty: MemoryStat = { total: 0, wins: 0, losses: 0, winRate: 0 };
  if (!cfg.enabled) return { cold: false, stat: empty, cfg };

  const now = opts.now ?? Date.now();
  const from = new Date(now - cfg.lookbackDays * 86_400_000).toISOString();
  const { data } = await supabase
    .from("signals")
    .select("result")
    .eq("asset_id", opts.assetId)
    .eq("timeframe", opts.timeframe ?? "5m")
    .eq("direction", opts.direction)
    .eq("strategy", opts.strategy)
    .in("result", ["win", "loss"])
    .gte("created_at", from)
    .limit(300);
  const rows = data ?? [];
  const wins = rows.filter((r) => r.result === "win").length;
  const losses = rows.filter((r) => r.result === "loss").length;
  const stat: MemoryStat = {
    total: wins + losses,
    wins,
    losses,
    winRate: wins + losses > 0 ? wins / (wins + losses) : 0,
  };
  return {
    cold: stat.total >= cfg.minSamples && stat.winRate <= cfg.coldWinRate,
    stat,
    cfg,
  };
}

export interface MemorySummaryRow {
  symbol: string;
  strategy: string;
  direction: string;
  total: number;
  wins: number;
  losses: number;
  winRate: number;
  cold: boolean;
}

function summarizeRows(
  rows: { symbol: string; strategy: string | null; direction: string; result: string }[],
  cfg: SignalMemoryConfig
): MemorySummaryRow[] {
  const by = new Map<string, MemorySummaryRow>();
  for (const r of rows) {
    if (r.result !== "win" && r.result !== "loss") continue;
    const strategy = r.strategy || "—";
    const key = `${r.symbol}|${strategy}|${r.direction}`;
    const cur = by.get(key) ?? {
      symbol: r.symbol,
      strategy,
      direction: r.direction,
      total: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      cold: false,
    };
    cur.total++;
    if (r.result === "win") cur.wins++;
    else cur.losses++;
    by.set(key, cur);
  }
  const out = [...by.values()].map((r) => ({
    ...r,
    winRate: r.total ? r.wins / r.total : 0,
    cold: r.total >= cfg.minSamples && r.wins / r.total <= cfg.coldWinRate,
  }));
  return out.sort((a, b) => b.total - a.total || b.winRate - a.winRate);
}

/** Painel (página Sinais): acerto real recente por ativo+estratégia+direção. */
export async function fetchMemorySummary(
  supabase: SupabaseClient,
  opts: { lookbackDays?: number; minTotal?: number } = {}
): Promise<{ rows: MemorySummaryRow[]; cfg: SignalMemoryConfig }> {
  const cfg = signalMemoryConfig();
  const lookback = opts.lookbackDays ?? Math.max(cfg.lookbackDays, 30);
  const from = new Date(Date.now() - lookback * 86_400_000).toISOString();
  const { data } = await supabase
    .from("signals")
    .select("result, strategy, direction, assets(symbol)")
    .in("result", ["win", "loss"])
    .gte("created_at", from)
    .limit(1000);
  const rows = (data ?? []).map((r) => ({
    symbol: (r.assets as { symbol?: string } | undefined)?.symbol ?? "—",
    strategy: r.strategy as string | null,
    direction: r.direction as string,
    result: r.result as string,
  }));
  const minTotal = opts.minTotal ?? 4;
  return { rows: summarizeRows(rows, cfg).filter((r) => r.total >= minTotal), cfg };
}

/** Variante sem banco — demo (os sinais sintéticos já vêm com resultado). */
export function summarizeDemoSignals(
  signals: { symbol: string; strategy: string | null; direction: string; result: string }[]
): MemorySummaryRow[] {
  const cfg = signalMemoryConfig();
  return summarizeRows(signals, cfg).filter((r) => r.total >= 3);
}
