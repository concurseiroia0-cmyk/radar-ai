"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import type { BacktestTradeRecord } from "@/lib/backtest/runner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface TradesTableProps {
  trades: BacktestTradeRecord[];
  pageSize?: number;
}

const RESULT_META: Record<string, { label: string; cls: string }> = {
  win: { label: "WIN", cls: "border-call/50 bg-call/10 text-call" },
  loss: { label: "LOSS", cls: "border-put/50 bg-put/10 text-put" },
  void: { label: "VOID", cls: "border-border text-muted-foreground" },
};

export default function TradesTable({ trades, pageSize = 15 }: TradesTableProps) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(trades.length / pageSize));
  const current = useMemo(
    () => trades.slice(page * pageSize, (page + 1) * pageSize),
    [trades, page, pageSize]
  );

  if (!trades.length) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Nenhuma operação registrada.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Data/Hora (UTC)</TableHead>
              <TableHead>Direção</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead>Estratégia</TableHead>
              <TableHead className="text-right">Entrada</TableHead>
              <TableHead>Resultado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {current.map((t) => {
              const rm = RESULT_META[t.result];
              return (
                <TableRow key={`${t.ts}-${t.score}-${t.entryPrice}`}>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {format(new Date(t.ts * 1000), "dd/MM/yyyy HH:mm")}
                  </TableCell>
                  <TableCell>
                    <span className={t.direction === "CALL" ? "text-call" : "text-put"}>
                      {t.direction === "CALL" ? "▲ CALL" : "▼ PUT"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{t.score}</TableCell>
                  <TableCell className="text-muted-foreground">{t.strategy}</TableCell>
                  <TableCell className="text-right tabular-nums">{t.entryPrice.toFixed(5)}</TableCell>
                  <TableCell>
                    <Badge className={rm.cls}>{rm.label}</Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {trades.length} operações • página {page + 1}/{pages}
        </span>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </Button>
        </div>
      </div>
    </div>
  );
}