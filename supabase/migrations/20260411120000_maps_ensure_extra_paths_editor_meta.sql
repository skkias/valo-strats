-- Idempotent: ensure jsonb columns exist (run if overlays/labels never persisted).
alter table public.maps
  add column if not exists extra_paths jsonb not null default '[]'::jsonb;

alter table public.maps
  add column if not exists editor_meta jsonb not null default '{"show_reference_image":true,"spawn_markers":[],"location_labels":[]}'::jsonb;
