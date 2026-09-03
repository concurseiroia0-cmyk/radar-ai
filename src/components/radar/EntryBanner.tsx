"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { TrendingUp, TrendingDown, AlarmClock, Hourglass } from "lucide-react";
import type { DemoSignal } from "@/lib/demo-data";
import { TF_DURATION_SECONDS } from "@/lib/paper";

interface EntryBannerProps {
  /** sinal pendente mais recente (ou null se não há) */
  signal: DemoSignal | null;
  /** risco do usuário (valor por operação) — exibido junto do sinal */
  banca?: number;
  riscoPct?: number;
}

/** Janela de validade do sinal: vale para a vela seguinte (ex.: 5m → 5 min). */
function entryWindowSeconds(signal: DemoSignal): number {
  return TF_DURATION_SECONDS[signal.timeframe] ?? 5 * 60;
}

/** Expiração recomendada na plataforma, conforme a vela base do sinal. */
function recommendedExpiryLabel(timeframe: DemoSignal["timeframe"]): string {
  if (timeframe === "1m") return "1 minuto (1m)";
  if (timeframe === "15m") return "15 minutos (15m)";
  return "5 minutos (5m)";
}

function fmtCountdown(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

export default function EntryBanner({ signal, banca = 500, riscoPct = 1 }: EntryBannerProps) {
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

  const stake = Number(((banca * riscoPct) / 100).toFixed(2));
  const window = entryWindowSeconds(signal);
  const deadline = signal.ts + window;
  const remaining = Math.max(0, deadline - now);
  const expired = remaining <= 0;
  const urgent = !expired && remaining <= Math.min(60, window * 0.2);
  const isCall = signal.direction === "CALL";
  const pct = Math.max(0, Math.min(100, (remaining / window) * 100));

  const boxCls = expired
    ? "border-put/60 bg-put/10"
    : urgent
      ? "border-warn/60 bg-warn/10"
      : "border-call/40 bg-card";
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
          • {signal.symbol} • score <strong>{signal.score}</strong>
        </span>
        <span className="rounded-md bg-surface px-2 py-0.5 text-xs text-muted-foreground">
          💰 R$ {stake.toFixed(2)} por operação ({riscoPct}% da banca)
        </span>
        <span className="rounded-md bg-surface px-2 py-0.5 text-xs text-muted-foreground">
          ⏱️ expiração na plataforma: {recommendedExpiryLabel(signal.timeframe)}
          {signal.timeframe !== "1m" && " (ou 1m p/ agressivo)"}
        </span>
      </div>

      {expired ? (
        <p className="mt-2 text-sm font-medium text-put">
          ⏰ Este sinal <strong>expirou</strong> (era válido até {format(new Date(deadline * 1000), "HH:mm:ss")}) —{" "}
          <strong>NÃO opere mais nele</strong>. Espere o próximo (nova vela de 5m fecha e a página atualiza sozinha).
        </p>
      ) : (
        <div className="mt-2">
          <p className={`text-sm font-medium ${urgent ? "text-warn" : "text-foreground/90"}`}>
            <AlarmClock className="mr-1 inline size-4 align-[-2px]" />
            Tempo máximo p/ entrar: <strong className="tabular-nums">{fmtCountdown(remaining)}</strong> — entre antes
            das {format(new Date(deadline * 1000), "HH:mm:ss")} (seu horário).
            {urgent && (
              <span className="font-bold"> ⚠️ Últimos segundos — passou disso fica PERIGOSO, espere o próximo.</span>
            )}
          </p>
          {/* barrinha do tempo restante (some quando chega a 0) */}
          <div className="mt-1.5 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all duration-1000 ease-linear ${
                urgent ? "bg-warn" : isCall ? "bg-call" : "bg-put"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {signal.aiConsensusLabel !== "—" && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          <Hourglass className="mr-1 inline size-3.5 align-[-2px]" />
          Validado por IA — consenso {signal.aiConsensusLabel}
        </p>
      )}
    </div>
  );
}
