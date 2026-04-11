-- Optional HTTPS URL to a square portrait / "face card" image per agent (coach-managed).
alter table public.agents
  add column if not exists portrait_url text;

comment on column public.agents.portrait_url is
  'Optional URL to agent portrait art; host images you have rights to use (e.g. your own art, team assets, or Riot press kit if license allows).';
