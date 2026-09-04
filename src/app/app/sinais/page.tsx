import SinaisClient from "@/components/radar/SinaisClient";
import MemoryCard from "@/components/radar/MemoryCard";
import AutoRefresh from "@/components/app/AutoRefresh";
import { getSinaisPageData, getSymbols } from "@/lib/data-access";
import { createServiceSupabaseClient } from "@/lib/services/supabase-server";
import { fetchMemorySummary, summarizeDemoSignals } from "@/lib/signalMemory";

export const dynamic = "force-dynamic";

export default async function SinaisPage() {
  const [data, symbols] = await Promise.all([getSinaisPageData(), getSymbols()]);

  // memória de estratégias: demo resume os sinais sintéticos; real consulta o
  // histórico resolvido no banco (sempre tolerante a falhas de leitura).
  let memoryRows = data.demo
    ? summarizeDemoSignals(data.signals)
    : [];
  if (!data.demo) {
    try {
      const supabase = await createServiceSupabaseClient();
      if (supabase) {
        const mem = await fetchMemorySummary(supabase);
        memoryRows = mem.rows;
      }
    } catch {
      memoryRows = [];
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold tracking-tight">Sinais</h1>
        <AutoRefresh intervalMs={20000} />
        {data.demo && (
          <span className="rounded-md border border-warn/50 bg-warn/10 px-2 py-0.5 text-xs text-warn">
            Demo
          </span>
        )}
      </div>
      <MemoryCard rows={memoryRows} demo={data.demo} />
      <SinaisClient signals={data.signals} symbols={symbols} demo={data.demo} />
    </div>
  );
}
