import Link from "next/link";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Bot, Flame } from "lucide-react";
import type { DemoSignal } from "@/lib/demo-data";
import { fmt, scoreBandInfo } from "@/lib/engine";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ScoreBar from "./ScoreBar";

interface SignalCardProps {
  signal: DemoSignal;
}

export default function SignalCard({ signal }: SignalCardProps) {
  const band = scoreBandInfo(signal.score);
  const isCall = signal.direction === "CALL";

  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Link
            href={`/app/ativo/${encodeURIComponent(signal.symbol)}`}
            className="hover:text-info"
          >
            {signal.symbol}
          </Link>
          <Badge variant="outline" className="text-muted-foreground">
            {signal.timeframe}
          </Badge>
        </CardTitle>
        <Badge
          className={
            isCall
              ? "border-call/50 bg-call/10 text-call"
              : "border-put/50 bg-put/10 text-put"
          }
        >
          {isCall ? "▲ CALL" : "▼ PUT"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {format(new Date(signal.ts * 1000), "dd/MM HH:mm", { locale: ptBR })} UTC
          </div>
          <div className="flex items-center gap-1 text-xs font-semibold" style={{ color: band.color }}>
            {signal.score >= 85 && <Flame className="size-3.5" />}
            {signal.score}/100
          </div>
        </div>
        <ScoreBar score={signal.score} showLabel={false} />
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            {signal.strategy} • entrada {fmt(signal.entryPrice)}
          </span>
          <span className="flex items-center gap-1">
            <Bot className="size-3.5 text-muted-foreground" />
            {signal.aiPass ? (
              <span className="text-call">Consenso {signal.aiConsensusLabel}</span>
            ) : (
              <span className="text-muted-foreground">IA —</span>
            )}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}