-- ============================================================================
-- RADAR AI — Migration 0001 (Núcleo + Backtest + Paper + IA)
-- Rodar no SQL Editor do Supabase (Dashboard > SQL Editor > New query).
-- Convenções:
--   * ts é SEMPRE unix epoch em SEGUNDOS (int8) — consistente entre
--     agregação (1m->5m->15m) e comparação.
--   * open/high/low/close/entry_price/banca/pnl são numeric (decimal).
--   * RLS ATIVO em todas as tabelas com dados de usuário.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. profiles (estende auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  banca numeric not null default 500.00,
  risco_pct numeric not null default 1.00,
  telegram_chat_id text,
  score_minimo int not null default 75,
  sessao_inicio int not null default 7,  -- hora 0–23
  sessao_fim int not null default 12,    -- hora 0–23
  ativos_ativos jsonb not null default '["EUR/USD","GBP/USD","USD/JPY","AUD/USD","EUR/JPY","GBP/JPY"]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. assets
-- ---------------------------------------------------------------------------
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  symbol text not null unique,  -- ex.: EUR/USD
  active boolean not null default true,
  type text not null default 'forex',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. candles
-- ---------------------------------------------------------------------------
create table if not exists public.candles (
  asset_id uuid not null references public.assets (id) on delete cascade,
  timeframe text not null check (timeframe in ('1m','5m','15m')),
  ts bigint not null,  -- unix epoch SECONDS
  open numeric not null,
  high numeric not null,
  low numeric not null,
  close numeric not null,
  volume numeric,
  primary key (asset_id, timeframe, ts)
);
create index if not exists idx_candles_asset_tf_ts on public.candles (asset_id, timeframe, ts desc);
create index if not exists idx_candles_ts on public.candles (ts);

-- ---------------------------------------------------------------------------
-- 4. signals
-- ---------------------------------------------------------------------------
create table if not exists public.signals (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets (id) on delete cascade,
  timeframe text not null check (timeframe in ('1m','5m','15m')),
  direction text not null check (direction in ('CALL','PUT')),
  score int not null check (score between 0 and 100),
  strategy text,
  confluences jsonb,
  ai_consensus jsonb not null default '{}', -- preparado p/ Prompt 2
  ai_pass boolean not null default false,   -- preparado p/ Prompt 2
  entry_price numeric not null,
  result text not null default 'pending' check (result in ('pending','win','loss','void')),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_signals_asset_created on public.signals (asset_id, created_at desc);
create index if not exists idx_signals_result on public.signals (result);
create index if not exists idx_signals_created on public.signals (created_at);

-- ---------------------------------------------------------------------------
-- 5. ai_analyses (preparado — populado pelo consenso no Prompt 2)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_analyses (
  id uuid primary key default gen_random_uuid(),
  signal_id uuid not null references public.signals (id) on delete cascade,
  model text not null,
  direction text,
  reasoning text,
  confidence numeric,
  latency_ms int,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 6. backtests
-- ---------------------------------------------------------------------------
create table if not exists public.backtests (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets (id) on delete cascade,
  timeframe text not null check (timeframe in ('1m','5m','15m')),
  periodo_inicio date,
  periodo_fim date,
  params jsonb,
  stats jsonb not null default '{}',
  status text not null default 'idle' check (status in ('idle','running','done','error')),
  error_msg text,
  progress int not null default 0,
  total_candles int not null default 0,
  processed int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 7. backtest_trades
-- ---------------------------------------------------------------------------
create table if not exists public.backtest_trades (
  id uuid primary key default gen_random_uuid(),
  backtest_id uuid not null references public.backtests (id) on delete cascade,
  ts bigint not null,
  direction text not null check (direction in ('CALL','PUT')),
  score int not null,
  strategy text,
  entry_price numeric not null,
  result text not null check (result in ('win','loss','void')),
  created_at timestamptz not null default now()
);
create index if not exists idx_bt_trades_backtest_ts on public.backtest_trades (backtest_id, ts);
create index if not exists idx_bt_trades_backtest_score on public.backtest_trades (backtest_id, score);

-- ---------------------------------------------------------------------------
-- 8. paper_trades (estrutura pronta — lógica no Prompt 2)
-- ---------------------------------------------------------------------------
create table if not exists public.paper_trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  signal_id uuid references public.signals (id) on delete set null,
  stake numeric not null default 0,
  entry_price numeric not null,
  direction text not null check (direction in ('CALL','PUT')),
  result text not null default 'pending' check (result in ('pending','win','loss','void')),
  pnl numeric not null default 0,
  expires_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_paper_trades_user on public.paper_trades (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 9a. cron_state (gatilho de decisão: só processa quando um candle 5m FECHOU)
-- ---------------------------------------------------------------------------
create table if not exists public.cron_state (
  asset_id uuid primary key references public.assets (id) on delete cascade,
  last_5m_ts bigint not null default 0,  -- último ts 5m já processado
  updated_at timestamptz not null default now()
);
alter table public.cron_state enable row level security;
create policy "cron_state_select_auth" on public.cron_state
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- 9. news_events (opcional — estrutura mínima)
-- ---------------------------------------------------------------------------
create table if not exists public.news_events (
  id uuid primary key default gen_random_uuid(),
  ts bigint not null,
  title text,
  impact text,
  currency text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.assets enable row level security;
alter table public.candles enable row level security;
alter table public.signals enable row level security;
alter table public.ai_analyses enable row level security;
alter table public.backtests enable row level security;
alter table public.backtest_trades enable row level security;
alter table public.paper_trades enable row level security;
alter table public.news_events enable row level security;

-- profiles: próprio usuário (select/update/insert)
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- paper_trades: próprio usuário
create policy "paper_trades_select_own" on public.paper_trades
  for select using (auth.uid() = user_id);
create policy "paper_trades_insert_own" on public.paper_trades
  for insert with check (auth.uid() = user_id);
create policy "paper_trades_update_own" on public.paper_trades
  for update using (auth.uid() = user_id);

-- Leitura para usuários autenticados; escrita APENAS via Service Role (rotas server-side).
-- Nunca exponha chaves service no cliente.
create policy "assets_select_auth" on public.assets
  for select to authenticated using (true);
create policy "candles_select_auth" on public.candles
  for select to authenticated using (true);
create policy "signals_select_auth" on public.signals
  for select to authenticated using (true);
create policy "ai_analyses_select_auth" on public.ai_analyses
  for select to authenticated using (true);
create policy "backtests_select_auth" on public.backtests
  for select to authenticated using (true);
create policy "backtest_trades_select_auth" on public.backtest_trades
  for select to authenticated using (true);
create policy "news_events_select_auth" on public.news_events
  for select to authenticated using (true);

-- ============================================================================
-- TRIGGER updated_at
-- ============================================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_backtests_updated on public.backtests;
create trigger trg_backtests_updated
  before update on public.backtests
  for each row execute function public.set_updated_at();

-- ============================================================================
-- SEED — 6 ativos iniciais (active true)
-- ============================================================================
insert into public.assets (symbol, active, type) values
  ('EUR/USD', true, 'forex'),
  ('GBP/USD', true, 'forex'),
  ('USD/JPY', true, 'forex'),
  ('AUD/USD', true, 'forex'),
  ('EUR/JPY', true, 'forex'),
  ('GBP/JPY', true, 'forex')
on conflict (symbol) do nothing;

-- ============================================================================
-- FUNÇÕES DE APOIO (server-side / service role)
-- ============================================================================

-- Garante que o profile exista (chamado no login via server action).
create or replace function public.ensure_profile()
returns trigger language plpgsql as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Trigger automático: cria profile na primeira autenticação.
drop trigger if exists trg_on_auth_user on auth.users;
create trigger trg_on_auth_user
  after insert on auth.users
  for each row execute function public.ensure_profile();

-- Consulta rápida de sinais recentes por ativo (usada no dashboard).
create or replace function public.recent_signals(p_asset_id uuid, p_limit int default 20)
returns setof public.signals language sql stable as $$
  select * from public.signals
  where asset_id = p_asset_id
  order by created_at desc
  limit p_limit;
$$;

-- Ajuste de banca do paper trading (usado pelo resolver de expiração).
create or replace function public.adjust_banca(p_user_id uuid, p_pnl numeric)
returns numeric language plpgsql security definer as $$
declare
  v_banca numeric;
begin
  update public.profiles
  set banca = greatest(0, banca + p_pnl), updated_at = now()
  where id = p_user_id
  returning banca into v_banca;
  return v_banca;
end;
$$;