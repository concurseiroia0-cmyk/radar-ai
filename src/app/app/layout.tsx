import { redirect } from "next/navigation";
import Sidebar from "@/components/app/Sidebar";
import Topbar from "@/components/app/Topbar";
import { createServerSupabaseClient, isSupabaseConfigured } from "@/lib/services/supabase-server";
import { getProfile } from "@/lib/actions/profile";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const demo = !isSupabaseConfigured();
  let email: string | null = null;
  let quota: { date: string; used: number; remaining: number; source: string } | undefined;

  if (!demo) {
    const supabase = await createServerSupabaseClient();
    if (!supabase) redirect("/login");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    email = user.email ?? null;

    // quota conceitual (Twelve Data free: 800/dia) — usa a janela e os ativos do perfil
    const profile = await getProfile();
    const sessaoInicio = profile?.sessao_inicio ?? 7;
    const sessaoFim = profile?.sessao_fim ?? 12;
    const nAssets = Math.max(1, profile?.ativos_ativos?.length ?? 6);
    const now = new Date();
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);
    const hours = now.getUTCHours();
    const inSession =
      sessaoFim > sessaoInicio ? hours >= sessaoInicio && hours < sessaoFim : hours >= sessaoInicio || hours < sessaoFim;
    // cron a cada 5 min (7 ativos × 12 runs/h ≈ 84 chamadas/h)
    const runs = Math.floor((now.getTime() - start.getTime()) / (5 * 60 * 1000));
    const used = inSession ? Math.min(800, runs * nAssets) : Math.min(800, runs);
    quota = {
      date: now.toISOString().slice(0, 10),
      used,
      remaining: Math.max(0, 800 - used),
      source: "twelvedata",
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