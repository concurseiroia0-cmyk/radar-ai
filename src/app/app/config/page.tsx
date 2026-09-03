import ConfigClient from "@/components/config/ConfigClient";
import { getProfile } from "@/lib/actions/profile";
import { isSupabaseConfigured } from "@/lib/services/supabase-server";
import { ACTIVE_SYMBOLS } from "@/lib/assets";

export const dynamic = "force-dynamic";

export default async function ConfigPage() {
  const demo = !isSupabaseConfigured();
  const profile = (await getProfile()) ?? {
    banca: 500,
    risco_pct: 1,
    telegram_chat_id: "",
    score_minimo: 75,
    sessao_inicio: 7,
    sessao_fim: 12,
    ativos_ativos: [...ACTIVE_SYMBOLS],
    telegram_configured: false,
    apis: {
      twelvedata: false,
      finnhub: false,
      openrouter: false,
      nvidia: false,
      telegram: false,
    },
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Configurações</h1>
          <p className="text-sm text-muted-foreground">
            {demo
              ? "Modo demonstração — as mudanças ficam salvas apenas neste navegador."
              : "Salvo no seu perfil (Supabase)."}
          </p>
        </div>
      </div>
      <ConfigClient initial={profile} demo={demo} />
    </div>
  );
}