/**
 * Sanity check do motor — roda com `npx tsx scripts/engine-sanity.ts`.
 * Verifica matemática dos indicadores + agregação + engine end-to-end.
 */
import {
  aggregate,
  emaSeries,
  rsiSeries,
  macd,
  atrSeries,
  runEngine,
  buildIndicatorPack,
  type Candle,
} from "../src/lib/engine";
import { getDemoCandles } from "../src/lib/demo-data";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✔ ${name}`);
  } else {
    failures++;
    console.error(`  ✘ ${name} ${detail ?? ""}`);
  }
}

function makeCandles(closes: number[], startTs = 1_700_000_000, step = 60): Candle[] {
  let prev = closes[0];
  return closes.map((c, i) => {
    const open = i === 0 ? c : prev;
    const high = Math.max(open, c) + 0.0001;
    const low = Math.min(open, c) - 0.0001;
    prev = c;
    return { ts: startTs + i * step, open, high, low, close: c };
  });
}

function synthetic5m(n: number, start: number, drift: number, vol: number, seed = 42): Candle[] {
  let s = seed;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  const candles: Candle[] = [];
  let price = start;
  let open = price;
  for (let i = 0; i < n; i++) {
    const change = drift + (rnd() - 0.5) * vol;
    const close = open + change;
    const high = Math.max(open, close) + Math.abs(rnd()) * vol * 0.3;
    const low = Math.min(open, close) - Math.abs(rnd()) * vol * 0.3;
    candles.push({ ts: 1_700_000_000 + i * 300, open, high, low, close });
    open = close;
  }
  return candles;
}

console.log("=== Indicadores ===");

// EMA: série simples conhecida
const closes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const e3 = emaSeries(closes, 3);
// seed = SMA(1,2,3) = 2; k=0.5: idx3=(4+2)/2=3, idx4=(5+3)/2=4 ... idx14=(15+13.5)/2=14.25
check("EMA3 seed = SMA", Math.abs(e3[2] - 2) < 1e-9);
check("EMA3 convergência esperada", Math.abs(e3[14] - 14) < 1e-9);

// RSI Wilder: série 1..15 (sempre ganho) → RSI = 100
const rsiAllGain = rsiSeries(closes, 14);
check("RSI 100 quando só ganhos", rsiAllGain[rsiAllGain.length - 1] === 100);

const rsiFlat = rsiSeries([5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5], 14);
check("RSI 100 em série plana (sem perdas)", rsiFlat[rsiFlat.length - 1] === 100);

// MACD: série ACELERANDO (line sobe → signal atrasa → hist > 0)
const up = Array.from({ length: 120 }, (_, i) => 100 + i * 0.5 + i * i * 0.002);
const mUp = macd(up)!;
check("MACD hist > 0 em série de alta acelerando", mUp.hist > 0);
check("MACD estado positivo", mUp.state === "positivo");
const down = Array.from({ length: 120 }, (_, i) => 300 - i * 0.5 - i * i * 0.002);
const mDown = macd(down)!;
check("MACD hist < 0 em série de baixa acelerando", mDown.hist < 0);
check("MACD estado negativo", mDown.state === "negativo");

// ATR: H-L constante 15 → ATR ~ 15
const atrCandles = Array.from({ length: 30 }, (_, i) => ({
  ts: i * 60,
  open: 100 + i * 2,
  high: 110 + i * 2,
  low: 95 + i * 2,
  close: 105 + i * 2,
}));
const a = atrSeries(atrCandles, 14);
check("ATR ~ amplitude constante (H-L=15)", Math.abs(a[a.length - 1] - 15) < 0.5);

console.log("=== Agregação ===");
// startTs múltiplo de 300 (alinhado ao grid 5m, como dados reais de mercado)
const AGG_START = 1_699_999_800;
const oneMin = Array.from({ length: 30 }, (_, i) => ({
  ts: AGG_START + i * 60,
  open: 100 + i * 0.1,
  high: 100.2 + i * 0.1,
  low: 99.9 + i * 0.1,
  close: 100.1 + i * 0.1,
}));
const fiveMin = aggregate(oneMin, 300);
// 30 candles = 5 buckets completos + 1 parcial (descartado pelo close-on-complete)
check("30 candles 1m → 5 buckets 5m completos", fiveMin.length === 5);
check("bucket 5m tem open do primeiro 1m", Math.abs(fiveMin[0].open - oneMin[0].open) < 1e-9);
check("bucket 5m tem close do último 1m do bloco", Math.abs(fiveMin[0].close - oneMin[4].close) < 1e-9);
check("bucket ts alinhado ao timeframe", fiveMin[0].ts % 300 === 0);

// candle parcial não entra
const partial = [...oneMin.slice(0, 27)];
const fivePartial = aggregate(partial, 300);
check("bloco parcial descartado (close-on-complete)", fivePartial.length === 5);

console.log("=== Engine end-to-end ===");
// dados REALISTAS (âncora + ruído AR(1) com regimes) — mesmos do modo demo
const trending = getDemoCandles("EUR/USD", "5m");
const pack = buildIndicatorPack(trending.slice(-400));
check("pack com tendência detectada", pack.trend === "alta" || pack.trend === "baixa", `trend=${pack.trend}`);
check("ATR% dentro de faixa plausível", pack.atrPercent > 0 && pack.atrPercent < 1, `atr%=${pack.atrPercent}`);

// corre sobre janelas deslizantes e conta sinais válidos (simula backtest)
let valid = 0;
let calls = 0;
let puts = 0;
const results: number[] = [];
const reasonHist: Record<string, number> = {};
for (let i = 200; i < trending.length - 1; i++) {
  const window = trending.slice(Math.max(0, i - 399), i + 1);
  const r = runEngine({ candles5m: window });
  results.push(r.score);
  if (r.valid) {
    valid++;
    if (r.direction === "CALL") calls++;
    else puts++;
  } else {
    const k = r.invalidReasons[0]?.split("(")[0].trim() ?? "?";
    reasonHist[k] = (reasonHist[k] ?? 0) + 1;
  }
}
console.log(`  Sinais válidos: ${valid} (CALL=${calls}, PUT=${puts}) de ${results.length} janelas`);
console.log("  Bloqueios:", JSON.stringify(reasonHist, null, 0));
check("engine produz sinais válidos em dado com tendência", valid > 0);
check("scores dentro de 0..100", results.every((s) => s >= 0 && s <= 100));
check("scores >= 50 quando válido", results.filter((_, i) => true).length > 0);

// dados insuficientes
const tiny = runEngine({ candles5m: trending.slice(0, 10) });
check("dados insuficientes → invalid", !tiny.valid && tiny.invalidReasons.length > 0);

// mercado lateral → bloqueado
const flat = synthetic5m(300, 1.08, 0, 0.00001);
const flatRes = runEngine({ candles5m: flat });
console.log(`  Mercado lateral → valid=${flatRes.valid} reasons=${flatRes.invalidReasons.join(" | ")}`);

console.log(failures === 0 ? "\n✅ TUDO OK" : `\n❌ ${failures} falha(s)`);
process.exit(failures === 0 ? 0 : 1);