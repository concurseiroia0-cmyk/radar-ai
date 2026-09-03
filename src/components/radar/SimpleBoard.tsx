"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Clock, TrendingDown, TrendingUp, Minus, Wallet, CandlestickChart as CandleIcon } from "lucide-react";
import type { DemoAssetSnapshot } from "@/lib/demo-data";
import { fmt } from "@/lib/engine";
import { plainVerdict, type SessionInfo } from "@/lib/plain-lang";
import { Card, CardContent } from "@/components/ui/card";
import EntryBanner from "./EntryBanner";
import type { DemoSignal } from "@/lib/demo-data";
import { format } from "date-fns";

interface SimpleBoardProps {
  snapshots: DemoAssetSnapshot[];
  /** sinais reais/demo recentes (instrução de entrada com prazo) */
  signals: DemoSignal[];
  /** perfil do usuário */
  banca: number;
  riscoPct: number;
  /** janela de sessão (quando os sinais estão ativos) */
  sessao: SessionInfo;
}

const ENTRY_WINDOW_SECONDS = 5 * 60;

const KIND_META = {
  call: { badge: "border-call/60 bg-call/15 text-call", icon: <TrendingUp className="size-4" />, bar: "#22c55e" },
  put: { badge: "border-put/60 bg-put/15 text-put", icon: <TrendingDown className="size-4" />, bar: "#ef4444" },
  wait: { badge: "border-warn/50 bg-warn/10 text-warn", icon: <Minus className="size-4" />, bar: "#f59e0b" },
} as const;

export default function SimpleBoard({ snapshots, signals, banca, riscoPct, sessao }: SimpleBoardProps) {
  const stake = Number(((banca * riscoPct) / 100).toFixed(2));

  // relógio ao vivo — p/ prazo dos sinais (evita Date.now() no render)
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(id);
  }, []);

  // sinal pendente mais recente — instrução "entre agora"
  const activeSignal = signals.find((s) => s.result === "pending") ?? null;

  return (
    <div className="space-y-4">
      {/* Instrução de entrada com prazo (CALL/PUT + 5 min + countdown) */}
      <EntryBanner signal={activeSignal} />
      {/* Como operar — resumo em linguagem simples */}
      <Card className="border-border bg-card">
        <CardContent className="grid gap-3 pt-5 sm:grid-cols-2 xl:grid-cols-4">
          {/* Horário */}
          <div className="flex items-start gap-2.5">
            <span
              className={`mt-0.5 inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold ${
                sessao.active ? "bg-call/15 text-call" : "bg-warn/15 text-warn"
              }`}
            >
              <span className={`relative flex size-1.5 ${sessao.active ? "" : ""}`}>
                <span
                  className={`absolute inline-flex size-full rounded-full ${sessao.active ? "animate-ping bg-call/60" : ""}`}
                />
                <span className={`relative inline-flex size-1.5 rounded-full ${sessao.active ? "bg-call" : "bg-warn"}`} />
              </span>
              {sessao.active ? "SESSÃO ATIVA" : "FORA DA SESSÃO"}
            </span>
            <div className="text-sm leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">Horário de operar:</span> {sessao.windowUtc} (
              {sessao.windowBrt}) — sinais só são gerados nessa janela.
              {!sessao.active && sessao.nextStartBrt && (
                <span className="text-warn"> Próxima sessão às {sessao.nextStartBrt} (Brasília).</span>
              )}
            </div>
          </div>

          {/* Vela */}
          <div className="flex items-start gap-2.5">
            <CandleIcon className="mt-0.5 size-4 shrink-0 text-info" />
            <div className="text-sm leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">Vela base: 5 min.</span> O Radar calcula o sinal no
              fechamento da vela de 5m — entre logo depois. 1m = mais rápido/arriscado; 15m = tendência de fundo.
            </div>
          </div>

          {/* Valor */}
          <div className="flex items-start gap-2.5">
            <Wallet className="mt-0.5 size-4 shrink-0 text-info" />
            <div className="text-sm leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">Valor por operação: R$ {stake.toFixed(2)}</span> ={" "}
              {riscoPct}% da sua banca de R$ {banca.toFixed(2)}. Ajuste o risco na página Config.
            </div>
          </div>

          {/* Expiração */}
          <div className="flex items-start gap-2.5">
            <Clock className="mt-0.5 size-4 shrink-0 text-info" />
            <div className="text-sm leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">Expiração:</span> o sinal vale para a vela seguinte —
              escolha ~5 min na plataforma (10 ou 15 min se não tiver 5). Sinal forte (≥75) é mais confiável.
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cartões por ativo */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {snapshots.map((s) => {
          const v = plainVerdict(s.engine, s.pack, s.asset.symbol);
          const meta = KIND_META[v.kind];
          const assetSignal = signals.find((sig) => sig.symbol === s.asset.symbol && sig.result === "pending");
          const deadline = assetSignal ? assetSignal.ts + ENTRY_WINDOW_SECONDS : null;
          return (
            <Link key={s.asset.symbol} href={`/app/ativo/${encodeURIComponent(s.asset.symbol)}`} className="group">
              <Card className="h-full border-border bg-card transition-colors group-hover:border-info/60">
                <CardContent className="space-y-3 pt-5">
                  {/* Cabeçalho: ativo + preço */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 font-semibold">
                        {s.asset.symbol}
                        <ArrowUpRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                        {fmt(s.price, s.price < 10 ? 5 : 3)}
                        <span className={s.changePct >= 0 ? "ml-1.5 text-call" : "ml-1.5 text-put"}>
                          {s.changePct >= 0 ? "+" : ""}
                          {s.changePct.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                    {/* Selo da recomendação */}
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-bold ${meta.badge}`}
                    >
                      {meta.icon}
                      {v.headline}
                    </span>
                  </div>

                  {/* Força */}
                  <div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${Math.max(2, Math.min(100, v.score))}%`, background: meta.bar }}
                      />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {v.strong ? "Força boa" : v.kind === "wait" ? "Sem sinal" : "Sinal fraco"}
                      </span>
                      <span className="font-semibold tabular-nums">{v.score}/100</span>
                    </div>
                  </div>

                  {/* Resumo em linguagem simples */}
                  <p className="text-sm leading-relaxed text-muted-foreground">{v.summary}</p>

                  {/* Prazo do sinal deste ativo */}
                  {assetSignal && deadline && (
                    <p
                      className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${
                        now > deadline ? "bg-put/10 text-put" : "bg-call/10 text-call"
                      }`}
                    >
                      {now > deadline
                        ? `⏰ ${s.asset.symbol}: passou do horário — espere o próximo sinal`
                        : `▶ ${s.asset.symbol}: ${assetSignal.direction} até ${format(new Date(deadline * 1000), "HH:mm:ss")} (seu horário)`}
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Análise técnica automática — não é garantia de lucro. Pratique primeiro no{" "}
        <Link href="/app/paper" className="text-info hover:underline">
          Paper Trading
        </Link>
        .
      </p>
    </div>
  );
}