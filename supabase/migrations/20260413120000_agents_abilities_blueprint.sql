-- Coach-defined ability silhouettes (trap zones, smokes, rays, paths, etc.) for lineup-style tooling.
alter table public.agents
  add column if not exists abilities_blueprint jsonb not null default '[]'::jsonb;
