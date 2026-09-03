"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface AutoRefreshProps {
  /** intervalo entre atualizações (ms) */
  intervalMs?: number;
}

/**
 * Atualização automática das páginas (dashboard, sinais, paper, ativo).
 * Chama router.refresh() a cada `intervalMs` — re-executa os server
 * components da rota e entrega props novas aos componentes client,
 * sem recarregar a página nem perder estado de navegação.
 * Mostra um countdown ao vivo da próxima atualização.
 */
export default function AutoRefresh({ intervalMs = 30000 }: AutoRefreshProps) {
  const router = useRouter();
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [remaining, setRemaining] = useState(intervalMs / 1000);
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

  // relógio ao vivo do countdown
  useEffect(() => {
    const id = setInterval(() => {
      setRemaining((r) => (r <= 1 ? 0 : r - 1));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const secs = Math.round(intervalMs / 1000);
  const left = Math.max(0, Math.round(remaining));

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Esta página se atualiza sozinha">
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
    </div>
  );
}