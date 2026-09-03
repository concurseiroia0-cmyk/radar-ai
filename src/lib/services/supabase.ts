import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase — helpers SEGUROS para cliente (browser) e flags de configuração.
 * Este arquivo NÃO importa next/headers (é usado por componentes client).
 * Helpers server-side ficam em ./supabase-server.
 */

/**
 * Schema PostgreSQL isolado do Radar AI.
 * O projeto Supabase é compartilhado com outro app — TODO objeto do Radar AI
 * vive neste schema (ver supabase/migrations/0001_init.sql), nunca em public.
 * Pré-requisito (1x, no Dashboard): Project Settings → API → Exposed schemas
 * → adicionar: radar_ai.
 */
export const SUPABASE_SCHEMA: string = "radar_ai";

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function supabaseEnv() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    serviceKey: process.env.SUPABASE_SERVICE_KEY ?? "",
  };
}

/** Cliente browser (realtime + auth). Singleton. */
let browserClient: SupabaseClient | null = null;
export function createBrowserSupabaseClient() {
  if (!isSupabaseConfigured()) return null;
  if (!browserClient) {
    const { url, anonKey } = supabaseEnv();
    // O schema radar_ai é definido em runtime; o tipo padrão (public) é
    // mantido para o resto do app — o PostgREST resolve o schema real.
    browserClient = createBrowserClient(url, anonKey, {
      db: { schema: SUPABASE_SCHEMA },
    }) as SupabaseClient;
  }
  return browserClient;
}