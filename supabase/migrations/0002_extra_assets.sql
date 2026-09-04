-- ============================================================================
-- RADAR AI — Migration 0002 (novos ativos + horários IQ Option)
-- Rodar no SQL Editor do Supabase (Dashboard > SQL Editor > New query).
--
-- Adiciona ao radar: EUR/GBP, USD/CHF, AUD/JPY, USD/CAD (forex) e
-- AAPL, TSLA, NVDA (ações dos EUA). Os HORÁRIOS de mercado agora são
-- fixos no código (src/lib/schedule.ts):
--   forex → janela da IQ Option EM HORÁRIO DE BRASÍLIA/UTC−3
--   (Seg–Qui 00–15:30 e 22–23:59, Sex até 15:30, Dom 22–23:59, Sáb fechado)
--   ações → pregão NYSE (Seg–Sex 09:30–16:00 Nova York)
-- Não há mais config de janela por perfil (sessao_inicio/fim ficam
-- obsoletos mas a coluna é mantida p/ compatibilidade).
-- ============================================================================

insert into radar_ai.assets (symbol, active, type) values
  ('EUR/GBP', true, 'forex'),
  ('USD/CHF', true, 'forex'),
  ('AUD/JPY', true, 'forex'),
  ('USD/CAD', true, 'forex'),
  ('XAU/USD', true, 'forex'),
  ('AAPL', true, 'stock'),
  ('TSLA', true, 'stock'),
  ('NVDA', true, 'stock')
on conflict (symbol) do nothing;

-- Novos perfis já nascem com a lista completa.
alter table radar_ai.profiles
  alter column ativos_ativos
  set default '["EUR/USD","GBP/USD","USD/JPY","AUD/USD","EUR/JPY","GBP/JPY","EUR/GBP","USD/CHF","AUD/JPY","USD/CAD","XAU/USD","AAPL","TSLA","NVDA"]';
