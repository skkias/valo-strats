-- Baseline `public.strats` schema + RLS + storage policies.
-- This migration intentionally runs before agents/maps migrations.
create extension if not exists pgcrypto;

create table if not exists public.strats (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default (timezone('utc', now())),
  title text not null,
  map text not null,
  side text not null check (side in ('atk', 'def')),
  agents text[] not null default '{}'::text[],
  difficulty int not null check (difficulty between 1 and 3),
  description text not null,
  steps jsonb not null default '[]'::jsonb,
  roles jsonb not null default '[]'::jsonb,
  notes text not null default '',
  images jsonb not null default '[]'::jsonb,
  tags text[] not null default '{}'::text[]
);

alter table public.strats enable row level security;

drop policy if exists "strats_select_all" on public.strats;
create policy "strats_select_all" on public.strats
  for select using (true);

drop policy if exists "strats_insert_authenticated" on public.strats;
create policy "strats_insert_authenticated" on public.strats
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "strats_update_authenticated" on public.strats;
create policy "strats_update_authenticated" on public.strats
  for update using (auth.role() = 'authenticated');

drop policy if exists "strats_delete_authenticated" on public.strats;
create policy "strats_delete_authenticated" on public.strats
  for delete using (auth.role() = 'authenticated');

insert into storage.buckets (id, name, public)
values ('strat-images', 'strat-images', true)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "strat_images_select_all" on storage.objects;
create policy "strat_images_select_all" on storage.objects
  for select using (bucket_id = 'strat-images');

drop policy if exists "strat_images_insert_authenticated" on storage.objects;
create policy "strat_images_insert_authenticated" on storage.objects
  for insert with check (
    bucket_id = 'strat-images' and auth.role() = 'authenticated'
  );

drop policy if exists "strat_images_delete_authenticated" on storage.objects;
create policy "strat_images_delete_authenticated" on storage.objects
  for delete using (
    bucket_id = 'strat-images' and auth.role() = 'authenticated'
  );
