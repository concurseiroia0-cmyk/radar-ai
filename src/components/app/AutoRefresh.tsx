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
 */
export default function AutoRefresh({ intervalMs = 30000 }: AutoRefreshProps) {
  const router = useRouter();
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const refresh = () => {
      if (!mounted.current) return;
      router.refresh();
      setUpdatedAt(new Date());
    };
    const id = setInterval(refresh, intervalMs);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, [router, intervalMs]);

  const secs = Math.round(intervalMs / 1000);

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Esta página se atualiza sozinha">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-call/50" />
        <span className="relative inline-flex size-2 rounded-full bg-call" />
      </span>
      <span>ao vivo — atualiza a cada {secs}s</span>
      {updatedAt && (
        <span className="tabular-nums">
          • {updatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>
      )}
    </div>
  );
}