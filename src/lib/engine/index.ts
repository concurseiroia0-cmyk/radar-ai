/**
 * Barrel do motor Radar AI — single source of truth.
 * Tempo real (cron) e backtest usam EXATAMENTE estas funções.
 */
export * from "./types";
export * from "./utils";
export * from "./aggregate";
export * from "./indicators";
export * from "./strategies";
export * from "./filters";
export * from "./score";
export * from "./engine";