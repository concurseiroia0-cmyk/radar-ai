import ImportCsv from "@/components/backtest/ImportCsv";
import BacktestRunForm from "@/components/backtest/BacktestRunForm";
import { getSymbols } from "@/lib/data-access";
import { isSupabaseConfigured } from "@/lib/services/supabase-server";

export const dynamic = "force-dynamic";

export default async function BacktestPage() {
  const symbols = await getSymbols();
  const demo = !isSupabaseConfigured();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Backtest</h1>
          <p className="text-sm text-muted-foreground">
            Importe histórico (CSV) e valide o motor com estatísticas.
          </p>
        </div>
        {demo && (
          <span className="rounded-md border border-warn/50 bg-warn/10 px-2 py-0.5 text-xs text-warn">
            Demo — rodar usa dados sintéticos
          </span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ImportCsv />
        <BacktestRunForm symbols={symbols} demo={demo} />
      </div>

      <div className="rounded-lg border border-border bg-surface px-4 py-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Como funciona:</span> o CSV é parseado (Date,Time,Open,High,Low,Close
        ou Timestamp,Open,High,Low,Close ou DateTime,Open,High,Low,Close) e upserted em candles 1m. O backtest roda o
        <span className="text-info"> mesmo motor</span> do tempo real, em lotes de 5.000 candles, com resultado avaliado no
        fechamento do candle seguinte (t+1 — sem lookahead). Registra trades com score ≥ 50 para estatística completa das
        faixas 50–59 … 90–100 (isso não significa operar).
      </div>
    </div>
  );
}