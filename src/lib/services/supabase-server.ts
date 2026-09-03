import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { isSupabaseConfigured, supabaseEnv } from "./supabase";

/**
 * Supabase SERVER-ONLY (nunca importar de componente client).
 * SSR com cookies + Service Role para escrita (candles/signals/backtests).
 */

export { isSupabaseConfigured, supabaseEnv };

/** Cliente server-side com cookies (SSR) — auth do usuário logado. */
export async function createServerSupabaseClient() {
  if (!isSupabaseConfigured()) return null;
  const { url, anonKey } = supabaseEnv();
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // chamado a partir de Server Component — seguro ignorar
        }
      },
    },
  });
}

/** Cliente com Service Role — ESCREVE em candles/signals/backtests (server-only). */
export async function createServiceSupabaseClient(): Promise<SupabaseClient | null> {
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_KEY) return null;
  const { url, serviceKey } = supabaseEnv();
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}