import Link from "next/link";
import { Radar, ShieldAlert, TrendingUp, Filter, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
      <main className="flex w-full max-w-3xl flex-col items-center gap-8 text-center">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Radar className="size-7" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">Radar AI</h1>
        </div>

        <p className="max-w-lg text-lg text-muted-foreground">
          Monitore o mercado. Filtre com lógica. Valide com estatísticas.
        </p>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button size="lg" render={<Link href="/login" />}>
            Entrar
          </Button>
          <Button variant="outline" size="lg" render={<Link href="/login?mode=signup" />}>
            Criar conta
          </Button>
        </div>

        <div className="grid w-full gap-3 sm:grid-cols-3">
          {[
            { icon: TrendingUp, title: "Motor técnico", desc: "EMA, RSI, MACD, ATR e Suporte/Resistência — determinístico e compartilhado com o backtest." },
            { icon: Filter, title: "Filtros + Score", desc: "Lateralidade, volatilidade e contraditórios com score transparente 0–100." },
            { icon: BarChart3, title: "Backtest", desc: "Valide por faixa de score, estratégia, horário e ativo. Curva de equity inclusa." },
          ].map((f) => (
            <Card key={f.title} className="border-border bg-card">
              <CardContent className="flex flex-col items-center gap-2 pt-6">
                <f.icon className="size-6 text-info" />
                <div className="text-sm font-semibold">{f.title}</div>
                <div className="text-xs leading-relaxed text-muted-foreground">{f.desc}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="w-full border-warn/40 bg-warn/5">
          <CardContent className="flex items-start gap-3 pt-5 text-left">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warn" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Este sistema é apenas para fins educacionais e informativos. Não constitui recomendação
              financeira, de investimento ou de trading. Você é responsável por suas próprias decisões.
              Day Trade envolve risco elevado de perda de capital.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}