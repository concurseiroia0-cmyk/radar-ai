"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface EquityCurveProps {
  equity: number[];
  label?: string;
  height?: number;
}

export default function EquityCurve({ equity, label = "Equity (base 100)", height = 280 }: EquityCurveProps) {
  if (!equity.length) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        Sem dados de equity
      </div>
    );
  }
  // downsample para no máximo ~600 pontos (gráfico leve)
  const step = Math.max(1, Math.floor(equity.length / 600));
  const data = equity
    .map((v, i) => ({ i, v }))
    .filter((_, i) => i % step === 0 || i === equity.length - 1)
    .map(({ i, v }) => ({ trade: i, valor: Number(v.toFixed(2)) }));

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#16c784" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#16c784" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(42,49,60,0.5)" />
          <XAxis
            dataKey="trade"
            stroke="#2a313c"
            tick={{ fill: "#a9b3c0", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#2a313c" }}
            label={{ value: "Trade", position: "insideBottomRight", fill: "#a9b3c0", fontSize: 11, offset: -2 }}
          />
          <YAxis
            domain={["auto", "auto"]}
            stroke="#2a313c"
            tick={{ fill: "#a9b3c0", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={50}
          />
          <Tooltip
            contentStyle={{
              background: "#161b22",
              border: "1px solid #2a313c",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "#a9b3c0" }}
            formatter={(v) => [Number(v).toFixed(2), label]}
            labelFormatter={(l) => `Trade ${l}`}
          />
          <Area
            type="monotone"
            dataKey="valor"
            stroke="#16c784"
            strokeWidth={2}
            fill="url(#equityFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}