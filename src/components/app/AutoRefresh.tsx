"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CandlestickChart } from "lucide-react";

interface AutoRefreshProps {
  /** intervalo entre atualizações (ms) */
  intervalMs?: number;
  /**
   * Duração do timeframe da vela em segundos (60, 300, 900…).
   * Quando definido, mostra ao lado do auto-refresh o countdown até o
   * FECHAMENTO da próxima vela — é quando o candle novo aparece e o
   * Radar recalcula o sinal.
   */
  candleSeconds?: number;
  /** Rótulo do timeframe exibido (ex.: "5m"). */
  candleLabel?: string;
}

/** Tempo (s) até o próximo fechamento de vela alinhado ao timeframe. */
function nextCandleCloseIn(nowSec: number, periodSeconds: number): number {
  const next = (Math.floor(nowSec / periodSeconds) + 1) * periodSeconds;
  return Math.max(0, Math.ceil(next - nowSec));
}

function fmtCandleLeft(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  return `${m}m ${String(Math.floor(secs % 60)).padStart(2, "0")}s`;
}

/**
 * Atualização automática das páginas (dashboard, sinais, paper, ativo).
 * Chama router.refresh() a cada `intervalMs` — re-executa os server
 * components da rota e entrega props novas aos componentes client,
 * sem recarregar a página nem perder estado de navegação.
 * Mostra um countdown ao vivo da próxima atualização.
 */
export default function AutoRefresh({
  intervalMs = 30000,
  candleSeconds,
  candleLabel,
}: AutoRefreshProps) {
  const router = useRouter();
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [remaining, setRemaining] = useState(intervalMs / 1000);
  const [nowSec, setNowSec] = useState(() => Date.now() / 1000);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const refresh = () => {
      if (!mounted.current) return;
      router.refresh();
      setUpdatedAt(new Date());
      setRemaining(intervalMs / 1000);
    };
    const id = setInterval(refresh, intervalMs);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, [router, intervalMs]);

  // relógio ao vivo do countdown (refresh + próxima vela)
  useEffect(() => {
    const id = setInterval(() => {
      setNowSec(Date.now() / 1000);
      setRemaining((r) => (r <= 1 ? 0 : r - 1));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const secs = Math.round(intervalMs / 1000);
  const left = Math.max(0, Math.round(remaining));
  const candleLeft = candleSeconds ? nextCandleCloseIn(nowSec, candleSeconds) : null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground" title="Esta página se atualiza sozinha">
      <span className="inline-flex items-center gap-1.5">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-call/50" />
          <span className="relative inline-flex size-2 rounded-full bg-call" />
        </span>
        <span className="tabular-nums">
          atualiza em {left}s
        </span>
        {updatedAt && (
          <span className="tabular-nums">
            • {updatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
        )}
        {secs > 5 && <span className="hidden sm:inline">(a cada {secs}s)</span>}
      </span>

      {candleSeconds && candleLeft !== null && (
        <span
          className="inline-flex items-center gap-1.5"
          title={
            candleSeconds >= 60
              ? `Tempo até fechar a próxima vela de ${candleSeconds / 60}m — aí o Radar recalcula o sinal`
              : "Tempo até fechar a próxima vela — aí o Radar recalcula o sinal"
          }
        >
          <CandlestickChart className="size-3.5 text-info" />
          <span className="tabular-nums">
            vela {candleLabel ?? ""} em <strong className="font-semibold text-foreground/80">{fmtCandleLeft(candleLeft)}</strong>
          </span>
        </span>
      )}
    </div>
  );
}
