/**
 * Smoke test — valida o setup Supabase do Radar AI contra o projeto REAL.
 *
 * Roda em Node:  npx tsx scripts/supabase-smoke.ts
 * Lê as credenciais de .env.local (raiz do projeto).
 *
 * Verifica:
 *  1. Auth health (projeto alcançável)
 *  2. Service key lê radar_ai.assets (espera os 6 ativos do seed)
 *  3. Anon NÃO lê assets (RLS escondendo de anônimos)
 *  4. Anon NÃO consegue chamar rpc adjust_banca (segurança)
 *  5. Cria usuário temporário → trigger cria profile automaticamente
 *  6. Login do usuário → leitura autenticada de assets (RLS ok)
 *  7. Realtime: INSERT em radar_ai.signals chega ao cliente autenticado
 *  8. Cleanup: deleta o usuário temporário (cascade remove o profile)
 *
 * IMPORTANTE: só mexe com um usuário temporário em auth.users (criado e
 * apagado no final). Nada do schema "public" (outro app) é tocado.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SCHEMA = "radar_ai";

function loadEnv(): Record<string, string> {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  const env: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const env = loadEnv();
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_KEY;

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "✅ PASS" : "❌ FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
}

function serviceClient() {
  return createClient(URL, SERVICE, {
    db: { schema: SCHEMA },
    auth: { persistSession: false },
  });
}

type RadarClient = ReturnType<typeof serviceClient>;

async function rest<T = unknown>(
  path: string,
  key: string,
  init: RequestInit = {}
): Promise<{ status: number; body: T }> {
  const res = await fetch(`${URL}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: T;
  try {
    body = JSON.parse(text) as T;
  } catch {
    body = text as unknown as T;
  }
  return { status: res.status, body };
}

const EMAIL = `radar-smoke-${Date.now()}@test.local`;
const PASSWORD = "Smoke-Test-123!";

async function main() {
  console.log("=== SMOKE TEST — Radar AI ↔ Supabase (schema radar_ai) ===\n");
  if (!URL || !ANON || !SERVICE) {
    console.error("❌ .env.local incompleto (URL/ANON/SERVICE). Abortando.");
    process.exit(1);
  }

  // 1. Auth health
  {
    const { status } = await rest("/auth/v1/health", ANON);
    check("1. Auth health (projeto alcançável)", status === 200, `HTTP ${status}`);
  }

  // 2. Service key lê os 6 ativos
  {
    const sb = serviceClient();
    const { data, error } = await sb.from("assets").select("symbol").eq("active", true).order("symbol");
    const symbols = (data ?? []).map((r: { symbol: string }) => r.symbol).join(", ");
    check("2. Service key lê radar_ai.assets (seed)", !error && Array.isArray(data) && data.length === 6, symbols || error?.message);
  }

  // 3. Anon não vê nada (RLS)
  {
    const anon = createClient(URL, ANON, { db: { schema: SCHEMA }, auth: { persistSession: false } });
    const { data, error } = await anon.from("assets").select("symbol");
    check("3. Anon NÃO lê assets (RLS ativa)", !error && Array.isArray(data) && data.length === 0, `rows=${Array.isArray(data) ? data.length : "?"}`);
  }

  // 4. Anon não chama adjust_banca
  {
    const { status } = await rest(
      "/rest/v1/rpc/adjust_banca",
      ANON,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept-Profile": SCHEMA },
        body: JSON.stringify({ p_user_id: "00000000-0000-0000-0000-000000000000", p_pnl: 100 }),
      }
    );
    check("4. Anon NÃO executa adjust_banca", status === 404, `HTTP ${status} (esperado 404)`);
  }

  // 5–8: usuário temporário
  let userId: string | null = null;
  let accessToken = "";
  try {
    // 5. Cria usuário (admin) → trigger deve criar o profile
    const created = await rest<{ id?: string; error?: string }>(
      "/auth/v1/admin/users",
      SERVICE,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true }),
      }
    );
    userId = created.body?.id ?? null;
    if (!userId) throw new Error(created.body?.error ?? `HTTP ${created.status}`);
    console.log(`      usuário temporário: ${EMAIL} (${userId})`);

    const sb = serviceClient();
    const profile = await sb.from("profiles").select("id, banca").eq("id", userId).maybeSingle();
    const hasProfile = !profile.error && profile.data !== null;
    check("5. Trigger criou profile no 1º login", hasProfile, hasProfile ? `banca=${(profile.data as { banca?: unknown })?.banca ?? "?"}` : profile.error?.message);

    // 6. Login (password grant) → leitura autenticada
    const anonClient = createClient(URL, ANON, {
      db: { schema: SCHEMA },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const signIn = await anonClient.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    accessToken = signIn.data?.session?.access_token ?? "";
    if (!accessToken) throw new Error("login falhou: " + (signIn.error?.message ?? ""));

    const authRes = await rest<unknown[]>(
      "/rest/v1/assets?select=symbol&active=eq.true",
      ANON,
      { headers: { Authorization: `Bearer ${accessToken}`, "Accept-Profile": SCHEMA } }
    );
    check("6. Usuário autenticado lê assets (RLS ok)", authRes.status === 200 && Array.isArray(authRes.body) && authRes.body.length === 6, `HTTP ${authRes.status}, ${Array.isArray(authRes.body) ? authRes.body.length : 0} ativos`);

    // 7. Realtime: INSERT em signals chega ao cliente autenticado
    const rtOk = await realtimeRoundTrip(serviceClient(), anonClient);
    check("7. Realtime entrega INSERT em radar_ai.signals", rtOk);
  } catch (e) {
    check("5–7. Fluxo do usuário temporário", false, String((e as Error).message));
  } finally {
    // 8. Cleanup
    if (userId) {
      const del = await rest(`/auth/v1/admin/users/${userId}`, SERVICE, { method: "DELETE" });
      const gone = await serviceClient().from("profiles").select("id").eq("id", userId).maybeSingle();
      check("8. Cleanup: usuário removido (profile em cascata)", del.status === 200 && !gone.data, `HTTP ${del.status}`);
    }
  }

  console.log(`\n${failures === 0 ? "🎉 TUDO PASSOU" : `⚠️ ${failures} verificação(ões) falharam`}`);
  process.exit(failures === 0 ? 0 : 1);
}

/** Insere um sinal de teste via service key e espera o evento no cliente autenticado. */
async function realtimeRoundTrip(service: RadarClient, client: RadarClient): Promise<boolean> {
  const asset = await service.from("assets").select("id").limit(1).maybeSingle();
  if (!asset.data) return false;

  const insertId = await new Promise<string | null>((resolveP) => {
    const timer = setTimeout(() => resolveP(null), 15000);
    const channel = client
      .channel("smoke-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: SCHEMA, table: "signals" },
        (payload) => {
          clearTimeout(timer);
          resolveP(String((payload.new as { id?: unknown })?.id ?? ""));
        }
      )
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          const { error } = await service.from("signals").insert({
            asset_id: (asset.data as { id: string }).id,
            timeframe: "5m",
            direction: "CALL",
            score: 80,
            entry_price: 1.0,
            ai_consensus: {},
          });
          if (error) {
            clearTimeout(timer);
            resolveP("__insert_error__");
          }
        }
      });
    // garante remoção do canal ao finalizar
    setTimeout(() => client.removeChannel(channel), 20000).unref();
  });

  if (insertId === "__insert_error__") return false;
  const ok = !!insertId;
  if (insertId && insertId !== "__insert_error__") {
    await service.from("signals").delete().eq("id", insertId);
    console.log(`      sinal de teste ${insertId} inserido e removido`);
  }
  return ok;
}

void main();
