"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  createSeriesMarkers,
  ColorType,
  CrosshairMode,
  LineStyle,
  CandlestickSeries,
  LineSeries,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type SeriesMarker,
  type UTCTimestamp,
  type WhitespaceData,
} from "lightweight-charts";
import type { Candle, Direction } from "@/lib/engine";
import { emaSeries } from "@/lib/engine";

export interface SignalMarker {
  ts: number;
  direction: Direction;
  score: number;
}

/** Sinal pendente exibido no gráfico (prazo de entrada com expiração). */
export interface PendingSignalInfo {
  ts: number;
  direction: Direction;
  score: number;
}

interface CandlestickChartProps {
  candles: Candle[];
  signals?: SignalMarker[];
  support?: number[];
  resistance?: number[];
  height?: number;
  /** sinal pendente — desenha a expiração dele no gráfico */
  pendingSignal?: PendingSignalInfo | null;
  /** janela de validade do sinal em segundos (default 5 min) */
  expirySeconds?: number;
  /** duração do timeframe exibido (60/300/900) — mostra a linha da próxima vela */
  candleSeconds?: number;
  /** rótulo do timeframe (ex.: "5m") */
  candleLabel?: string;
}

const EMA_COLORS = ["#4d9de0", "#f5a623", "#9d7aea"]; // 9, 21, 50
const DIR_COLORS: Record<Direction, string> = { CALL: "#16c784", PUT: "#ea3943", NEUTRAL: "#4d9de0" };
const NEXT_CANDLE_COLOR = "#4d9de0";

