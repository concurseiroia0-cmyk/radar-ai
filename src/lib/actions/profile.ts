"use server";

import { createServerSupabaseClient } from "@/lib/services/supabase-server";

export interface ProfileData {
  banca: number;
  risco_pct: number;
  telegram_chat_id: string;
  score_minimo: number;
  sessao_inicio: number;
  sessao_fim: number;
  ativos_ativos: string[];
  telegram_configured: boolean;
  apis: { twelvedata: boolean; finnhub: boolean; openrouter: boolean; nvidia: boolean; telegram: boolean };
}

export async function demoProfile(): Promise<ProfileData> {
  return {
    banca: 500,
    risco_pct: 1,
    telegram_chat_id: "",
    score_minimo: 75,
    sessao_inicio: 7,
    sessao_fim: 12,
    ativos_ativos: ["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "EUR/JPY", "GBP/JPY"],
    telegram_configured: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    apis: {
      twelvedata: Boolean(process.env.TWELVEDATA_KEY),
      finnhub: Boolean(process.env.FINNHUB_KEY),
      openrouter: Boolean(process.env.OPENROUTER_KEY),
      nvidia: Boolean(process.env.NVIDIA_KEY),
      telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    },
  };
}

export async function getProfile(): Promise<ProfileData | null> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return demoProfile();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // garante profile (trigger já cria, mas idempotente)
  await supabase.from("profiles").upsert({ id: user.id }, { onConflict: "id" }).select().maybeSingle();

  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!data) return demoProfile();

  return {
    banca: Number(data.banca ?? 500),
    risco_pct: Number(data.risco_pct ?? 1),
    telegram_chat_id: data.telegram_chat_id ?? "",
    score_minimo: Number(data.score_minimo ?? 75),
    sessao_inicio: Number(data.sessao_inicio ?? 7),
    sessao_fim: Number(data.sessao_fim ?? 12),
    ativos_ativos: Array.isArray(data.ativos_ativos) ? data.ativos_ativos : [],
    telegram_configured: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    apis: {
      twelvedata: Boolean(process.env.TWELVEDATA_KEY),
      finnhub: Boolean(process.env.FINNHUB_KEY),
      openrouter: Boolean(process.env.OPENROUTER_KEY),
      nvidia: Boolean(process.env.NVIDIA_KEY),
      telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    },
  };
}

export async function updateProfile(patch: Partial<ProfileData>): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    // demo: sem persistência real
    return { ok: true };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Não autenticado" };

  const row: Record<string, unknown> = {};
  if (patch.banca !== undefined) row.banca = patch.banca;
  if (patch.risco_pct !== undefined) row.risco_pct = patch.risco_pct;
  if (patch.telegram_chat_id !== undefined) row.telegram_chat_id = patch.telegram_chat_id;
  if (patch.score_minimo !== undefined) row.score_minimo = patch.score_minimo;
  if (patch.sessao_inicio !== undefined) row.sessao_inicio = patch.sessao_inicio;
  if (patch.sessao_fim !== undefined) row.sessao_fim = patch.sessao_fim;
  if (patch.ativos_ativos !== undefined) row.ativos_ativos = patch.ativos_ativos;

  const { error } = await supabase
    .from("profiles")
    .update({ ...row, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  return error ? { ok: false, error: error.message } : { ok: true };
}