/**
 * Catálogo único de ativos do Radar.
 *
 * - forex: pares operados na IQ Option dentro da janela dela (src/lib/schedule.ts)
 * - stock: ações dos EUA (pregão NYSE) — AAPL, TSLA e NVDA são as mais líquidas
 *   da IQ Option e cobertas pelo Twelve Data/Finnhub.
 *
 * A ordem aqui é a mesma da seed do banco, do perfil e da página Config.
 */

export interface RadarAsset {
  symbol: string;
  type: "forex" | "stock";
}

export const RADAR_ASSETS: RadarAsset[] = [
  // forex
  { symbol: "EUR/USD", type: "forex" },
  { symbol: "GBP/USD", type: "forex" },
  { symbol: "USD/JPY", type: "forex" },
  { symbol: "AUD/USD", type: "forex" },
  { symbol: "EUR/JPY", type: "forex" },
  { symbol: "GBP/JPY", type: "forex" },
  { symbol: "EUR/GBP", type: "forex" },
  { symbol: "USD/CHF", type: "forex" },
  { symbol: "AUD/JPY", type: "forex" },
  { symbol: "USD/CAD", type: "forex" },
  { symbol: "XAU/USD", type: "forex" },
  // ações EUA
  { symbol: "AAPL", type: "stock" },
  { symbol: "TSLA", type: "stock" },
  { symbol: "NVDA", type: "stock" },
];

export const ACTIVE_SYMBOLS: string[] = RADAR_ASSETS.map((a) => a.symbol);

/** Tipo do ativo (fallback: sem "/" é ação). */
export function assetTypeOf(symbol: string): "forex" | "stock" {
  return RADAR_ASSETS.find((a) => a.symbol === symbol)?.type ?? (symbol.includes("/") ? "forex" : "stock");
}

export const FOREX_SYMBOLS: string[] = RADAR_ASSETS.filter((a) => a.type === "forex").map((a) => a.symbol);
export const STOCK_SYMBOLS: string[] = RADAR_ASSETS.filter((a) => a.type === "stock").map((a) => a.symbol);
