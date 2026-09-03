/**
 * Horários de mercado do Radar — fonte ÚNICA para "quando o mercado está aberto".
 *
 * Pares de forex: janela oficial da IQ Option fornecida pelo usuário, EM UTC:
 *   Dom 22:00–23:59
 *   Seg–Qui 00:00–15:30 e 22:00–23:59
 *   Sex 00:00–15:30
 *   Sáb fechado
 * Ações dos EUA (AAPL, TSLA, NVDA…): pregão regular da NYSE —
 *   Seg–Sex 09:30–16:00 em Nova York (horário de verão americano incluso).
 *
 * O cron usa estes horários para NÃO gastar cota da API fora deles; as páginas
 * usam para esconder countdowns/avisar quando o mercado fecha.
 * Brasília = UTC−3 fixo (sem horário de verão desde 2019).
 */

export type MarketType = "forex" | "stock";

const MIN = 60;

/**
 * Janela forex por dia da semana (Date.getUTCDay(): 0 = domingo).
 * Valores em minutos do dia UTC; fim INCLUSIVO (segue a tabela "22:00–23:59").
 */
const FX_UTC_MIN: Record<number, [number, number][]> = {
  0: [[22 * MIN, 23 * MIN + 59]], // dom 22:00–23:59
  1: [[0, 15 * MIN + 30], [22 * MIN, 23 * MIN + 59]], // seg
  2: [[0, 15 * MIN + 30], [22 * MIN, 23 * MIN + 59]], // ter
  3: [[0, 15 * MIN + 30], [22 * MIN, 23 * MIN + 59]], // qua
  4: [[0, 15 * MIN + 30], [22 * MIN, 23 * MIN + 59]], // qui
  5: [[0, 15 * MIN + 30]], // sex
  6: [], // sáb — fechado
};

const DAY_PT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** Resumo fixo (deriva diretamente da tabela do usuário) — exibição nas páginas. */
export const FX_SUMMARY_UTC =
  "Seg–Qui 00h00–15h30 + 22h00–23h59 · Sex 00h00–15h30 · Dom 22h00–23h59 · Sáb fechado (UTC)";
/** Mesma janela convertida para Brasília (UTC−3 fixo). */
export const FX_SUMMARY_BRT =
  "Seg–Qui 00h00–12h30 + 19h00–20h59 · Sex 00h00–12h30 · Dom 19h00–20h59 · Sáb fechado (horário de Brasília)";
export const STOCK_SUMMARY = "Ações EUA: Seg–Sex 09h30–16h00 (Nova York)";

/** Minutos desde a meia-noite UTC. */
const utcMinutes = (d: Date) => d.getUTCHours() * 60 + d.getUTCMinutes();

/** Relógio em Nova York (weekday 0=dom + minutos desde a meia-noite de NY). */
function nyClock(d: Date): { dow: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { dow: dowMap[get("weekday")] ?? -1, minutes: hour * 60 + minute };
}

/**
 * O mercado do tipo está aberto agora?
 * `graceSec` estende o fechamento (uso interno do cron p/ capturar a vela que
 * fechou no último segundo da janela sem queimar cota fora do horário).
 */
export function marketOpen(type: MarketType, now: Date = new Date(), graceSec = 0): boolean {
  const gMin = Math.ceil(graceSec / MIN);
  if (type === "forex") {
    const m = utcMinutes(now);
    for (const [s, e] of FX_UTC_MIN[now.getUTCDay()] ?? []) {
      if (m >= s && m <= e + gMin) return true;
    }
    return false;
  }
  const ny = nyClock(now);
  return ny.dow >= 1 && ny.dow <= 5 && ny.minutes >= 9 * 60 + 30 && ny.minutes <= 16 * 60 + gMin;
}

/** Próximo instante (Date) em que o mercado do tipo abre — null se não houver em 8 dias. */
export function nextMarketOpen(type: MarketType, now: Date = new Date()): Date | null {
  if (type === "forex") {
    const startMs = Math.floor(now.getTime() / 60_000) * 60_000;
    for (let i = 1; i <= 8 * 1440; i++) {
      const d = new Date(startMs + i * 60_000);
      if (marketOpen("forex", d)) return d;
    }
    return null;
  }
  // ações: cálculo direto no relógio de Nova York (evita Intl a cada minuto)
  const ny = nyClock(now);
  let dayOffset = 0;
  if (!(ny.dow >= 1 && ny.dow <= 5 && ny.minutes < 9 * 60 + 30)) {
    let found = false;
    for (let d = 1; d <= 8; d++) {
      const wd = (ny.dow + d) % 7;
      if (wd >= 1 && wd <= 5) {
        dayOffset = d;
        found = true;
        break;
      }
    }
    if (!found) return null;
  }
  // offset atual de NY (min atrás de UTC) — aproxima o instante do open; a
  // mudança de horário de verão (1x por semestre, de madrugada) pode deslocar ±1h.
  const utcNowMin = Math.floor(now.getTime() / 60_000);
  const offsetMin = ((utcNowMin - ny.minutes) % 1440 + 1440) % 1440;
  const dayStartMs = Math.floor(now.getTime() / 86_400_000) * 86_400_000;
  return new Date(dayStartMs + dayOffset * 86_400_000 + (9 * 60 + 30 + offsetMin) * 60_000);
}

