-- Optional overlay polygons (obstacles, elevation) for map editor.
alter table public.maps
  add column if not exists extra_paths jsonb not null default '[]'::jsonb;
