"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Loader2, Play, Rocket } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import type { Timeframe } from "@/lib/engine";

interface BacktestRunFormProps {
  symbols: string[];
  defaultSymbol?: string;
  initialRange?: { startTs: number; endTs: number } | null;
  demo?: boolean;
}

interface StatusResp {
  status?: string;
  progress?: number;
  processed?: number;
  total_candles?: number;
  stats?: unknown;
  error_msg?: string;
  backtestId?: string;
  done?: boolean;
}

const TFS: Timeframe[] = ["1m", "5m", "15m"];

export default function BacktestRunForm({ symbols, defaultSymbol, initialRange, demo }: BacktestRunFormProps) {
  const router = useRouter();
  const [symbol, setSymbol] = useState(defaultSymbol ?? symbols[0] ?? "EUR/USD");
  const [timeframe, setTimeframe] = useState<Timeframe>("5m");
  const [startDate, setStartDate] = useState(() =>
    initialRange ? format(new Date(initialRange.startTs * 1000), "yyyy-MM-dd") : ""
  );
  const [endDate, setEndDate] = useState(() =>
    initialRange ? format(new Date(initialRange.endTs * 1000), "yyyy-MM-dd") : ""
  );
  const [scoreMin, setScoreMin] = useState("50");
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<StatusResp | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (initialRange) {
      setStartDate(format(new Date(initialRange.startTs * 1000), "yyyy-MM-dd"));
      setEndDate(format(new Date(initialRange.endTs * 1000), "yyyy-MM-dd"));
    }
  }, [initialRange]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const run = async () => {
    setRunning(true);
    setStatus({ status: "running", progress: 0 });
    try {
      const res = await fetch("/api/backtest/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          timeframe,
          periodoInicio: startDate || null,
          periodoFim: endDate || null,
          scoreMinRegister: Number(scoreMin) || 50,
        }),
      });
      const json = (await res.json()) as StatusResp & { error?: string };
      if (!res.ok || json.error) {
        toast.error(json.error ?? "Falha ao iniciar backtest");
        setRunning(false);
        return;
      }
      const id = json.backtestId;
      if (!id) {
        toast.error("Nenhum backtestId retornado");
        setRunning(false);
        return;
      }
      if (json.done) {
        toast.success("Backtest concluído");
        router.push(`/app/backtest/${id}`);
        return;
      }
      // polling a cada ~900ms
      pollRef.current = setInterval(async () => {
        try {
          const sRes = await fetch(`/api/backtest/status/${id}`);
          const sJson = (await sRes.json()) as StatusResp;
          setStatus(sJson);
          if (sJson.status === "done") {
            if (pollRef.current) clearInterval(pollRef.current);
            toast.success("Backtest concluído");
            router.push(`/app/backtest/${id}`);
          } else if (sJson.status === "error") {
            if (pollRef.current) clearInterval(pollRef.current);
            toast.error(sJson.error_msg ?? "Erro no backtest");
            setRunning(false);
          }
        } catch {
          // tenta de novo no próximo tick
        }
      }, 900);
    } catch {
      toast.error("Erro ao iniciar backtest");
      setRunning(false);
    }
  };

  const progress = status?.progress ?? 0;

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Rocket className="size-4 text-info" />
          Configurar e Rodar Backtest
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Ativo</Label>
            <Select value={symbol} onValueChange={(v) => setSymbol(v ?? symbols[0] ?? "EUR/USD")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {symbols.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Timeframe</Label>
            <Select value={timeframe} onValueChange={(v) => setTimeframe((v ?? "5m") as Timeframe)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TFS.map((tf) => (
                  <SelectItem key={tf} value={tf}>
                    {tf}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Período início</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="dark:[color-scheme:dark]"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Período fim</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="dark:[color-scheme:dark]"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Score mínimo p/ registrar trade ({scoreMin})</Label>
          <Input
            type="number"
            min={0}
            max={100}
            value={scoreMin}
            onChange={(e) => setScoreMin(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Apenas filtro de REGISTRO — não bloqueia o motor. As faixas 50–59…90–100 são calculadas sobre trades ≥ este valor.
          </p>
        </div>

        {running ? (
          <div className="space-y-2 rounded-lg border border-border bg-surface p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> Rodando backtest…
              </span>
              <span className="font-semibold tabular-nums">{progress}%</span>
            </div>
            <Progress value={progress} />
            <div className="text-xs text-muted-foreground">
              Processado: {status?.processed ?? 0} / {status?.total_candles ?? "…"} candles
              {demo && " (demo)"}
            </div>
          </div>
        ) : (
          <Button onClick={run} className="w-full" disabled={!symbol}>
            <Play className="size-4" />
            Rodar Backtest
          </Button>
        )}
      </CardContent>
    </Card>
  );
}