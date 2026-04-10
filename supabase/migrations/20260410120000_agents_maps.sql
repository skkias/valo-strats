-- Catalog: agents & maps for coach UI and strat references.
-- Run in Supabase SQL Editor or via CLI. Idempotent where possible.

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  role text not null,
  sort_order int not null default 0
);

create table if not exists public.maps (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default (timezone('utc', now())),
  slug text not null unique,
  name text not null,
  reference_image_url text,
  image_transform jsonb not null default '{"scale":1,"tx":0,"ty":0}'::jsonb,
  view_box text not null default '0 0 1000 1000',
  path_atk text,
  path_def text,
  sort_order int not null default 0
);

alter table public.strats
  add column if not exists map_id uuid references public.maps (id) on delete set null;

create index if not exists strats_map_id_idx on public.strats (map_id);

alter table public.agents enable row level security;
alter table public.maps enable row level security;

drop policy if exists "agents_select_all" on public.agents;
create policy "agents_select_all" on public.agents
  for select using (true);

drop policy if exists "maps_select_all" on public.maps;
create policy "maps_select_all" on public.maps
  for select using (true);

-- Seed agents (Valorant roster — adjust in Supabase as new agents ship)
insert into public.agents (slug, name, role, sort_order) values
  ('astra', 'Astra', 'Controller', 10),
  ('breach', 'Breach', 'Initiator', 20),
  ('brimstone', 'Brimstone', 'Controller', 30),
  ('chamber', 'Chamber', 'Sentinel', 40),
  ('cypher', 'Cypher', 'Sentinel', 50),
  ('deadlock', 'Deadlock', 'Sentinel', 60),
  ('fade', 'Fade', 'Initiator', 70),
  ('gekko', 'Gekko', 'Initiator', 80),
  ('harbor', 'Harbor', 'Controller', 90),
  ('iso', 'Iso', 'Duelist', 100),
  ('jett', 'Jett', 'Duelist', 110),
  ('kayo', 'KAY/O', 'Initiator', 120),
  ('killjoy', 'Killjoy', 'Sentinel', 130),
  ('neon', 'Neon', 'Duelist', 140),
  ('omen', 'Omen', 'Controller', 150),
  ('phoenix', 'Phoenix', 'Duelist', 160),
  ('raze', 'Raze', 'Duelist', 170),
  ('reyna', 'Reyna', 'Duelist', 180),
  ('sage', 'Sage', 'Sentinel', 190),
  ('skye', 'Skye', 'Initiator', 200),
  ('sova', 'Sova', 'Initiator', 210),
  ('tejo', 'Tejo', 'Initiator', 220),
  ('viper', 'Viper', 'Controller', 230),
  ('vyse', 'Vyse', 'Sentinel', 240),
  ('waylay', 'Waylay', 'Duelist', 250),
  ('yoru', 'Yoru', 'Duelist', 260)
on conflict (slug) do nothing;

-- Competitive map pool (names only — add reference art & paths in coach UI)
insert into public.maps (slug, name, sort_order) values
  ('abyss', 'Abyss', 10),
  ('ascent', 'Ascent', 20),
  ('bind', 'Bind', 30),
  ('breeze', 'Breeze', 40),
  ('corrode', 'Corrode', 50),
  ('fracture', 'Fracture', 60),
  ('haven', 'Haven', 70),
  ('icebox', 'Icebox', 80),
  ('lotus', 'Lotus', 90),
  ('pearl', 'Pearl', 100),
  ('piazza', 'Piazza', 110),
  ('split', 'Split', 120),
  ('sunset', 'Sunset', 130)
on conflict (slug) do nothing;
