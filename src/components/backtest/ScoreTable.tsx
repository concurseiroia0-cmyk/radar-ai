import type { ScoreBandStat } from "@/lib/backtest/runner";

interface ScoreTableProps {
  byScore: ScoreBandStat[];
}

const BAND_COLORS: Record<string, string> = {
  "50–59": "#f0b90b",
  "60–69": "#f5a623",
  "70–79": "#16c784",
  "80–89": "#16c784",
  "90–100": "#22d3b5",
};

/**
 * SEÇÃO #1 — Desempenho por faixa de score (obrigatória, sempre exibida).
 * Faixas exatas: 50–59, 60–69, 70–79, 80–89, 90–100.
 */
export default function ScoreTable({ byScore }: ScoreTableProps) {
  return (
    <div className="space-y-3">
      {byScore.map((b) => {
        const color = BAND_COLORS[b.band] ?? "#6b7280";
        return (
          <div key={b.band} className="flex items-center gap-3 text-sm">
            <span className="w-16 shrink-0 font-medium tabular-nums">{b.band}</span>
            <div className="h-5 w-full min-w-0 overflow-hidden rounded bg-muted">
              <div
                className="h-full rounded transition-all"
                style={{ width: `${Math.min(100, b.winRate)}%`, background: color }}
              />
            </div>
            <span className="w-20 shrink-0 text-right font-semibold tabular-nums" style={{ color }}>
              {b.winRate.toFixed(1)}%
            </span>
            <span className="w-16 shrink-0 text-right text-muted-foreground tabular-nums">
              {b.trades} ops
            </span>
          </div>
        );
      })}
    </div>
  );
}