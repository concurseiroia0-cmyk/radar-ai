import { History } from "lucide-react";
import type { MemorySummaryRow } from "@/lib/signalMemory";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface MemoryCardProps {
  rows: MemorySummaryRow[];
  demo: boolean;
}

export default function MemoryCard({ rows, demo }: MemoryCardProps) {
  if (!rows.length) return null;

  const tone = (r: MemorySummaryRow) =>
    r.cold
      ? "border-put/50 bg-put/10 text-put"
      : r.winRate >= 0.6
        ? "border-call/40 bg-call/10 text-call"
        : r.winRate >= 0.45
          ? "border-warn/40 bg-warn/10 text-warn"
          : "border-border bg-surface text-muted-foreground";

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <History className="size-4 text-info" />
          Memória de estratégias — acerto real (sinais resolvidos)
          {demo && <span className="text-xs font-normal text-warn">demo</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {rows.slice(0, 24).map((r) => (
            <div
              key={`${r.symbol}|${r.strategy}|${r.direction}`}
              className={`rounded-lg border px-3 py-2 text-xs ${tone(r)}`}
            >
              <div className="flex items-center justify-between gap-2 font-medium">
                <span className="truncate">
                  {r.symbol} · {r.strategy}
                </span>
                <span>
                  {r.direction === "CALL" ? "▲ CALL" : "▼ PUT"}
                </span>
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2 tabular-nums">
                <span className="opacity-80">
                  {r.total} sinais: {r.wins}W / {r.losses}L
                </span>
                <span className="font-semibold">{(r.winRate * 100).toFixed(0)}%</span>
              </div>
              {r.cold && <div className="mt-1 font-medium text-put">🧊 esfriando — sem alerta por enquanto</div>}
            </div>
          ))}
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Cada sinal já fica gravado com estratégia e resultado (win/loss) e é reusado de forma conservadora: um combo
          (ativo + direção + estratégia) só deixa de gerar alerta depois de amostras suficientes e com acerto bem baixo —
          enquanto isso, o Radar continua exatamente como está. Ver .env (SIGNAL_MEMORY_*) p/ ajustar.
        </p>
      </CardContent>
    </Card>
  );
}
