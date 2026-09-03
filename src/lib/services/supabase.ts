import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase — helpers SEGUROS para cliente (browser) e flags de configuração.
 * Este arquivo NÃO importa next/headers (é usado por componentes client).
 * Helpers server-side ficam em ./supabase-server.
 */

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
    browserClient = createBrowserClient(url, anonKey);
  }
  return browserClient;
}