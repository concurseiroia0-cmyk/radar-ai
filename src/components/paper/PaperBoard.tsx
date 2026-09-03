"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Clock, Loader2, Wallet } from "lucide-react";
import type { DemoSignal } from "@/lib/demo-data";
import { getDemoCandles } from "@/lib/demo-data";
import { resolvePnl, resolveResult } from "@/lib/paper";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface PaperTradeUI {
  id: string;
  symbol: string;
  timeframe: string;
  direction: "CALL" | "PUT";
  stake: number;
  entryPrice: number;
  expiresAt: number; // unix seconds
  result: "pending" | "win" | "loss" | "void";
  pnl: number;
  createdAt: number;
}

interface PaperBoardProps {
  demo: boolean;
  initialBanca: number;
  riscoPct: number;
  signals: DemoSignal[];
  initialTrades: PaperTradeUI[];
  canEnter: boolean; // real mode: auth ok
}

const RESULT_META: Record<string, { label: string; cls: string }> = {
  pending: { label: "PENDENTE", cls: "border-warn/50 bg-warn/10 text-warn" },
  win: { label: "WIN", cls: "border-call/50 bg-call/10 text-call" },
  loss: { label: "LOSS", cls: "border-put/50 bg-put/10 text-put" },
  void: { label: "VOID", cls: "border-border text-muted-foreground" },
};

const STORAGE_KEY = "radar-ai-demo-paper";

/** Constrói a trade do modo demo (fora do componente p/ manter render puro). */
function buildDemoTrade(signal: DemoSignal, banca: number, riscoPct: number): PaperTradeUI {
  const stake = Number(((banca * riscoPct) / 100).toFixed(2));
  // demo: entra no preço ATUAL e expira a partir de AGORA (não do candle antigo do sinal)
  const tfDur = signal.timeframe === "15m" ? 900 : signal.timeframe === "1m" ? 60 : 300;
  const candlesNow = getDemoCandles(signal.symbol, (signal.timeframe as "5m") || "5m");
  const latest = candlesNow[candlesNow.length - 1];
  return {
    id: `pt-${Date.now()}`,
    symbol: signal.symbol,
    timeframe: signal.timeframe,
    direction: signal.direction as "CALL" | "PUT",
    stake,
    entryPrice: latest?.close ?? signal.entryPrice,
    expiresAt: Date.now() / 1000 + tfDur,
    result: "pending",
    pnl: 0,
    createdAt: Date.now() / 1000,
  };
}

