/**
 * Horários de mercado do Radar — fonte ÚNICA para "quando o mercado está aberto".
 *
 * Pares de forex: janela oficial da IQ Option PARA O BRASIL, informada pelo
 * usuário COM O CABEÇALHO "HORÁRIO (UTC-3)" — ou seja, horário de Brasília:
 *   Seg–Qui 00:00–15:30 e 22:00–23:59 (Brasília)
 *   Sex 00:00–15:30 (Brasília)
 *   Sáb fechado · Dom 22:00–23:59 (Brasília)
 * Em UTC isso equivale a: Seg–Sex 01:00–18:30 UTC (contínuo), Sáb–Dom fechado.
 * O usuário SÓ consegue operar EUR/USD etc. na IQ Option dentro dessa janela,
 * então o cron busca candles/genera sinais exatamente nesses momentos.
 *
 * Ações dos EUA (AAPL, TSLA, NVDA…): pregão regular da NYSE —
 *   Seg–Sex 09:30–16:00 em Nova York (horário de verão americano incluso).
 *
 * Brasília = UTC−3 fixo (sem horário de verão desde 2019).
 */

export type MarketType = "forex" | "stock";

const MIN = 60;

/**
 * Janela forex por dia da semana EM HORÁRIO DE BRASÍLIA
 * (Date.getUTCDay() do relógio deslocado −3h: 0 = domingo).
 * Valores em minutos do dia; fim INCLUSIVO (segue a tabela "22:00–23:59").
 */
const FX_BRT_MIN: Record<number, [number, number][]> = {
  0: [[22 * MIN, 23 * MIN + 59]], // dom 22:00–23:59
  1: [[0, 15 * MIN + 30], [22 * MIN, 23 * MIN + 59]], // seg
  2: [[0, 15 * MIN + 30], [22 * MIN, 23 * MIN + 59]], // ter
  3: [[0, 15 * MIN + 30], [22 * MIN, 23 * MIN + 59]], // qua
  4: [[0, 15 * MIN + 30], [22 * MIN, 23 * MIN + 59]], // qui
  5: [[0, 15 * MIN + 30]], // sex
  6: [], // sáb — fechado
};

const DAY_PT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** Resumo da janela forex NO HORÁRIO DA IQ OPTION (Brasília) — exibição principal. */
export const FX_SUMMARY_BRT =
  "Seg–Qui 00h00–15h30 + 22h00–23h59 · Sex 00h00–15h30 · Dom 22h00–23h59 · Sáb fechado (horário de Brasília)";
/** Mesma janela em UTC (equivalência: Seg–Sex 01h00–18h30 UTC). */
export const FX_SUMMARY_UTC =
  "Seg–Sex 01h00–18h30 UTC (contínuo) · Sáb e Dom fechados";
export const STOCK_SUMMARY = "Ações EUA: Seg–Sex 09h30–16h00 (Nova York)";

/** Relógio de Brasília (UTC−3 fixo): weekday 0=dom + minutos desde a meia-noite. */
function brClock(d: Date): { dow: number; minutes: number } {
  const b = new Date(d.getTime() - 3 * 3600_000);
  return { dow: b.getUTCDay(), minutes: b.getUTCHours() * 60 + b.getUTCMinutes() };
}

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
    const br = brClock(now);
    for (const [s, e] of FX_BRT_MIN[br.dow] ?? []) {
      if (br.minutes >= s && br.minutes <= e + gMin) return true;
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
    day: DAY_PT[brClock(next).dow],
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
  /** Fechamento da janela ATUAL (unix s + rótulos BRT/UTC) — quando aberto. */
  nextCloseTs: number | null;
  nextCloseBrt: string | null;
  nextCloseUtc: string | null;
}

/** Fim (ms) do segmento forex atualmente aberto — ou null se fechado. */
function forexSegmentEndMs(now: Date): number | null {
  const b = new Date(now.getTime() - 3 * 3600_000); // relógio de Brasília
  const minutes = b.getUTCHours() * 60 + b.getUTCMinutes();
  const day = b.getUTCDay();
  for (const [s, e] of FX_BRT_MIN[day] ?? []) {
    if (minutes >= s && minutes <= e) {
      // janela vai até o fim do minuto `e` (ex.: 15:30:59) → fecha 1 min depois
      return (
        Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate(), Math.floor(e / 60), (e % 60) + 1) +
        3 * 3600_000
      );
    }
  }
  return null;
}

