"use client";

import { useEffect, useRef } from "react";
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
} from "lightweight-charts";
import type { Candle, Direction } from "@/lib/engine";
import { emaSeries } from "@/lib/engine";

export interface SignalMarker {
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
}

const EMA_COLORS = ["#4d9de0", "#f5a623", "#9d7aea"]; // 9, 21, 50

export default function CandlestickChart({
  candles,
  signals = [],
  support = [],
  resistance = [],
  height = 420,
}: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

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

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#16c784",
      downColor: "#ea3943",
      borderVisible: false,
      wickUpColor: "#16c784",
      wickDownColor: "#ea3943",
    });

    const closes = candles.map((c) => c.close);
    const emas = [emaSeries(closes, 9), emaSeries(closes, 21), emaSeries(closes, 50)];

    const candleData: CandlestickData<UTCTimestamp>[] = candles.map((c) => ({
      time: c.ts as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    candleSeries.setData(candleData);

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
      chart.remove();
    };
  }, [candles, signals, support, resistance]);

  return <div ref={containerRef} style={{ height }} className="w-full" />;
}