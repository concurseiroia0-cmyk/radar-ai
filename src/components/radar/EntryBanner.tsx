"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { TrendingUp, TrendingDown, AlarmClock } from "lucide-react";
import type { DemoSignal } from "@/lib/demo-data";

interface EntryBannerProps {
  /** sinal pendente mais recente (ou null se não há) */
  signal: DemoSignal | null;
}

/** Janela de validade do sinal: o sinal vale para a vela de 5m seguinte (5 min). */
const ENTRY_WINDOW_SECONDS = 5 * 60;

function fmtCountdown(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

export default function EntryBanner({ signal }: EntryBannerProps) {
  const [now, setNow] = useState(() => Date.now() / 1000);

  // relógio ao vivo — atualiza o countdown a cada segundo
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(id);
  }, []);

  if (!signal) {
    return (
      <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        Sem sinal ativo no momento — aguarde o fechamento da vela de 5m. A página atualiza sozinha.
      </div>
    );
  }

  const deadline = signal.ts + ENTRY_WINDOW_SECONDS;
  const remaining = Math.max(0, deadline - now);
  const expired = remaining <= 0;
  const urgent = !expired && remaining <= 60;
  const isCall = signal.direction === "CALL";

  const boxCls = expired
    ? "border-put/50 bg-put/10"
    : urgent
      ? "border-warn/50 bg-warn/10"
      : "border-call/50 bg-call/10";
  const dirCls = isCall ? "text-call" : "text-put";

  return (
    <div className={`rounded-lg border px-4 py-3 ${boxCls}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-semibold">
          Na plataforma:{" "}
          <span className={`inline-flex items-center gap-1 font-bold ${dirCls}`}>
            {isCall ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
            {signal.direction}
          </span>{" "}
          • expiração <strong>5 min</strong> • {signal.symbol} (score {signal.score})
        </span>
      </div>
      {expired ? (
        <p className="mt-1 text-sm font-medium text-put">
          ⏰ Passou do horário deste sinal — <strong>NÃO opere mais nele</strong>. Espere o próximo (nova vela de 5m
          fecha e a página atualiza sozinha).
        </p>
      ) : (
        <p className={`mt-1 text-sm font-medium ${urgent ? "text-warn" : "text-foreground"}`}>
          <AlarmClock className="mr-1 inline size-4 align-[-2px]" />
          Entre <strong>antes das {format(new Date(deadline * 1000), "HH:mm:ss")}</strong> (seu horário) — faltam{" "}
          <strong className="tabular-nums">{fmtCountdown(remaining)}</strong>.
          {urgent && " Últimos segundos — decida rápido ou espere o próximo."}
        </p>
      )}
    </div>
  );
}