/** Fim (ms) do pregão NYSE atualmente aberto — ou null se fechado. */
function stockCloseMs(now: Date): number | null {
  const ny = nyClock(now);
  if (!(ny.dow >= 1 && ny.dow <= 5 && ny.minutes >= 9 * 60 + 30 && ny.minutes <= 16 * 60)) return null;
  const utcNowMin = Math.floor(now.getTime() / 60_000);
  const offsetMin = ((utcNowMin - ny.minutes) % 1440 + 1440) % 1440;
  const dayStartMs = Math.floor(now.getTime() / 86_400_000) * 86_400_000;
  return dayStartMs + (16 * 60 + 1 + offsetMin) * 60_000;
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
      ? (() => {
          const f = nextMarketOpen("forex", now);
          const s = nextMarketOpen("stock", now);
          const list = [f, s].filter((d): d is Date => d !== null);
          return list.length ? new Date(Math.min(...list.map((d) => d.getTime()))) : null;
        })()
      : nextMarketOpen(type, now);

  // qual mercado está comandando o status "aberto" (p/ avisar o fechamento)
  const activeType: MarketType | null =
    type === "all" ? (forexOpen ? "forex" : stockOpen ? "stock" : null) : active ? type : null;
  const closeMs = activeType === "forex" ? forexSegmentEndMs(now) : activeType === "stock" ? stockCloseMs(now) : null;
  const closeDate = closeMs ? new Date(closeMs) : null;

  return {
    active,
    forexOpen,
    stockOpen,
    windowBrt: type === "stock" ? STOCK_SUMMARY : FX_SUMMARY_BRT,
    windowUtc: type === "stock" ? STOCK_SUMMARY : FX_SUMMARY_UTC,
    stockWindow: STOCK_SUMMARY,
    nextStartBrt: next ? fmtBrtTime(next) : null,
    nextStartUtc: next ? fmtUtcTime(next) : null,
    nextStartDayPt: next ? DAY_PT[brClock(next).dow] : null,
    nextCloseTs: closeDate ? Math.floor(closeDate.getTime() / 1000) : null,
    nextCloseBrt: closeDate ? fmtBrtTime(closeDate) : null,
    nextCloseUtc: closeDate ? fmtUtcTime(closeDate) : null,
  };
}

/**
 * Minutos JÁ transcorridos hoje (dia UTC — reset da cota do provedor) em que o
 * mercado do tipo está/esteve aberto — usado na estimativa de cota da API.
 * Forex: contagem por minuto sobre a janela Brasília (matemática pura).
 */
export function openMinutesElapsedToday(type: MarketType, now: Date = new Date()): number {
  const nowMin = Math.floor(now.getTime() / 60_000);
  const dayStartMin = Math.floor(now.getTime() / 86_400_000) * 1440;
  if (type === "forex") {
    let total = 0;
    for (let m = 0; m <= nowMin - dayStartMin; m++) {
      if (marketOpen("forex", new Date((dayStartMin + m) * 60_000))) total++;
    }
    return total;
  }
  const ny = nyClock(now);
  if (ny.dow < 1 || ny.dow > 5) return 0;
  if (ny.minutes < 9 * 60 + 30) return 0;
  return Math.min(ny.minutes - (9 * 60 + 30), 6 * 60 + 30); // 09:30–16:00 = 390 min
}

/**
 * Estimativa conceitual de créditos de dados gastos hoje
 * (1 requisição por ativo a cada `intervalMin` dentro da janela do próprio tipo).
 * Twelve Data free: 800 créditos/dia — usado no Topbar e em /api/quota.
 */
export function creditsEstimateToday(
  now: Date = new Date(),
  counts: { forex: number; stock: number } = { forex: 11, stock: 3 },
  intervalMin = 5
): number {
  const f = Math.floor(openMinutesElapsedToday("forex", now) / intervalMin) * counts.forex;
  const s = Math.floor(openMinutesElapsedToday("stock", now) / intervalMin) * counts.stock;
  return Math.min(800, f + s);
}
