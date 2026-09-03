import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  Check,
  Filter as FilterIcon,
  Gauge,
  Layers,
  X,
} from "lucide-react";
import type { Timeframe } from "@/lib/engine";
import { evaluateStrategies, fmt, scoreBandInfo } from "@/lib/engine";
import { getAssetPageData } from "@/lib/data-access";
import { DEMO_ASSETS } from "@/lib/demo-data";
import { plainOneLiner, sessionInfo } from "@/lib/plain-lang";
import { getProfile } from "@/lib/actions/profile";
import AutoRefresh from "@/components/app/AutoRefresh";
import CandlestickChart, { type SignalMarker } from "@/components/charts/CandlestickChart";
import ScoreBar from "@/components/radar/ScoreBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const TFS: Timeframe[] = ["1m", "5m", "15m"];

export default async function AssetPage({
  params,
  searchParams,
}: {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<{ tf?: string }>;
}) {
  const { symbol: raw } = await params;
  const symbol = decodeURIComponent(raw);
  const { tf } = await searchParams;
  const timeframe: Timeframe = TFS.includes(tf as Timeframe) ? (tf as Timeframe) : "5m";

  const valid = DEMO_ASSETS.some((a) => a.symbol === symbol);
  if (!valid) notFound();

  const [data, profile] = await Promise.all([getAssetPageData(symbol), getProfile()]);
  if (!data) notFound();

  const sessao = sessionInfo(profile?.sessao_inicio ?? 7, profile?.sessao_fim ?? 12);

  const candles = data.candles[timeframe];
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 6];
  const changePct = prev && last ? ((last.close - prev.close) / prev.close) * 100 : 0;

  const ready = candles.length >= 60;
  const pack = data.pack;
  const strategyEval = ready ? evaluateStrategies(pack, candles.slice(-400), candles.slice(-400).length - 1) : null;
  const band = scoreBandInfo(data.engine.score);
  const engine = data.engine;
  const confluences = engine.confluences;

  const markers: SignalMarker[] = data.signals.map((s) => ({
    ts: s.ts,
    direction: s.direction,
    score: s.score,
  }));

  const filterChips = [
    { label: "Lateralidade", ok: pack.trend !== "lateral" && pack.trend !== "indefinida" && !pack.isSideways, detail: pack.trend },
    { label: "Estrutura", ok: !(pack.support.length && pack.resistance.length && Math.abs(pack.support[0] - pack.resistance[0]) < pack.atr * 1.5), detail: `${pack.support.length}S / ${pack.resistance.length}R` },
    { label: "Contraditórios", ok: !(pack.trend === "alta" && pack.macd.state === "negativo" && pack.rsi < 40) && !(pack.trend === "baixa" && pack.macd.state === "positivo" && pack.rsi > 60), detail: "—" },
    { label: "Volatilidade", ok: pack.volOk, detail: `${pack.atrPercent.toFixed(2)}% ATR` },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" render={<Link href="/app" />}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{symbol}</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-semibold tabular-nums text-foreground">
                {last ? fmt(last.close, last.close < 10 ? 5 : 3) : "—"}
              </span>
              <span className={changePct >= 0 ? "text-call" : "text-put"}>
                {changePct >= 0 ? "+" : ""}
                {changePct.toFixed(2)}%
              </span>
              <span>• {timeframe}</span>
            </div>
          </div>
        </div>
        <AutoRefresh intervalMs={45000} />
        <div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
          {TFS.map((t) => (
            <Link
              key={t}
              href={`/app/ativo/${encodeURIComponent(symbol)}?tf=${t}`}
              className={`rounded-md px-3 py-1 text-sm transition-colors ${
                t === timeframe ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </Link>
          ))}
        </div>
      </div>

      {data.demo && (
        <div className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
          Dados de demonstração — candles sintéticos processados pelo motor real.
        </div>
      )}

      {!data.demo && (
        <div
          className={`rounded-lg border px-3 py-2 text-xs ${
            sessao.active ? "border-call/40 bg-call/10 text-call" : "border-warn/40 bg-warn/10 text-warn"
          }`}
        >
          {sessao.active
            ? `Sessão ativa (${sessao.windowUtc} / ${sessao.windowBrt}) — candles novos entram a cada ~2 min, página atualiza sozinha.`
            : `Fora da janela de sinais (${sessao.windowUtc} / ${sessao.windowBrt}) — o gráfico fica parado porque o mercado não está sendo buscado agora${
                sessao.nextStartBrt ? `. Próxima sessão às ${sessao.nextStartBrt} (Brasília).` : "."
              }`}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Gráfico */}
        <div className="lg:col-span-2">
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                {symbol} — {timeframe}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CandlestickChart
                candles={candles.slice(-300)}
                signals={markers}
                support={pack.support}
                resistance={pack.resistance}
                height={440}
              />
              {last && (
                <div className="mt-2 text-xs text-muted-foreground">
                  Última vela fechada: {new Date(last.ts * 1000).toISOString().slice(11, 16)} UTC — o gráfico mostra
                  candles já fechados; o preço mexe quando uma vela nova fecha{!data.demo && sessao.active ? " (a cada ~2 min)" : ""}.
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-4 rounded bg-ema9" /> EMA 9
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-4 rounded bg-ema21" /> EMA 21
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-4 rounded bg-ema50" /> EMA 50
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-4 border-t border-dashed border-[#a9b3c0]" /> S/R zones
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Painel direito */}
        <div className="space-y-4">
          {/* SCORE */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Gauge className="size-4 text-info" /> SCORE
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-4xl font-bold tabular-nums" style={{ color: band.color }}>
                  {engine.score}
                </span>
              <div className="flex-1">
                  <ScoreBar score={engine.score} size="lg" showLabel={false} />
                  <div className="mt-1 text-xs text-muted-foreground">
                    {band.emoji} {band.label} {engine.valid && engine.score >= 75 && "— elegível p/ alerta"}
                  </div>
                </div>
              </div>
              {ready && (
                <p className="rounded-lg bg-surface px-3 py-2 text-sm leading-relaxed text-foreground/90">
                  {plainOneLiner(engine, pack)}
                </p>
              )}
              <div className="space-y-1.5 border-t border-border pt-3">
                {confluences.length ? (
                  confluences.map((c) => (
                    <div key={c.label} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        {c.passed ? <Check className="size-3.5 text-call" /> : <X className="size-3.5 text-muted-foreground/50" />}
                        {c.label}
                      </span>
                      <span className={c.passed ? "font-semibold text-call" : "text-muted-foreground"}>
                        {c.passed ? `+${c.points}` : "+0"}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-muted-foreground">
                    {ready
                      ? "Motor sem sinal válido agora — confira os filtros abaixo."
                      : "Dados insuficientes para o motor (mín. 60 candles)."}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* FILTROS */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <FilterIcon className="size-4 text-info" /> FILTROS
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {filterChips.map((f) => (
                <Badge
                  key={f.label}
                  variant="outline"
                  className={
                    f.ok
                      ? "border-call/40 bg-call/10 text-call"
                      : "border-put/40 bg-put/10 text-put"
                  }
                >
                  {f.ok ? "✓" : "✗"} {f.label} {f.detail && `(${f.detail})`}
                </Badge>
              ))}
            </CardContent>
          </Card>

          {/* INDICADORES */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Layers className="size-4 text-info" /> INDICADORES
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-surface px-3 py-2">
                <div className="text-xs text-muted-foreground">RSI (14)</div>
                <div className="font-semibold tabular-nums">{Math.round(pack.rsi)}</div>
              </div>
              <div className="rounded-lg bg-surface px-3 py-2">
                <div className="text-xs text-muted-foreground">MACD</div>
                <div
                  className={`font-semibold ${
                    pack.macd.state === "positivo"
                      ? "text-call"
                      : pack.macd.state === "negativo"
                        ? "text-put"
                        : ""
                  }`}
                >
                  {pack.macd.state === "positivo" ? "▲ Positivo" : pack.macd.state === "negativo" ? "▼ Negativo" : "● Zero"}
                </div>
              </div>
              <div className="rounded-lg bg-surface px-3 py-2">
                <div className="text-xs text-muted-foreground">ATR (14)</div>
                <div className="font-semibold tabular-nums">{fmt(pack.atr)}</div>
              </div>
              <div className="rounded-lg bg-surface px-3 py-2">
                <div className="text-xs text-muted-foreground">ATR %</div>
                <div className="font-semibold tabular-nums">{pack.atrPercent.toFixed(3)}%</div>
              </div>
              <div className="col-span-2 rounded-lg bg-surface px-3 py-2">
                <div className="text-xs text-muted-foreground">Suporte / Resistência</div>
                <div className="flex gap-3 tabular-nums">
                  <span className="text-call">S: {pack.support.length ? pack.support.map((s) => fmt(s)).join(", ") : "—"}</span>
                  <span className="text-put">R: {pack.resistance.length ? pack.resistance.map((r) => fmt(r)).join(", ") : "—"}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ESTRATÉGIAS */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">ESTRATÉGIAS</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(strategyEval?.hits ?? []).map((h) => (
                <div key={h.name} className="rounded-lg border border-border px-3 py-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className={h.passed ? "font-semibold text-call" : "text-muted-foreground"}>
                      {h.passed ? "✓" : "—"} {h.name}
                    </span>
                    <span className="text-muted-foreground tabular-nums">peso {h.weight}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{h.reason}</div>
                </div>
              ))}
              {!strategyEval && (
                <div className="text-xs text-muted-foreground">Dados insuficientes para avaliar estratégias.</div>
              )}
            </CardContent>
          </Card>

          {/* IA — placeholder Prompt 2 */}
          <Card className="border-border border-dashed bg-card/50">
            <CardContent className="flex items-start gap-3 pt-5">
              <Bot className="size-4 shrink-0 text-muted-foreground" />
              <div className="text-xs leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">IA + Consenso</span>
                <br />
                Análise multi-modelo e consenso disponíveis após o Prompt 2. Sinais com score ≥ 75 são
                validados por 3 IAs antes do alerta no Telegram.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}