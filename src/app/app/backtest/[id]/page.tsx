import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import ResultsView from "@/components/backtest/ResultsView";
import { getBacktestResult } from "@/lib/data-access";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function BacktestResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getBacktestResult(id);
  if (!data) notFound();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" render={<Link href="/app/backtest" />}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              Resultado — {data.symbol} • {data.timeframe}
            </h1>
            <p className="text-sm text-muted-foreground">
              {data.demo ? "Backtest de demonstração (dados sintéticos)" : "Backtest real"}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" render={<Link href="/app/backtest" />}>
          Novo backtest
        </Button>
      </div>

      <ResultsView result={data.result} symbol={data.symbol} timeframe={data.timeframe} demo={data.demo} />
    </div>
  );
}