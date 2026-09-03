import RadarDashboard from "@/components/radar/RadarDashboard";
import { getRadarData } from "@/lib/data-access";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await getRadarData();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">Dashboard / Radar</h1>
        {data.demo && (
          <span className="rounded-md border border-warn/50 bg-warn/10 px-2 py-0.5 text-xs text-warn">
            Dados sintéticos de demonstração — motor real
          </span>
        )}
      </div>
      <RadarDashboard initialSnapshots={data.snapshots} initialSignals={data.signals} demo={data.demo} />
    </div>
  );
}