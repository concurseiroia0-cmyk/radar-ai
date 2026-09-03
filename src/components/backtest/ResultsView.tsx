import { Activity, Target, TrendingDown, Zap } from "lucide-react";
import type { BacktestRunResult } from "@/lib/backtest/runner";
import EquityCurve from "@/components/charts/EquityCurve";
import ScoreTable from "./ScoreTable";
import TradesTable from "./TradesTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ResultsViewProps {
  result: BacktestRunResult;
  symbol: string;
  timeframe: string;
  demo?: boolean;
}

function Kpi({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub?: string; color?: string }) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="flex items-start gap-3 pt-5">
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

export default function ResultsView({ result, symbol, timeframe, demo }: ResultsViewProps) {
  const { stats, trades } = result;

  return (
    <div className="space-y-6">
      {demo && (
        <div className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
          Resultado de demonstração — dados sintéticos gerados pelo mesmo motor real.
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi icon={<Activity className="size-4" />} label="Operações" value={String(stats.total)} sub={`${stats.wins}W / ${stats.losses}L / ${stats.voids}V`} color="#4d9de0" />
        <Kpi icon={<Target className="size-4" />} label="Acerto" value={`${stats.winRate.toFixed(1)}%`} sub="Taxa de acerto (win/loss)" color={stats.winRate >= 50 ? "#16c784" : "#ea3943"} />
        <Kpi icon={<TrendingDown className="size-4" />} label="Drawdown máx." value={`${stats.maxDrawdown.toFixed(2)}%`} sub={`Máx. perdas seguidas: ${stats.maxLossStreak}`} color="#f0b90b" />
        <Kpi icon={<Zap className="size-4" />} label="Expectativa" value={stats.expectancy.toFixed(4)} sub="Média por trade (fração do stake)" color="#22d3b5" />
      </div>

      {/* SEÇÃO #1 — Desempenho por score */}
      <SectionCard title="SEÇÃO #1 — Desempenho por Score">
        <ScoreTable byScore={stats.byScore} />
      </SectionCard>

      {/* SEÇÃO #2 — Por estratégia */}
      <SectionCard title="SEÇÃO #2 — Por Estratégia">
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
            {(stats.byStrategy.length ? stats.byStrategy : [{ key: "—", trades: 0, wins: 0, winRate: 0 }]).map((s) => (
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

      {/* SEÇÃO #3 — Por horário */}
      <SectionCard title="SEÇÃO #3 — Por Horário (UTC, hora do candle)">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {stats.byHour.map((h) => (
            <div key={h.key} className="rounded-lg border border-border bg-surface px-3 py-2">
              <div className="text-lg font-bold tabular-nums">{h.key}h</div>
              <div className="text-xs text-muted-foreground">
                {h.trades} ops • {h.winRate.toFixed(0)}% acerto
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* SEÇÃO #4 — Por ativo */}
      <SectionCard title="SEÇÃO #4 — Por Ativo">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Ativo</TableHead>
              <TableHead className="text-right">Operações</TableHead>
              <TableHead className="text-right">Wins</TableHead>
              <TableHead className="text-right">Acerto %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">{symbol}</TableCell>
              <TableCell className="text-right tabular-nums">{stats.total}</TableCell>
              <TableCell className="text-right tabular-nums text-call">{stats.wins}</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">{stats.winRate.toFixed(1)}%</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </SectionCard>

      {/* SEÇÃO #5 — Curva de Equity */}
      <SectionCard title={`SEÇÃO #5 — Curva de Equity (${symbol} • ${timeframe})`}>
        <EquityCurve equity={stats.equity} />
      </SectionCard>

      {/* SEÇÃO #6 — Lista de operações */}
      <SectionCard title={`SEÇÃO #6 — Lista de Operações (${trades.length})`}>
        <TradesTable trades={trades} />
      </SectionCard>
    </div>
  );
}