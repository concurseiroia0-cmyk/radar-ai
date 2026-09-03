"use client";

import Link from "next/link";
import { ArrowUpRight, TrendingDown, TrendingUp, Minus } from "lucide-react";
import type { DemoAssetSnapshot } from "@/lib/demo-data";
import { fmt } from "@/lib/engine";
import { plainVerdict } from "@/lib/plain-lang";
import { Card, CardContent } from "@/components/ui/card";

interface SimpleBoardProps {
  snapshots: DemoAssetSnapshot[];
}

const KIND_META = {
  call: { badge: "border-call/60 bg-call/15 text-call", icon: <TrendingUp className="size-4" />, bar: "#22c55e" },
  put: { badge: "border-put/60 bg-put/15 text-put", icon: <TrendingDown className="size-4" />, bar: "#ef4444" },
  wait: { badge: "border-warn/50 bg-warn/10 text-warn", icon: <Minus className="size-4" />, bar: "#f59e0b" },
} as const;

export default function SimpleBoard({ snapshots }: SimpleBoardProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {snapshots.map((s) => {
          const v = plainVerdict(s.engine, s.pack, s.asset.symbol);
          const meta = KIND_META[v.kind];
          return (
            <Link key={s.asset.symbol} href={`/app/ativo/${encodeURIComponent(s.asset.symbol)}`} className="group">
              <Card className="h-full border-border bg-card transition-colors group-hover:border-info/60">
                <CardContent className="space-y-3 pt-5">
                  {/* Cabeçalho: ativo + preço */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 font-semibold">
                        {s.asset.symbol}
                        <ArrowUpRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                        {fmt(s.price, s.price < 10 ? 5 : 3)}
                        <span className={s.changePct >= 0 ? "ml-1.5 text-call" : "ml-1.5 text-put"}>
                          {s.changePct >= 0 ? "+" : ""}
                          {s.changePct.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                    {/* Selo da recomendação */}
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-bold ${meta.badge}`}
                    >
                      {meta.icon}
                      {v.headline}
                    </span>
                  </div>

                  {/* Força */}
                  <div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${Math.max(2, Math.min(100, v.score))}%`, background: meta.bar }}
                      />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {v.strong ? "Força boa" : v.kind === "wait" ? "Sem sinal" : "Sinal fraco"}
                      </span>
                      <span className="font-semibold tabular-nums">{v.score}/100</span>
                    </div>
                  </div>

                  {/* Resumo em linguagem simples */}
                  <p className="text-sm leading-relaxed text-muted-foreground">{v.summary}</p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Análise técnica automática — não é garantia de lucro. Pratique primeiro no{" "}
        <Link href="/app/paper" className="text-info hover:underline">
          Paper Trading
        </Link>
        .
      </p>
    </div>
  );
}