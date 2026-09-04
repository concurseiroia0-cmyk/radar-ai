/**
 * One-shot (após deploy): aplica a troca XAU/USD → NZD/USD no banco real.
 *  - desativa XAU/USD (mantém candles históricos)
 *  - insere/ativa NZD/USD (forex)
 *  - remove XAU/USD e garante NZD/USD no ativos_ativos de TODOS os perfis
 *
 * Uso: npx tsx scripts/apply-asset-swap.ts
 * Requer .env.local com NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_KEY.
 * Idempotente.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function loadEnv(): Record<string, string> {
  const file = join(process.cwd(), ".env.local");
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

async function main() {
  const env = loadEnv();
  const base = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY;
  if (!base || !key) {
    console.error("✘ .env.local sem NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_KEY");
    process.exit(1);
  }
  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Accept-Profile": "radar_ai",
    "Content-Profile": "radar_ai",
    "Content-Type": "application/json",
  };

  // 1) desativa XAU/USD
  const off = await fetch(`${base}/rest/v1/assets?symbol=eq.XAU%2FUSD`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ active: false }),
  });
  if (!off.ok) console.error(`✘ desativando XAU/USD: HTTP ${off.status} — ${(await off.text()).slice(0, 160)}`);
  else console.log("✓ XAU/USD desativado");

  // 2) garante NZD/USD ativo
  const list = await fetch(`${base}/rest/v1/assets?select=symbol,active&symbol=eq.NZD%2FUSD`, { headers });
  const rows = (await list.json()) as { symbol: string; active: boolean }[];
  if (!rows.length) {
    const ins = await fetch(`${base}/rest/v1/assets`, {
      method: "POST",
      headers,
      body: JSON.stringify({ symbol: "NZD/USD", active: true, type: "forex" }),
    });
    if (!ins.ok) console.error(`✘ inserindo NZD/USD: HTTP ${ins.status} — ${(await ins.text()).slice(0, 160)}`);
    else console.log("✓ NZD/USD inserido (forex, ativo)");
  } else if (!rows[0].active) {
    const act = await fetch(`${base}/rest/v1/assets?symbol=eq.NZD%2FUSD`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ active: true }),
    });
    if (!act.ok) console.error(`✘ ativando NZD/USD: HTTP ${act.status}`);
    else console.log("✓ NZD/USD ativado");
  } else {
    console.log("NZD/USD já existe e está ativo.");
  }

  // 3) perfis — remove XAU/USD, garante NZD/USD
  const profRes = await fetch(`${base}/rest/v1/profiles?select=id,ativos_ativos`, { headers });
  if (!profRes.ok) {
    console.error(`✘ lendo perfis: HTTP ${profRes.status}`);
    return;
  }
  const profs = (await profRes.json()) as { id: string; ativos_ativos?: string[] }[];
  let changed = 0;
  for (const p of profs) {
    const cur: string[] = Array.isArray(p.ativos_ativos) ? p.ativos_ativos : [];
    const next = cur.filter((s) => s !== "XAU/USD");
    if (!next.includes("NZD/USD")) next.push("NZD/USD");
    if (JSON.stringify(next) !== JSON.stringify(cur)) {
      const patch = await fetch(`${base}/rest/v1/profiles?id=eq.${p.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ ativos_ativos: next }),
      });
      if (!patch.ok) console.error(`✘ perfil ${p.id}: HTTP ${patch.status}`);
      else changed++;
    }
  }
  console.log(`✓ perfis atualizados: ${changed} (de ${profs.length})`);
}

main().catch((e) => {
  console.error("Erro:", e);
  process.exit(1);
});
