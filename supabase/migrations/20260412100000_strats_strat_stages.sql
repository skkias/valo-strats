-- Multi-stage strat layout (agent + ability pins on the map), JSON in-app.
alter table public.strats
  add column if not exists strat_stages jsonb not null default '[]'::jsonb;
