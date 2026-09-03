import SinaisClient from "@/components/radar/SinaisClient";
import { getSinaisPageData, getSymbols } from "@/lib/data-access";

export const dynamic = "force-dynamic";

export default async function SinaisPage() {
  const [data, symbols] = await Promise.all([getSinaisPageData(), getSymbols()]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">Sinais</h1>
        {data.demo && (
          <span className="rounded-md border border-warn/50 bg-warn/10 px-2 py-0.5 text-xs text-warn">
            Demo
          </span>
        )}
      </div>
      <SinaisClient signals={data.signals} symbols={symbols} demo={data.demo} />
    </div>
  );
}