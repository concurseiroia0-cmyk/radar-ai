# Radar AI

Radar de Day Trade com **motor técnico determinístico** + filtros + score 0–100 + **consenso multi-IA** + Paper Trading + Backtest.

> ⚠️ **Aviso:** sistema apenas para fins educacionais e informativos. Não constitui recomendação financeira, de investimento ou de trading. Day Trade envolve risco elevado de perda de capital.

## Regra de ouro

**O MESMO código que calcula sinais em tempo real roda o backtest** (`/src/lib/engine`). Não há duplicação de lógica entre tempo real e backtest. A IA **nunca decide sozinha**: o motor determinístico roda primeiro e só envia para as IAs quando `score >= score_minimo` (default 75), exigindo consenso (≥ 2/3) para o alerta no Telegram.

## Stack (100% gratuita)

- **Next.js 16 (App Router) + TypeScript** · Tailwind CSS + shadcn/ui (dark)
- **Supabase** — Auth + PostgreSQL + RLS + Realtime
- **Lightweight Charts** (gráficos) · **Recharts** (estatísticas) · **date-fns** · **papaparse** (CSV)
- **OpenRouter** (IAs gratuitas, fallback automático) · **Twelve Data → Finnhub** (mercado) · **Telegram Bot** (alertas)
- **cron-job.org** (agendamento — o cron é um endpoint HTTP, sem processo interno)

## Estrutura

```
/src
  /app                  páginas (landing, login, dashboard, ativo, sinais, backtest, paper, stats, config)
  /api                  cron, backtest/import|run|status, quota, telegram/test, paper/enter
  /components           charts, radar, backtest, paper, config + ui (shadcn)
  /lib
    /engine             MOTOR ÚNICO — aggregate, indicators, strategies, filters, score, engine
    /ai                 payload determinístico + consenso multi-IA
    /backtest/runner    backtest compartilhado (lotes de 5000, t+1 close, stats)
    /services           supabase, marketData, telegram, openrouter, nvidia, paperResolution
supabase/migrations/0001_init.sql   schema completo + RLS (colar no SQL Editor) — tudo no schema isolado `radar_ai`
```

## Rodar

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # build de produção
npx tsx scripts/engine-sanity.ts        # sanity checks do motor
npx tsx scripts/ai-consensus-test.ts    # teste real do consenso (OpenRouter)
```

### Sem chaves = modo demonstração

Sem `NEXT_PUBLIC_SUPABASE_URL` o app roda em **modo demonstração**: dados sintéticos (candles gerados com estrutura realista de mercado) processados pelo **motor real**, claramente marcados na UI. Tudo funciona: dashboard, gráfico, backtest, paper, stats.

## Configuração completa (produção)

> ⚠️ **Projeto Supabase compartilhado:** o Radar AI pode usar o MESMO projeto de outro app sem interferir em nada. Todo o schema vive no schema PostgreSQL isolado **`radar_ai`** (tabelas, funções, triggers e políticas) — nada em `public` é criado, alterado ou removido. A única coisa compartilhada é o login (tabela `auth.users`, padrão do Supabase).

1. **Supabase** (1ª vez): **Project Settings → API → Exposed schemas → adicione `radar_ai`** (obrigatório — sem isso a Data API ignora o schema). Depois, SQL Editor → cole `supabase/migrations/0001_init.sql` → pegue URL + anon key + service key.
2. **.env.local**: copie de `.env.example` e preencha (veja abaixo). A chave `SUPABASE_SERVICE_KEY` fica **só no servidor** — nunca no cliente.
3. **Dados**: chaves gratuitas Twelve Data (https://twelvedata.com) e/ou Finnhub (https://finnhub.io).
4. **IA**: `OPENROUTER_KEY` (modelos gratuitos com fallback automático — lista atualizada em `src/lib/services/openrouter.ts`, sobrescrevível via `OPROUTER_FREE_MODELS`).
5. **Telegram**: crie um bot com o @BotFather → `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` → teste em Configurações.
6. **Deploy**: Vercel/Netlify (gratuito) com as variáveis do `.env.example`.
7. **Cron**: no cron-job.org, agende `POST https://SEU-DOMINIO/api/cron` a cada **2 minutos** com header `x-cron-secret: SEU_CRON_SECRET`.

### Variáveis principais

| Variável | Obrigatória | Descrição |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` | sim | Supabase (sem elas → demo mode) |
| `SUPABASE_SERVICE_KEY` | produção | escrita server-side (cron, backtest) — sem ela cron/backtest não gravam |
| `TWELVEDATA_KEY` / `_KEY2` / `_KEY3`… | produção | candles 1m — multi-chave (800/dia cada): busca todos os ativos a cada ~2 min; chave 1 até o teto → 2 → 3 → só então Finnhub |
| `FINNHUB_KEY` | produção | fallback quando as chaves Twelve Data esgotam (não para os sinais) |
| `SIGNAL_MEMORY_*` | — | memória de estratégias (amostras/acerto mínimos p/ segurar combo frio) — ver .env.example |
| `OPENROUTER_KEY` | alertas IA | consenso multi-modelo (enriquece o alerta quando presente) |
| `TELEGRAM_BOT_TOKEN` / `CHAT_ID` | alertas | envio de TODO sinal técnico (consenso opcional via `TG_REQUIRE_CONSENSUS`) |
| `CRON_SECRET` | produção | protege `/api/cron` |
| janela de mercado | — | fixa no código (`src/lib/schedule.ts`): IQ Option em horário de Brasília (UTC−3) p/ forex + NYSE p/ ações |

## Motor

- **Indicadores**: EMA 9/21/50, RSI-14 (Wilder), MACD 12/26/9 (estado ±0.00005), ATR-14 (Wilder), ATR%, Suporte/Resistência por swing points, lateralidade, volatilidade (ATR% 0.03–0.25 conservador).
- **Estratégias**: Tendência+Pullback · Suporte/Resistência · Breakout (guarda anti-whipsaw) · **Confluência** (agrega as 3).
- **Filtros (ordem)**: lateral → estrutura confusa → sinais contraditórios → volatilidade → notícias (stub).
- **Score transparente 0–100**: Tendência +20 · Estrutura +20 · Confirmação +20 · Momentum +20 · Qualidade +20.

## Backtest

Resultado no fechamento do candle seguinte (**t+1, close-on-close, sem lookahead**), em lotes de 5.000 candles. Resultado com as 6 seções: KPI, desempenho por faixa de score (50–59 … 90–100), por estratégia, por horário, curva de equity e lista de operações.

## Paper Trading

Banca inicial R$ 500 · risco % configurável (default 1%) · payout 80% (`PAPER_PAYOUT_PCT`) · expiração = fechamento do próximo candle do timeframe · resolução automática (cron) → atualiza `profiles.banca`.
