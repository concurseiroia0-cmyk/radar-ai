-- ============================================================================
-- RADAR AI — Migration 0003 (XAU/USD fora da IQ Option → NZD/USD)
-- Rodar no SQL Editor do Supabase (Dashboard > SQL Editor > New query) ou
-- aplicar via scripts/apply-asset-swap.ts (REST + service key).
--
-- O usuário só opera o que EXISTE na IQ Option. XAU/USD (ouro) NÃO está lá;
-- sai do radar. Entra NZD/USD (par forex major, disponível na IQ Option).
--
-- Ações: desativa o ativo (mantém candles históricos p/ não quebrar FK) e
-- remove o símbolo do ativos_ativos de todos os perfis, adicionando NZD/USD.
-- Idempotente.
-- ============================================================================

update radar_ai.assets set active = false where symbol = 'XAU/USD';

insert into radar_ai.assets (symbol, active, type)
values ('NZD/USD', true, 'forex')
on conflict (symbol) do update set active = true, type = 'forex';

-- Perfis: remove XAU/USD e garante NZD/USD na lista (sem duplicar).
update radar_ai.profiles
set ativos_ativos = (
  select jsonb_agg(x order by ord)
  from (
    select x, ord
    from jsonb_array_elements_text(
      case
        when ativos_ativos is null then '[]'::jsonb
        else ativos_ativos
      end
    ) with ordinality as t(x, ord)
    where x <> 'XAU/USD'
  ) s
)
where ativos_ativos is not null;

update radar_ai.profiles
set ativos_ativos = ativos_ativos || '["NZD/USD"]'::jsonb
where ativos_ativos is not null
  and not (ativos_ativos @> '["NZD/USD"]'::jsonb);

-- Padrão para perfis novos.
alter table radar_ai.profiles
  alter column ativos_ativos
  set default '["EUR/USD","GBP/USD","USD/JPY","AUD/USD","EUR/JPY","GBP/JPY","EUR/GBP","USD/CHF","AUD/JPY","USD/CAD","NZD/USD","AAPL","TSLA","NVDA"]';
