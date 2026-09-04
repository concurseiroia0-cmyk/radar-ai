/* One-shot — remove candles gravados com ts no FUTURO (bug do timezone da
 * Twelve Data) e destrava cron_state com last_5m_ts futuro.
 * Uso: npx tsx scripts/clean-future.ts  (requer .env.local com service key) */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

async function main() {
  const env: Record<string, string> = {};
  const file = join(process.cwd(), ".env.local");
  if (existsSync(file)) {
    for (const raw of readFileSync(file, "utf8").split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const i = line.indexOf("=");
      if (i < 1) continue;
      env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  const base = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY;
  if (!base || !key) {
    console.error("✘ sem env");
    process.exit(1);
  }
  const H: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Accept-Profile": "radar_ai",
    "Content-Profile": "radar_ai",
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  const nowS = Math.floor(Date.now() / 1000);
  const cutoff = nowS + 300; // 5 min à frente já é corrupção

  const cnt = (await fetch(`${base}/rest/v1/candles?select=count&ts=gt.${cutoff}`, {
    headers: { ...H, Prefer: "count=exact" },
  }).then((r) => r.headers.get("content-range") ?? "?")) as string;
  console.log(`candles com ts futuro (>${cutoff}): ${cnt}`);

  const del = await fetch(`${base}/rest/v1/candles?ts=gt.${cutoff}`, { method: "DELETE", headers: H });
  console.log(`delete candles futuros → HTTP ${del.status}${del.ok ? " ✓" : ` ${(await del.text()).slice(0, 200)}`}`);

  const states = (await fetch(
    `${base}/rest/v1/cron_state?select=asset_id,last_5m_ts&last_5m_ts=gt.${nowS + 600}`,
    { headers: H }
  ).then((r) => r.json())) as { asset_id: string; last_5m_ts: number }[];
  console.log(`cron_state com last_5m futuro: ${states.length}`);
  for (const st of states) {
    const p = await fetch(`${base}/rest/v1/cron_state?asset_id=eq.${st.asset_id}`, {
      method: "PATCH",
      headers: H,
      body: JSON.stringify({ last_5m_ts: 0, updated_at: new Date().toISOString() }),
    });
    if (!p.ok) console.error(`✘ reset ${st.asset_id}: HTTP ${p.status}`);
  }
  console.log(states.length ? "✓ estados destravados (last_5m_ts → 0)" : "nada a resetar");
}

main().catch((e) => {
  console.error("Erro:", e);
  process.exit(1);
});