export default function PaperBoard({ demo, initialBanca, riscoPct, signals, initialTrades, canEnter }: PaperBoardProps) {
  const [trades, setTrades] = useState<PaperTradeUI[]>(initialTrades);
  const [banca, setBanca] = useState(initialBanca);
  const [enteringId, setEnteringId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now() / 1000);

  // Modo real: o auto-refresh da página entrega props novas do servidor —
  // ajusta o estado durante o render (padrão React p/ "ajustar estado quando
  // uma prop muda"). Modo demo mantém o estado local como fonte da verdade.
  const [lastServer, setLastServer] = useState({ trades: initialTrades, banca: initialBanca });
  if (!demo && (lastServer.trades !== initialTrades || lastServer.banca !== initialBanca)) {
    setLastServer({ trades: initialTrades, banca: initialBanca });
    setTrades(initialTrades);
    setBanca(initialBanca);
  }

  // carrega estado demo persistido (uma única leitura de localStorage no mount)
  useEffect(() => {
    if (!demo) return;
    /* eslint-disable react-hooks/set-state-in-effect -- sync única de estado persistido (localStorage) no mount */
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { banca: number; trades: PaperTradeUI[] };
        if (Array.isArray(parsed.trades)) {
          setBanca(Number(parsed.banca ?? 500));
          setTrades(parsed.trades);
        }
      }
    } catch {
      /* ignore */
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [demo]);

  // persiste estado demo
  useEffect(() => {
    if (!demo) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ banca, trades }));
    } catch {
      /* ignore */
    }
  }, [demo, banca, trades]);

  // clock + resolução automática de trades demo vencidos (expiração)
  useEffect(() => {
    if (!demo) return;
    const tick = setInterval(() => {
      const t = Date.now() / 1000;
      setNow(t);
      const toResolve = trades.filter((tr) => tr.result === "pending" && tr.expiresAt <= t);
      if (!toResolve.length) return;
      // lê os candles de expiração fora do updater (leitura com cache = impura p/ render)
      const exitBySymbol = new Map<string, number | undefined>();
      for (const tr of toResolve) {
        if (exitBySymbol.has(tr.symbol)) continue;
        const candles = getDemoCandles(tr.symbol, (tr.timeframe as "5m") || "5m");
        exitBySymbol.set(tr.symbol, candles[candles.length - 1]?.close);
      }
      let bancaDelta = 0;
      setTrades((prev) =>
        prev.map((tr) => {
          if (tr.result !== "pending" || tr.expiresAt > t) return tr;
          const exit = exitBySymbol.get(tr.symbol);
          if (exit === undefined) {
            bancaDelta += tr.stake; // sem preço: devolve o stake
            return { ...tr, result: "void" as const, pnl: 0 };
          }
          const result = resolveResult(tr.direction, tr.entryPrice, exit);
          const pnl = resolvePnl(result, tr.stake);
          bancaDelta += tr.stake + pnl; // devolve stake + pnl
          return { ...tr, result, pnl };
        })
      );
      setBanca((b) => Number((b + bancaDelta).toFixed(2)));
    }, 2000);
    return () => clearInterval(tick);
  }, [demo, trades]);

  const enter = async (signal: DemoSignal) => {
    if (demo) {
      const stake = Number(((banca * riscoPct) / 100).toFixed(2));
      if (stake <= 0) {
        toast.error("Banca zerada — zere o modo demo");
        return;
      }
      const trade = buildDemoTrade(signal, banca, riscoPct);
      setTrades((prev) => [trade, ...prev]);
      setBanca((b) => Number((b - stake).toFixed(2)));
      toast.success(`Paper demo: ${signal.direction} ${signal.symbol} — stake R$ ${stake.toFixed(2)}`);
      return;
    }
    if (!canEnter) {
      toast.error("Faça login para operar paper");
      return;
    }
    setEnteringId(signal.id);
    try {
      const res = await fetch("/api/paper/enter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signalId: signal.id }),
      });
      const json = (await res.json()) as { error?: string; trade?: PaperTradeUI; banca?: number };
      if (!res.ok || json.error) {
        toast.error(json.error ?? "Falha ao entrar");
        return;
      }
      if (json.trade) setTrades((prev) => [json.trade!, ...prev]);
      if (json.banca !== undefined) setBanca(json.banca);
      toast.success(`Paper: ${json.trade?.direction} — stake R$ ${json.trade?.stake.toFixed(2)}`);
    } catch {
      toast.error("Erro de rede");
    } finally {
      setEnteringId(null);
    }
  };

  const open = trades.filter((t) => t.result === "pending");
  const closed = trades.filter((t) => t.result !== "pending");
  const pnlTotal = closed.reduce((a, t) => a + t.pnl, 0);

  return (
    <div className="space-y-5">
      {/* Banca */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="border-border bg-card">
          <CardContent className="flex items-center gap-3 pt-5">
            <div className="rounded-lg bg-primary/15 p-2 text-primary">
              <Wallet className="size-5" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Banca</div>
              <div className="text-2xl font-bold tabular-nums">R$ {banca.toFixed(2)}</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="flex items-center gap-3 pt-5">
            <div className="rounded-lg bg-warn/15 p-2 text-warn">
              <Clock className="size-5" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Posições abertas</div>
              <div className="text-2xl font-bold tabular-nums">{open.length}</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="flex items-center gap-3 pt-5">
            <div className={`rounded-lg p-2 ${pnlTotal >= 0 ? "bg-call/15 text-call" : "bg-put/15 text-put"}`}>
              <span className="text-lg font-bold">±</span>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">PnL realizado</div>
              <div className={`text-2xl font-bold tabular-nums ${pnlTotal >= 0 ? "text-call" : "text-put"}`}>
                R$ {pnlTotal >= 0 ? "+" : ""}
                {pnlTotal.toFixed(2)}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {demo && (
        <div className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
          Modo demo: risco {riscoPct}% por operação, payout 80% (configurável via env). Trades são resolvidos
          automaticamente na expiração usando candles sintéticos. Dados salvos localmente neste navegador.
        </div>
      )}

      {/* Posições abertas */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Posições abertas ({open.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Ativo</TableHead>
                <TableHead>Direção</TableHead>
                <TableHead className="text-right">Stake</TableHead>
                <TableHead className="text-right">Entrada</TableHead>
                <TableHead>Expira em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {open.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.symbol}</TableCell>
                  <TableCell>
                    <span className={t.direction === "CALL" ? "text-call" : "text-put"}>
                      {t.direction === "CALL" ? "▲ CALL" : "▼ PUT"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">R$ {t.stake.toFixed(2)}</TableCell>
                  <TableCell className="text-right tabular-nums">{t.entryPrice.toFixed(5)}</TableCell>
                  <TableCell>
                    <span className="tabular-nums text-muted-foreground">
                      {format(new Date(t.expiresAt * 1000), "HH:mm:ss")}
                    </span>
                    <span className="ml-2 text-warn tabular-nums">
                      {Math.max(0, t.expiresAt - now) < 3600
                        ? `${Math.max(0, Math.round(t.expiresAt - now))}s`
                        : ""}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
              {!open.length && (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                    Nenhuma posição aberta.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Entrar em sinal */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Entrar em sinal pendente</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {signals.filter((s) => s.result === "pending").slice(0, 6).map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs">
                <span className="font-medium">{s.symbol}</span>
                <span className={s.direction === "CALL" ? "text-call" : "text-put"}>
                  {s.direction}
                </span>
                <span className="tabular-nums">{s.score}</span>
                <Button size="xs" variant="outline" onClick={() => enter(s)} disabled={enteringId === s.id}>
                  {enteringId === s.id ? <Loader2 className="size-3 animate-spin" /> : "Entrar"}
                </Button>
              </div>
            ))}
            {!signals.filter((s) => s.result === "pending").length && (
              <div className="text-xs text-muted-foreground">Nenhum sinal pendente no momento.</div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Histórico */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Histórico ({closed.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Data/Hora</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead>Direção</TableHead>
                <TableHead className="text-right">Stake</TableHead>
                <TableHead className="text-right">PnL</TableHead>
                <TableHead>Resultado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {closed.slice(0, 20).map((t) => {
                const rm = RESULT_META[t.result];
                return (
                  <TableRow key={t.id}>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {format(new Date(t.createdAt * 1000), "dd/MM HH:mm")}
                    </TableCell>
                    <TableCell className="font-medium">{t.symbol}</TableCell>
                    <TableCell>
                      <span className={t.direction === "CALL" ? "text-call" : "text-put"}>
                        {t.direction === "CALL" ? "▲ CALL" : "▼ PUT"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">R$ {t.stake.toFixed(2)}</TableCell>
                    <TableCell className={`text-right font-semibold tabular-nums ${t.pnl >= 0 ? "text-call" : "text-put"}`}>
                      {t.pnl >= 0 ? "+" : ""}
                      {t.pnl.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge className={rm.cls}>{rm.label}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!closed.length && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                    Nenhuma operação resolvida ainda.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}