/** Formata um Date UTC como "HH:MM" no fuso de Brasília (UTC−3 fixo). */
export function fmtBrtTime(utc: Date): string {
  const brt = new Date(utc.getTime() - 3 * 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(brt.getUTCHours())}h${p(brt.getUTCMinutes())}`;
}

/** Formata um Date UTC como "HH:MM" em UTC mesmo. */
export function fmtUtcTime(utc: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(utc.getUTCHours())}h${p(utc.getUTCMinutes())}`;
}

/** Resumo legível do próximo início: "seg 22h00" (Brasília) + versão UTC. */
export function nextOpenLabels(type: MarketType, now: Date = new Date()): { brt: string | null; utc: string | null; day: string | null } {
  const next = nextMarketOpen(type, now);
  if (!next) return { brt: null, utc: null, day: null };
  return {
    day: DAY_PT[next.getUTCDay()],
    brt: fmtBrtTime(next),
    utc: fmtUtcTime(next),
  };
}

export interface SessionInfo {
  /** Algum mercado do tipo consultado está aberto agora. */
  active: boolean;
  forexOpen: boolean;
  stockOpen: boolean;
  /** Resumo das janelas (texto p/ exibição). */
  windowBrt: string;
  windowUtc: string;
  stockWindow: string;
  /** Próximo início (Brasília / UTC) — preenchido quando fechado. */
  nextStartBrt: string | null;
  nextStartUtc: string | null;
  nextStartDayPt: string | null;
}

/**
 * Status para a UI. `type` filtra por mercado ("forex", "stock") ou considera
 * ambos ("all" — dashboard, que tem forex + ações na mesma grade).
 */
export function marketSession(type: MarketType | "all" = "all", now: Date = new Date()): SessionInfo {
  const forexOpen = marketOpen("forex", now);
  const stockOpen = marketOpen("stock", now);
  const active = type === "all" ? forexOpen || stockOpen : marketOpen(type, now);

  const next =
    type === "all"
      ? // próximo início entre os dois mercados (o que abrir primeiro)
        (() => {
          const f = nextMarketOpen("forex", now);
          const s = nextMarketOpen("stock", now);
          const list = [f, s].filter((d): d is Date => d !== null);
          return list.length ? new Date(Math.min(...list.map((d) => d.getTime()))) : null;
        })()
      : nextMarketOpen(type, now);

  return {
    active,
    forexOpen,
    stockOpen,
    windowBrt: type === "stock" ? STOCK_SUMMARY : FX_SUMMARY_BRT,
    windowUtc: type === "stock" ? STOCK_SUMMARY : FX_SUMMARY_UTC,
    stockWindow: STOCK_SUMMARY,
    nextStartBrt: next ? fmtBrtTime(next) : null,
    nextStartUtc: next ? fmtUtcTime(next) : null,
    nextStartDayPt: next ? DAY_PT[next.getUTCDay()] : null,
  };
}

/**
 * Minutos JÁ transcorridos hoje em que o mercado do tipo está/esteve aberto
 * (para estimativa de cota da API — o cron consome 1 requisição/ativo/intervalo).
 */
/**
 * Estimativa conceitual de créditos de dados gastos hoje
 * (1 requisição por ativo a cada `intervalMin` dentro da janela do próprio tipo).
 * Twelve Data free: 800 créditos/dia — usado no Topbar e em /api/quota.
 */
export function creditsEstimateToday(
  now: Date = new Date(),
  counts: { forex: number; stock: number } = { forex: 10, stock: 3 },
  intervalMin = 5
): number {
  const f = Math.floor(openMinutesElapsedToday("forex", now) / intervalMin) * counts.forex;
  const s = Math.floor(openMinutesElapsedToday("stock", now) / intervalMin) * counts.stock;
  return Math.min(800, f + s);
}

export function openMinutesElapsedToday(type: MarketType, now: Date = new Date()): number {
  const m = utcMinutes(now);
  if (type === "forex") {
    let total = 0;
    for (const [s, e] of FX_UTC_MIN[now.getUTCDay()] ?? []) {
      total += Math.max(0, Math.min(e, m) - s + 1);
    }
    return total;
  }
  const ny = nyClock(now);
  if (ny.dow < 1 || ny.dow > 5) return 0;
  if (ny.minutes < 9 * 60 + 30) return 0;
  return Math.min(ny.minutes - (9 * 60 + 30), 6 * 60 + 30); // 09:30–16:00 = 390 min
}
