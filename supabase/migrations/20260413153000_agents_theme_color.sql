alter table public.agents
  add column if not exists theme_color text not null default '#a78bfa';

comment on column public.agents.theme_color is
  'Agent-wide theme color (hex) used for token borders and ability visuals.';
