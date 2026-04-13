-- Persisted defense-frame overlays (horizontal midline mirror of attack-frame layers).
-- NULL = legacy row (derive def layers from attack-side data at read until next coach save).
alter table public.maps
  add column if not exists extra_paths_def jsonb;
