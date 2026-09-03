/**
 * One-shot (após deploy): insere os 7 ativos novos (4 forex + 3 ações) na
 * tabela radar_ai.assets e atualiza o ativos_ativos do perfil do usuário.
 *
 * Uso: npx tsx scripts/apply-extra-assets.ts
 * Requer .env.local com NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_KEY.
 * Idempotente: ignora símbolos já existentes e preserva a lista atual do perfil.
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
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    out[k] = v;
  }
  return out;
}

const NEW_ASSETS: { symbol: string; type: "forex" | "stock" }[] = [
  { symbol: "EUR/GBP", type: "forex" },
  { symbol: "USD/CHF", type: "forex" },
  { symbol: "AUD/JPY", type: "forex" },
  { symbol: "USD/CAD", type: "forex" },
  { symbol: "AAPL", type: "stock" },
  { symbol: "TSLA", type: "stock" },
  { symbol: "NVDA", type: "stock" },
];

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

  // 1) ativos existentes
  const res = await fetch(`${base}/rest/v1/assets?select=symbol,type`, { headers });
  if (!res.ok) {
    console.error(`✘ lendo assets: HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`);
    process.exit(1);
  }
  const existing = (await res.json()) as { symbol: string; type: string }[];
  const have = new Set(existing.map((a) => a.symbol));
  const missing = NEW_ASSETS.filter((a) => !have.has(a.symbol));
  console.log(`Ativos no banco: ${existing.length}. Faltam: ${missing.length}`);

  for (const a of missing) {
    const ins = await fetch(`${base}/rest/v1/assets`, {
      method: "POST",
      headers,
      body: JSON.stringify({ symbol: a.symbol, active: true, type: a.type }),
    });
    if (!ins.ok) {
      console.error(`✘ inserindo ${a.symbol}: HTTP ${ins.status} — ${(await ins.text()).slice(0, 200)}`);
    } else {
      console.log(`  ✓ inserido ${a.symbol} (${a.type})`);
    }
  }

  // 2) perfil — mescla a lista atual com os novos (mantém símbolos custom)
  const profRes = await fetch(`${base}/rest/v1/profiles?select=id,ativos_ativos&limit=1`, { headers });
  if (profRes.ok) {
    const rows = (await profRes.json()) as { id: string; ativos_ativos?: string[] }[];
    const prof = rows[0];
    if (prof) {
      const current: string[] = Array.isArray(prof.ativos_ativos) ? prof.ativos_ativos : [];
      const merged = [...current];
      for (const a of NEW_ASSETS) if (!merged.includes(a.symbol)) merged.push(a.symbol);
      if (JSON.stringify(merged) !== JSON.stringify(current)) {
        const patch = await fetch(
          `${base}/rest/v1/profiles?id=eq.${prof.id}`,
          { method: "PATCH", headers, body: JSON.stringify({ ativos_ativos: merged }) }
        );
        if (patch.ok) console.log(`✓ perfil atualizado: ${merged.length} ativos`);
        else console.error(`✘ atualizando perfil: HTTP ${patch.status} — ${(await patch.text()).slice(0, 200)}`);
      } else {
        console.log(`Perfil já tem os ${merged.length} ativos (nada a fazer).`);
      }
    } else {
      console.log("Nenhum perfil encontrado — nada a mesclar.");
    }
  } else {
    console.error(`✘ lendo perfil: HTTP ${profRes.status}`);
  }
}

main().catch((e) => {
  console.error("Erro:", e);
  process.exit(1);
});
