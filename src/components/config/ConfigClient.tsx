"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound, Loader2, Newspaper, Radar, Send, Settings2, Timer } from "lucide-react";
import type { ProfileData } from "@/lib/actions/profile";
import { updateProfile } from "@/lib/actions/profile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FOREX_SYMBOLS, STOCK_SYMBOLS } from "@/lib/assets";

interface ConfigClientProps {
  initial: ProfileData;
  demo: boolean;
}

const STORAGE_KEY = "radar-ai-demo-config";

export default function ConfigClient({ initial, demo }: ConfigClientProps) {
  const [profile, setProfile] = useState<ProfileData>(initial);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [newsBefore, setNewsBefore] = useState(0);
  const [newsAfter, setNewsAfter] = useState(0);

  useEffect(() => {
    if (!demo) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setProfile((p) => ({ ...p, ...JSON.parse(raw) }));
    } catch {
      /* ignore */
    }
  }, [demo]);

  const save = async (patch: Partial<ProfileData>, msg = "Configurações salvas") => {
    setSaving(true);
    if (demo) {
      const next = { ...profile, ...patch };
      setProfile(next);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      toast.success(`${msg} (demo — salvo neste navegador)`);
      setSaving(false);
      return;
    }
    const res = await updateProfile(patch);
    if (res.ok) {
      setProfile((p) => ({ ...p, ...patch }));
      toast.success(msg);
    } else {
      toast.error(res.error ?? "Falha ao salvar");
    }
    setSaving(false);
  };

  const toggleAsset = (symbol: string) => {
    const active = profile.ativos_ativos.includes(symbol);
    const next = active
      ? profile.ativos_ativos.filter((s) => s !== symbol)
      : [...profile.ativos_ativos, symbol];
    save({ ativos_ativos: next }, "Radar atualizado");
  };

  const testTelegram = async (full = false) => {
    setTesting(true);
    try {
      const res = await fetch("/api/telegram/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: profile.telegram_chat_id || undefined, full }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (json.ok) toast.success("✅ Enviado — verifique seu Telegram");
      else toast.error(json.error ?? "Falha no teste");
    } catch {
      toast.error("Erro de rede");
    } finally {
      setTesting(false);
    }
  };

  return (
    <Tabs defaultValue="risco" className="w-full">
      <TabsList className="mb-4 flex-wrap h-auto">
        <TabsTrigger value="risco">Risco</TabsTrigger>
        <TabsTrigger value="radar">Radar</TabsTrigger>
        <TabsTrigger value="sessao">Horários</TabsTrigger>
        <TabsTrigger value="telegram">Telegram</TabsTrigger>
        <TabsTrigger value="apis">APIs</TabsTrigger>
        <TabsTrigger value="noticias">Notícias</TabsTrigger>
      </TabsList>

      {/* ---------------- RISCO ---------------- */}
      <TabsContent value="risco">
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Settings2 className="size-4 text-info" /> Risco
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Banca (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={profile.banca}
                onChange={(e) => setProfile({ ...profile, banca: Number(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Risco % por operação</Label>
              <Input
                type="number"
                step="0.1"
                min="0.1"
                max="10"
                value={profile.risco_pct}
                onChange={(e) => setProfile({ ...profile, risco_pct: Number(e.target.value) || 1 })}
              />
            </div>
            <div className="flex flex-col justify-end space-y-1.5">
              <div className="rounded-lg border border-info/40 bg-info/10 px-3 py-2 text-sm">
                Risco R$ por operação:{" "}
                <span className="font-bold text-info">
                  R$ {((profile.banca * profile.risco_pct) / 100).toFixed(2)}
                </span>
              </div>
            </div>
            <div className="sm:col-span-3">
              <Button
                onClick={() =>
                  save({ banca: profile.banca, risco_pct: profile.risco_pct }, "Risco atualizado")
                }
                disabled={saving}
              >
                {saving && <Loader2 className="size-4 animate-spin" />} Salvar risco
              </Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* ---------------- RADAR ---------------- */}
      <TabsContent value="radar">
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Radar className="size-4 text-info" /> Radar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { title: "Forex — janela IQ Option", symbols: FOREX_SYMBOLS },
              { title: "Ações EUA — pregão NYSE", symbols: STOCK_SYMBOLS },
            ].map((group) => (
              <div key={group.title} className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {group.symbols.map((a) => (
                    <div
                      key={a}
                      className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2"
                    >
                      <span className="text-sm font-medium">{a}</span>
                      <Switch
                        checked={profile.ativos_ativos.includes(a)}
                        onCheckedChange={() => toggleAsset(a)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Score mínimo p/ alerta (default 75)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={profile.score_minimo}
                  onChange={(e) => setProfile({ ...profile, score_minimo: Number(e.target.value) || 0 })}
                />
              </div>
            </div>
            <Button onClick={() => save({ score_minimo: profile.score_minimo }, "Radar atualizado")} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />} Salvar radar
            </Button>
          </CardContent>
        </Card>
      </TabsContent>

      {/* ---------------- HORÁRIOS ---------------- */}
      <TabsContent value="sessao">
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Timer className="size-4 text-info" /> Horários de mercado (fixos — economiza cota)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-relaxed text-muted-foreground">
            <div>
              <p className="font-medium text-foreground">Forex — horário da IQ Option (horário de Brasília, UTC−3)</p>
              <p className="mt-0.5">Seg–Qui 00:00–15:30 e 22:00–23:59 · Sex 00:00–15:30 · Dom 22:00–23:59 · Sáb fechado.</p>
              <p className="mt-0.5">= em UTC: Seg–Sex 01h00–18h30 (contínuo) · Sáb–Dom fechado.</p>
            </div>
            <div>
              <p className="font-medium text-foreground">Ações EUA (AAPL, TSLA, NVDA)</p>
              <p className="mt-0.5">Seg–Sex 09h30–16h00 em Nova York (horário de verão americano incluso).</p>
            </div>
            <p>
              O Radar só busca candles e gera sinais dentro dessas janelas — fora delas não consome cota da API e a
              página avisa quando o mercado reabre.
            </p>
          </CardContent>
        </Card>
      </TabsContent>

      {/* ---------------- TELEGRAM ---------------- */}
      <TabsContent value="telegram">
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Send className="size-4 text-info" /> Telegram
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Bot Token (env ou campo acima)</Label>
                <Input type="password" placeholder="123456:ABC-DEF…" defaultValue="" />
                <p className="text-xs text-muted-foreground">
                  Token: variável de ambiente TELEGRAM_BOT_TOKEN (nunca salvo no banco).
                  {profile.telegram_configured ? " ✓ configurado" : " ✗ não configurado"}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Chat ID</Label>
                <Input
                  value={profile.telegram_chat_id}
                  onChange={(e) => setProfile({ ...profile, telegram_chat_id: e.target.value })}
                  placeholder="123456789"
                />
                <p className="text-xs text-muted-foreground">
                  Seu chat id (veja com @userinfobot). Usado pelo cron quando o servidor não tem
                  TELEGRAM_CHAT_ID — o token sempre vem do env TELEGRAM_BOT_TOKEN.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => save({ telegram_chat_id: profile.telegram_chat_id }, "Chat ID salvo")} disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" />} Salvar
              </Button>
              <Button variant="outline" onClick={() => testTelegram(false)} disabled={testing}>
                {testing ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Testar Conexão
              </Button>
              <Button variant="outline" onClick={() => testTelegram(true)} disabled={testing}>
                {testing ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Alerta de exemplo
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              O teste chama /api/telegram/test e envia "✅ Teste de conexão – Radar AI".
            </p>
          </CardContent>
        </Card>
      </TabsContent>

      {/* ---------------- APIs ---------------- */}
      <TabsContent value="apis">
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <KeyRound className="size-4 text-info" /> APIs (chaves só no backend / env)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { name: "Twelve Data", ok: profile.apis.twelvedata, desc: "Dados de mercado (primário)" },
              { name: "Finnhub", ok: profile.apis.finnhub, desc: "Dados de mercado (fallback)" },
              { name: "OpenRouter", ok: profile.apis.openrouter, desc: "IAs gratuitas (consenso)" },
              { name: "NVIDIA", ok: profile.apis.nvidia, desc: "IA opcional (NIM)" },
              { name: "Telegram", ok: profile.apis.telegram, desc: "Alertas" },
            ].map((api) => (
              <div key={api.name} className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2">
                <div>
                  <div className="text-sm font-medium">{api.name}</div>
                  <div className="text-xs text-muted-foreground">{api.desc}</div>
                </div>
                <Badge variant="outline" className={api.ok ? "border-call/40 text-call" : "border-border text-muted-foreground"}>
                  {api.ok ? "✓ Configurada" : "— Sem chave"}
                </Badge>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Configure as chaves no arquivo .env.local (nunca no cliente). Este painel apenas indica o status.
            </p>
          </CardContent>
        </Card>
      </TabsContent>

      {/* ---------------- NOTÍCIAS ---------------- */}
      <TabsContent value="noticias">
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Newspaper className="size-4 text-info" /> Notícias (estrutura)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Pausa X min ANTES de evento de alto impacto</Label>
                <Input type="number" min={0} value={newsBefore} onChange={(e) => setNewsBefore(Number(e.target.value) || 0)} />
              </div>
              <div className="space-y-1.5">
                <Label>Pausa X min DEPOIS de evento de alto impacto</Label>
                <Input type="number" min={0} value={newsAfter} onChange={(e) => setNewsAfter(Number(e.target.value) || 0)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Estrutura pronta no motor (filters.ts → checkNewsBlock). A consulta real a eventos
              (tabela news_events) entra em uma próxima fase — o sistema não trava sem ela.
            </p>
            <Button variant="outline" disabled>
              Salvar (disponível com feed de notícias)
            </Button>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}