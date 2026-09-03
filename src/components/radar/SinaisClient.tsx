"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowUpRight, Bot } from "lucide-react";
import type { DemoSignal } from "@/lib/demo-data";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface SinaisClientProps {
  signals: DemoSignal[];
  symbols: string[];
  demo: boolean;
}

const RESULT_META: Record<string, { label: string; cls: string }> = {
  pending: { label: "PENDENTE", cls: "border-warn/50 bg-warn/10 text-warn" },
  win: { label: "WIN", cls: "border-call/50 bg-call/10 text-call" },
  loss: { label: "LOSS", cls: "border-put/50 bg-put/10 text-put" },
  void: { label: "VOID", cls: "border-border text-muted-foreground" },
};

export default function SinaisClient({ signals, symbols, demo }: SinaisClientProps) {
  const [asset, setAsset] = useState("all");
  const [result, setResult] = useState("all");
  const [days, setDays] = useState("all");

  const filtered = useMemo(() => {
    const cutoff = days === "7" ? Date.now() / 1000 - 7 * 86400 : days === "1" ? Date.now() / 1000 - 86400 : 0;
    return signals.filter((s) => {
      if (asset !== "all" && s.symbol !== asset) return false;
      if (result !== "all" && s.result !== result) return false;
      if (cutoff && s.ts < cutoff) return false;
      return true;
    });
  }, [signals, asset, result, days]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={asset} onValueChange={(v) => setAsset(v ?? "all")}>
          <SelectTrigger className="min-w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os ativos</SelectItem>
            {symbols.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={result} onValueChange={(v) => setResult(v ?? "all")}>
          <SelectTrigger className="min-w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os resultados</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="win">Win</SelectItem>
            <SelectItem value="loss">Loss</SelectItem>
            <SelectItem value="void">Void</SelectItem>
          </SelectContent>
        </Select>
        <Select value={days} onValueChange={(v) => setDays(v ?? "all")}>
          <SelectTrigger className="min-w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todo período</SelectItem>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="1">Últimas 24h</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto text-sm text-muted-foreground">
          {filtered.length} sinais{demo ? " • demo" : ""}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Data/Hora (UTC)</TableHead>
              <TableHead>Ativo</TableHead>
              <TableHead>TF</TableHead>
              <TableHead>Direção</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead>Estratégia</TableHead>
              <TableHead>IA</TableHead>
              <TableHead>Resultado</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((s) => {
              const rm = RESULT_META[s.result];
              return (
                <TableRow key={s.id}>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {format(new Date(s.ts * 1000), "dd/MM/yyyy HH:mm")}
                  </TableCell>
                  <TableCell className="font-medium">{s.symbol}</TableCell>
                  <TableCell className="text-muted-foreground">{s.timeframe}</TableCell>
                  <TableCell>
                    <span className={s.direction === "CALL" ? "text-call" : "text-put"}>
                      {s.direction === "CALL" ? "▲ CALL" : "▼ PUT"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{s.score}</TableCell>
                  <TableCell className="text-muted-foreground">{s.strategy}</TableCell>
                  <TableCell>
                    <span
                      className={`flex items-center gap-1 text-xs ${
                        s.aiPass ? "text-call" : "text-muted-foreground"
                      }`}
                    >
                      <Bot className="size-3" />
                      {s.aiPass ? s.aiConsensusLabel : "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge className={rm.cls}>{rm.label}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="xs" render={<Link href={`/app/ativo/${encodeURIComponent(s.symbol)}`} />}>
                      Ver gráfico <ArrowUpRight className="size-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {!filtered.length && (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                  Nenhum sinal encontrado com os filtros atuais.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}