/** HH:MM:SS no fuso do navegador. */
function fmtClock(tsSec: number): string {
  return new Date(tsSec * 1000).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** m ss compacto p/ countdown. */
function fmtLeft(secs: number): string {
  const s = Math.max(0, Math.ceil(secs));
  const m = Math.floor(s / 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${String(Math.floor(s % 60)).padStart(2, "0")}s`;
}

export default function CandlestickChart({
  candles,
  signals = [],
  support = [],
  resistance = [],
  height = 420,
  pendingSignal = null,
  expirySeconds = 5 * 60,
  candleSeconds,
  candleLabel,
}: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const lineRef = useRef<HTMLDivElement | null>(null);

  // relógio ao vivo do gráfico — atualiza countdowns a cada 500ms
  const [nowSec, setNowSec] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const id = setInterval(() => setNowSec(Date.now() / 1000), 500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart: IChartApi = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#161b22" },
        textColor: "#a9b3c0",
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(42, 49, 60, 0.35)" },
        horzLines: { color: "rgba(42, 49, 60, 0.35)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(77, 157, 224, 0.4)", labelBackgroundColor: "#2a313c" },
        horzLine: { color: "rgba(77, 157, 224, 0.4)", labelBackgroundColor: "#2a313c" },
      },
      rightPriceScale: { borderColor: "#2a313c" },
      timeScale: {
        borderColor: "#2a313c",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true },
    });
    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#16c784",
      downColor: "#ea3943",
      borderVisible: false,
      wickUpColor: "#16c784",
      wickDownColor: "#ea3943",
    });

    const closes = candles.map((c) => c.close);
    const emas = [emaSeries(closes, 9), emaSeries(closes, 21), emaSeries(closes, 50)];

    // ---- linha vertical: expiração do sinal pendente / fechamento da próxima vela ----
    // Precisamos que o instante-alvo exista na escala: adicionamos um whitespace bar
    // futuro (só alguns slots à frente — não deforma o fit) e o fitContent inclui ele.
    const last = candles[candles.length - 1];
    const tf = candleSeconds ?? 300;
    const sig = pendingSignal;
    const deadline = sig ? sig.ts + (expirySeconds ?? 5 * 60) : null;
    const expiredAtSetup = deadline !== null && deadline <= Date.now() / 1000;

    let whitespaceTime: number | null = null;
    if (sig && deadline !== null && !expiredAtSetup && last) {
      // expiração do sinal dentro da janela — marca o limite de entrada
      if (deadline > last.ts && deadline - last.ts <= Math.max(15 * 60, tf * 6)) {
        whitespaceTime = deadline;
      }
    } else if (!sig && candleSeconds && last) {
      // sem sinal: marca onde a PRÓXIMA vela do timeframe vai fechar
      const nextBoundary = (Math.floor(last.ts / tf) + 1) * tf;
      if (nextBoundary > last.ts) whitespaceTime = nextBoundary;
    }

    const candleData: CandlestickData<UTCTimestamp>[] = candles.map((c) => ({
      time: c.ts as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    const seriesData: (CandlestickData<UTCTimestamp> | WhitespaceData<UTCTimestamp>)[] =
      whitespaceTime !== null ? [...candleData, { time: whitespaceTime as UTCTimestamp }] : candleData;
    candleSeries.setData(seriesData);

    const emaSeriesList: ISeriesApi<"Line">[] = [];
    emas.forEach((values, idx) => {
      if (values.length !== candles.length) return;
      const line = chart.addSeries(LineSeries, {
        color: EMA_COLORS[idx],
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      const data: LineData<UTCTimestamp>[] = [];
      for (let i = 0; i < values.length; i++) {
        if (Number.isFinite(values[i])) {
          data.push({ time: candles[i].ts as UTCTimestamp, value: values[i] });
        }
      }
      line.setData(data);
      emaSeriesList.push(line);
    });

    // zonas S/R — linhas tracejadas suaves
    const srLines: { price: number; title: string }[] = [
      ...support.map((p) => ({ price: p, title: "S" })),
      ...resistance.map((p) => ({ price: p, title: "R" })),
    ];
    for (const line of srLines) {
      candleSeries.createPriceLine({
        price: line.price,
        color: "rgba(169, 179, 192, 0.4)",
        lineStyle: LineStyle.Dashed,
        lineWidth: 1,
        axisLabelVisible: true,
        title: line.title,
      });
    }

    // marcadores de sinais (triângulos CALL/PUT)
    const tsSet = new Set(candles.map((c) => c.ts));
    const markers: SeriesMarker<UTCTimestamp>[] = signals
      .filter((s) => tsSet.has(s.ts))
      .map((s) => ({
        time: s.ts as UTCTimestamp,
        position: s.direction === "CALL" ? "belowBar" : "aboveBar",
        color: s.direction === "CALL" ? "#16c784" : "#ea3943",
        shape: s.direction === "CALL" ? "arrowUp" : "arrowDown",
        text: `${s.direction} ${s.score}`,
      }));
    const markersPlugin = createSeriesMarkers(candleSeries);
    markersPlugin.setMarkers(markers);

    chart.timeScale().fitContent();

    const handleResize = () => {
      chart.applyOptions({ width: container.clientWidth });
    };
    const ro = new ResizeObserver(handleResize);
    ro.observe(container);

    return () => {
      ro.disconnect();
      chartRef.current = null;
      chart.remove();
    };
  }, [candles, signals, support, resistance, pendingSignal, candleSeconds, expirySeconds]);

  // ---- overlays (countdowns + linhas) ----
  const last = candles.length ? candles[candles.length - 1] : null;
  const tf = candleSeconds ?? 300;
  const sig = pendingSignal;
  const deadline = sig ? sig.ts + (expirySeconds ?? 5 * 60) : null;
  const remaining = deadline !== null ? deadline - nowSec : null; // pode ser negativo
  const expired = sig !== null && remaining !== null && remaining <= 0;
  const active = sig !== null && remaining !== null && remaining > 0;
  const urgent = active && remaining !== null && remaining <= 60;

  // linha vertical (target na escala — incluído como whitespace no setData acima)
  let lineTarget: number | null = null;
  let lineColor = NEXT_CANDLE_COLOR;
  let lineLabel: string | null = null;
  if (active && deadline !== null) {
    lineTarget = deadline;
    lineColor = DIR_COLORS[sig.direction];
    lineLabel = `expira ${fmtClock(deadline)}`;
  } else if (!sig && candleSeconds && last) {
    const boundary = (Math.floor(last.ts / tf) + 1) * tf;
    lineTarget = boundary;
    lineLabel = `fecha ${fmtClock(boundary)}`;
  }
  // linha só aparece para um fechamento que ainda não passou
  const showLine = lineTarget !== null && lineTarget > nowSec;

  // overlay: linha vertical (expiração/vela) — posição consulta o chart
  // (fora do render; refs só são lidos em effects/eventos)
  useEffect(() => {
    const chart = chartRef.current;
    const el = lineRef.current;
    if (!chart || !el) {
      if (el) el.style.left = "-9999px";
      return;
    }
    if (lineTarget === null) {
      el.style.left = "-9999px";
      return;
    }
    const move = () => {
      const x = chart.timeScale().timeToCoordinate(lineTarget as UTCTimestamp);
      el.style.left = x === null ? "-9999px" : `${x}px`;
    };
    move();
    chart.timeScale().subscribeVisibleLogicalRangeChange(move);
    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(move);
    };
  }, [lineTarget, candles, signals, pendingSignal]);

  return (
    <div className="relative w-full" style={{ height }}>
      <div ref={containerRef} className="absolute inset-0" />

      {/* linha vertical do prazo/vela (posição setada por effect — left:-9999 fora da tela) */}
      {showLine && (
        <div
          ref={lineRef}
          className="pointer-events-none absolute inset-y-0 z-[5]"
          style={{ left: -9999 }}
        >
          <div className="h-full w-px" style={{ background: lineColor, opacity: 0.75 }} />
          {lineLabel && (
            <span
              className="absolute top-0.5 -translate-x-1/2 whitespace-nowrap rounded px-1 py-px text-[10px] font-semibold"
              style={{ background: lineColor, color: "#0d1117" }}
            >
              {lineLabel}
            </span>
          )}
        </div>
      )}

      {/* chips de status (countdowns) dentro do gráfico */}
      <div className="pointer-events-none absolute left-2 top-2 z-[6] flex max-w-[calc(100%-7rem)] flex-col items-start gap-1">
        {sig && expired && (
          <span className="rounded-md border border-put/60 bg-put/15 px-2 py-0.5 text-[11px] font-semibold text-put">
            ⏰ Sinal {sig.direction} {sig.score} expirou — <strong>NÃO operar mais</strong>
            {deadline !== null ? ` (era até ${fmtClock(deadline)})` : ""}
          </span>
        )}
        {active && (
          <span
            className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
              urgent
                ? "border-warn/60 bg-warn/15 text-warn"
                : sig.direction === "CALL"
                  ? "border-call/60 bg-call/15 text-call"
                  : "border-put/60 bg-put/15 text-put"
            }`}
          >
            ▶ {sig.direction} {sig.score} · entre até {deadline !== null ? fmtClock(deadline) : "—"} — falta{" "}
            <strong className="tabular-nums">{remaining !== null ? fmtLeft(remaining) : "—"}</strong>
            {urgent && " · últimos segundos!"}
          </span>
        )}
        {!sig && candleSeconds && (
          <span className="rounded-md border border-info/40 bg-surface/80 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            ⏳ próxima vela {candleLabel ?? ""} em{" "}
            <strong className="tabular-nums text-foreground/80">
              {fmtLeft((Math.floor(nowSec / tf) + 1) * tf - nowSec)}
            </strong>
          </span>
        )}
      </div>
    </div>
  );
}
