import { evaluateStrategies, buildIndicatorPack, supportResistance, atr } from "../src/lib/engine";
import { getDemoCandles } from "../src/lib/demo-data";

for (const symbol of ["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "EUR/JPY", "GBP/JPY"]) {
  const candles = getDemoCandles(symbol, "5m");
  const counts: Record<string, number> = {
    "Tendência + Pullback": 0,
    "Suporte/Resistência": 0,
    Breakout: 0,
    Confluência: 0,
    valid: 0,
    semSR: 0,
    volFora: 0,
    sideways: 0,
  };
  let zoneDistSum = 0;
  let zoneDistN = 0;
  let atrPctSum = 0;
  let atrPctN = 0;
  for (let i = 300; i < candles.length - 1; i++) {
    const w = candles.slice(Math.max(0, i - 399), i + 1);
    const ind = buildIndicatorPack(w);
    const ev = evaluateStrategies(ind, w, w.length - 1);
    for (const h of ev.hits) if (h.passed) counts[h.name]++;
    if (ev.hits.some((h) => h.passed)) counts.valid++;
    if (!ind.support.length && !ind.resistance.length) counts.semSR++;
    if (!ind.volOk) counts.volFora++;
    if (ind.isSideways) counts.sideways++;
    const sr = supportResistance(w);
    const a = atr(w)!;
    const last = w[w.length - 1].close;
    if (sr.resistance[0]) { zoneDistSum += (sr.resistance[0] - last) / a; zoneDistN++; }
    atrPctSum += (a / last) * 100;
    atrPctN++;
  }
  console.log(
    symbol,
    JSON.stringify(counts),
    `| res dist (ATR): ${zoneDistN ? (zoneDistSum / zoneDistN).toFixed(1) : "n/a"}`,
    `| ATR% médio: ${(atrPctSum / atrPctN).toFixed(3)}%`
  );
}