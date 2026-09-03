import Link from "next/link";
import { TrendingDown, TrendingUp, Minus, ArrowUpRight } from "lucide-react";
import type { DemoAssetSnapshot } from "@/lib/demo-data";
import { fmt, scoreBandInfo } from "@/lib/engine";
import ScoreBar from "./ScoreBar";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface AssetTableProps {
  snapshots: DemoAssetSnapshot[];
}

const TREND_META: Record<string, { icon: React.ReactNode; cls: string; label: string }> = {
  alta: { icon: <TrendingUp className="size-3.5" />, cls: "text-call", label: "Alta" },
  baixa: { icon: <TrendingDown className="size-3.5" />, cls: "text-put", label: "Baixa" },
  lateral: { icon: <Minus className="size-3.5" />, cls: "text-warn", label: "Lateral" },
  indefinida: { icon: <Minus className="size-3.5" />, cls: "text-muted-foreground", label: "Indef." },
};

function signalBadge(score: number | null) {
  if (score === null) return <span className="text-muted-foreground">—</span>;
  const b = scoreBandInfo(score);
  return (
    <span title={`${b.label} (${score})`} className="text-base leading-none">
      {b.emoji}
    </span>
  );
}

export default function AssetTable({ snapshots }: AssetTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>ATIVO</TableHead>
            <TableHead className="text-right">PREÇO</TableHead>
            <TableHead className="text-right">VAR %</TableHead>
            <TableHead>TENDÊNCIA</TableHead>
            <TableHead className="text-right">RSI</TableHead>
            <TableHead>MACD</TableHead>
            <TableHead className="min-w-44">SCORE</TableHead>
            <TableHead>SINAL</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {snapshots.map((s) => {
            const trend = TREND_META[s.pack.trend] ?? TREND_META.indefinida;
            const macdState = s.pack.macd.state;
            const sig = s.lastSignal;
            return (
              <TableRow key={s.asset.symbol} className="cursor-pointer hover:bg-muted/40">
                <TableCell>
                  <Link
                    href={`/app/ativo/${encodeURIComponent(s.asset.symbol)}`}
                    className="flex items-center gap-2 font-medium text-foreground hover:text-info"
                  >
                    {s.asset.symbol}
                    <ArrowUpRight className="size-3.5 text-muted-foreground" />
                  </Link>
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {fmt(s.price, s.price < 10 ? 5 : 3)}
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums ${s.changePct >= 0 ? "text-call" : "text-put"}`}
                >
                  {s.changePct >= 0 ? "+" : ""}
                  {s.changePct.toFixed(2)}%
                </TableCell>
                <TableCell>
                  <span className={`inline-flex items-center gap-1 ${trend.cls}`}>
                    {trend.icon} {trend.label}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{Math.round(s.pack.rsi)}</TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={
                      macdState === "positivo"
                        ? "border-call/40 text-call"
                        : macdState === "negativo"
                          ? "border-put/40 text-put"
                          : "border-border text-muted-foreground"
                    }
                  >
                    {macdState === "positivo" ? "▲ +" : macdState === "negativo" ? "▼ −" : "● 0"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="min-w-44">
                    <ScoreBar score={sig?.score ?? 0} size="sm" showLabel={false} />
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <span>{sig ? sig.score : 0}</span>
                      {sig && <span>• {sig.strategy}</span>}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {sig ? (
                    <div className="flex items-center gap-2">
                      {signalBadge(sig.score)}
                      {sig.aiPass ? (
                        <Badge className="border-call/40 bg-call/10 text-call">IA ✓</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}