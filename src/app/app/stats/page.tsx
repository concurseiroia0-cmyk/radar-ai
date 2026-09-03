import { Activity, Bot, Target, TrendingUp, Wallet } from "lucide-react";
import ScoreTable from "@/components/backtest/ScoreTable";
import EquityCurve from "@/components/charts/EquityCurve";
import TradesTable from "@/components/backtest/TradesTable";
import { getDemoBacktest, getDemoSignalsAll } from "@/lib/demo-data";
import { getProfile } from "@/lib/actions/profile";
import { createServerSupabaseClient, isSupabaseConfigured } from "@/lib/services/supabase-server";
import type { BacktestRunResult } from "@/lib/backtest/runner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

function Kpi({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub?: string; color?: string }) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="flex items-center gap-3 pt-5">
        <div className="rounded-lg bg-muted p-2" style={{ color: color ?? "#a9b3c0" }}>
          {icon}
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-xl font-bold tabular-nums">{value}</div>
          {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default async function StatsPage() {
  const demo = !isSupabaseConfigured();
  const profile = await getProfile();

  // dados de referência: backtest (estatística do motor) + sinais + paper
  let bt: BacktestRunResult | null = null;
  let signalsCount = 0;
  let signalsWin = 0;
  let paperTrades: { pnl: number; result: string; createdAt: string }[] = [];
  let banca = profile?.banca ?? 500;

  if (demo) {
    bt = await getDemoBacktest("EUR/USD", "5m");
    const all = getDemoSignalsAll(20);
    signalsCount = all.length;
    signalsWin = all.filter((s) => s.result === "win").length;
  } else {
    const supabase = await createServerSupabaseClient();
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: sigRows } = await supabase.from("signals").select("result").limit(500);
        const list = sigRows ?? [];
        signalsCount = list.length;
        signalsWin = list.filter((r) => r.result === "win").length;
        const { data: paperRows } = await supabase
          .from("paper_trades")
          .select("pnl, result, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true });
        paperTrades = (paperRows ?? []).map((r) => ({
          pnl: Number(r.pnl),
          result: r.result as string,
          createdAt: String(r.created_at),
        }));
        const { data: prof } = await supabase.from("profiles").select("banca").eq("id", user.id).maybeSingle();
        if (prof) banca = Number(prof.banca);
      }
    }
  }

  const paperResolved = paperTrades.filter((t) => t.result !== "pending");
  const paperWin = paperResolved.filter((t) => t.result === "win").length;
  const paperWinRate = paperResolved.length ? (paperWin / paperResolved.length) * 100 : 0;
  // curva de banca: base 100, acumulando PnL em R$ sobre banca inicial R$ 500
  let equity: number[] = [];
  if (paperTrades.length) {
    let cum = 0;
    equity = [100];
    for (const t of paperTrades) {
      cum += t.pnl;
      equity.push(Number((100 * (1 + cum / 500)).toFixed(2)));
    }
  }

  const aiCount = demo ? getDemoSignalsAll(20).filter((s) => s.aiPass).length : 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">Stats</h1>
        {demo && (
          <span className="rounded-md border border-warn/50 bg-warn/10 px-2 py-0.5 text-xs text-warn">Demo</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi icon={<Activity className="size-4" />} label="Sinais (motor)" value={String(signalsCount)} color="#4d9de0" />
        <Kpi icon={<Target className="size-4" />} label="Acerto técnico" value={`${signalsCount ? ((signalsWin / signalsCount) * 100).toFixed(1) : "0.0"}%`} color="#16c784" />
        <Kpi icon={<Bot className="size-4" />} label="Sinais com IA" value={String(aiCount)} color="#22d3b5" />
        <Kpi icon={<Wallet className="size-4" />} label="Trades paper" value={String(paperResolved.length)} sub={`${paperWinRate.toFixed(1)}% acerto`} color="#f0b90b" />
        <Kpi icon={<TrendingUp className="size-4" />} label="Banca atual" value={`R$ ${banca.toFixed(2)}`} color="#16c784" />
      </div>

      {bt && (
        <>
          <SectionCard title="Acerto por faixa de score (backtest EUR/USD 5m)">
            <ScoreTable byScore={bt.stats.byScore} />
          </SectionCard>

          <SectionCard title="Acerto por estratégia">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Estratégia</TableHead>
                  <TableHead className="text-right">Operações</TableHead>
                  <TableHead className="text-right">Wins</TableHead>
                  <TableHead className="text-right">Acerto %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bt.stats.byStrategy.map((s) => (
                  <TableRow key={s.key}>
                    <TableCell className="font-medium">{s.key}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.trades}</TableCell>
                    <TableCell className="text-right tabular-nums text-call">{s.wins}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{s.winRate.toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </SectionCard>

          <SectionCard title="Acerto por horário (UTC)">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 md:grid-cols-12">
              {bt.stats.byHour.map((h) => (
                <div key={h.key} className="rounded-lg border border-border bg-surface px-2 py-1.5 text-center">
                  <div className="text-sm font-bold tabular-nums">{h.key}h</div>
                  <div className="text-[10px] text-muted-foreground">
                    {h.trades} • {h.winRate.toFixed(0)}%
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </>
      )}

      <SectionCard title="Curva de banca (paper trading)">
        {paperTrades.length ? (
          <EquityCurve equity={equity} label="Banca (base 100)" />
        ) : (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Sem operações de paper ainda — entre em um sinal na página Paper.
          </div>
        )}
      </SectionCard>

      {bt && (
        <SectionCard title={`Últimas operações do backtest (${bt.trades.length})`}>
          <TradesTable trades={bt.trades.slice(-30).reverse()} pageSize={10} />
        </SectionCard>
      )}
    </div>
  );
}