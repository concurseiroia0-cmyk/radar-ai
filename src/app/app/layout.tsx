import { redirect } from "next/navigation";
import Sidebar from "@/components/app/Sidebar";
import Topbar from "@/components/app/Topbar";
import { createServerSupabaseClient, isSupabaseConfigured } from "@/lib/services/supabase-server";
import { creditsEstimateToday } from "@/lib/schedule";
import { twelveDataDailyBudget } from "@/lib/services/marketData";
import { getProfile } from "@/lib/actions/profile";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const demo = !isSupabaseConfigured();
  let email: string | null = null;
  let quota: { date: string; used: number; remaining: number; budget?: number; source: string } | undefined;

  if (!demo) {
    const supabase = await createServerSupabaseClient();
    if (!supabase) redirect("/login");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    email = user.email ?? null;

    // cota Twelve Data (free: 800/dia): estima o consumo até agora com a mesma
    // fórmula do cron; ao atingir o teto o radar segue no fallback Finnhub.
    const profile = await getProfile();
    const counts = { forex: 0, stock: 0 };
    for (const s of profile?.ativos_ativos ?? []) {
      if (s.includes("/")) counts.forex++;
      else counts.stock++;
    }
    const budget = twelveDataDailyBudget();
    const used = Math.min(budget, creditsEstimateToday(new Date(), counts));
    quota = {
      date: new Date().toISOString().slice(0, 10),
      used,
      remaining: Math.max(0, budget - used),
      budget,
      source: used >= budget ? "finnhub" : "twelvedata",
    };
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar email={email} demo={demo} quota={quota} />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}