/**
 * Teste REAL do consenso com a chave OpenRouter (.env.local).
 * Roda: node --env-file=.env.local --import tsx scripts/ai-consensus-test.ts
 * (ou manualmente via tsx; o script tenta carregar .env.local sozinho).
 */
import { readFileSync } from "node:fs";
import { runEngine, buildIndicatorPack, type EngineResult, type IndicatorPack } from "../src/lib/engine";
import { getDemoCandles } from "../src/lib/demo-data";
import { buildPayload } from "../src/lib/ai/payload";
import { runConsensus } from "../src/lib/ai/consensus";

// carrega .env.local manualmente (caso não seja passado via --env-file)
try {
  const env = readFileSync(".env.local", "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2];
  }
} catch {
  /* sem .env.local */
}

async function main() {
  if (!process.env.OPENROUTER_KEY) {
    console.error("✘ OPENROUTER_KEY ausente (configure .env.local)");
    process.exit(1);
  }

  // encontra o setup mais recente com score >= 75 no EUR/USD 5m (motor real)
  const candles = getDemoCandles("EUR/USD", "5m");
  let found: { engine: EngineResult; ind: IndicatorPack } | null = null;
  for (let i = candles.length - 2; i >= 300; i--) {
    const w = candles.slice(Math.max(0, i - 399), i + 1);
    const r = runEngine({ candles5m: w });
    if (r.valid && r.score >= 75 && r.direction !== "NEUTRAL") {
      found = { engine: r, ind: buildIndicatorPack(w) };
      break;
    }
  }
  if (!found) {
    console.error("✘ Nenhum setup válido encontrado no demo EUR/USD — rode de novo (dados determinísticos, deve funcionar)");
    process.exit(1);
  }
  const { engine, ind } = found;

  const payload = buildPayload("EUR/USD", "5m", engine, ind);
  console.log("=== PAYLOAD DETERMINÍSTICO (enviado às IAs) ===");
  console.log(JSON.stringify(payload, null, 1).slice(0, 1400));
  console.log(`\n=== CONSENSO REAL — OpenRouter (até 3 modelos, lista free) ===`);
  console.log("Modelos no pool:", (await import("../src/lib/services/openrouter")).getFreeModels().slice(0, 5).join(", "), "…");

  const t0 = Date.now();
  const result = await runConsensus(payload, { maxModels: 3, attemptCap: 6 });
  console.log(`\nTempo total: ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  for (const v of result.modelos) {
    console.log(`\n[${v.model}] status=${v.status} latência=${v.latencyMs}ms`);
    if (v.status === "ok") {
      console.log(`  direction=${v.direction} | coherent=${v.coherent} | confidence=${v.confidence}`);
      console.log(`  reasoning: ${v.reasoning}`);
      if (v.warnings.length) console.log(`  warnings: ${v.warnings.join(" | ")}`);
    } else {
      console.log(`  erro: ${v.error}`);
    }
  }

  console.log(
    `\n=== RESULTADO FINAL: passed=${result.passed} | favorável=${result.favoravel} | ` +
      `confidence média=${result.confidenceMedia.toFixed(0)} | direção=${result.direction} ===`
  );
  process.exit(result.passed ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});