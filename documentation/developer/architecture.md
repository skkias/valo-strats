# Architecture

## Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js (App Router), React 19 |
| UI | Tailwind CSS v4, lucide-react |
| Data | Supabase (Postgres + Row Level Security + Storage) |
| Deployment | Vercel (typical) |

## Main routes

| Path | Purpose |
|------|---------|
| `/` | Public strat grid (server-fetches rows from `strats`) |
| `/coach` | Password-gated dashboard: strat/map/agent CRUD, uploads to `strat-images` |
| `/docs` | Password-gated Markdown viewer; content root is `documentation/user/` |
| `/docs/login` | Shared password form (`DOCS_PASSWORD`) |
| `/coach/login` | Shared password form (`COACH_PASSWORD`) |

## Supabase schema (summary)

- Table **`strats`**: `title`, `map`, `side` (`atk` or `def`), `agents` (text[]), `difficulty`, **`description`**, `steps` / `roles` / `images` (jsonb), `notes`, `tags`, `map_id`, `strat_stages`.
- Catalog tables: **`agents`** and **`maps`** (map vectors, overlays, labels, spawn markers, optional agent blueprints).
- Baseline migration now lives in `supabase/migrations/20260410110000_strats_baseline.sql`; follow-on migrations evolve map/agent/strat schema.

## Auth and authorization model

- `/docs/*` and `/coach/*` are protected in `middleware.ts` (login routes are excluded).
- Login uses shared passwords (`DOCS_PASSWORD`, `COACH_PASSWORD`) and sets an httpOnly cookie scoped by route.
- Coach write actions call `assertCoachGate()` before touching data.
- Coach writes run with `SUPABASE_SERVICE_ROLE_KEY` via `createServiceSupabaseClient()` (server only), so app-level authorization is cookie gate + server checks rather than Supabase user sessions.

## Code map

- `lib/supabase.ts` — browser Supabase client  
- `lib/supabase-server.ts` — server client (cookies; do not import from client components)  
- `lib/supabase-service.ts` — service-role server client for coach mutations  
- `components/Strat*`, `CoachDashboard.tsx` — product UI  
- `lib/documentation.ts` — filesystem scan of `documentation/user` only  
- `middleware.ts` — docs + coach cookie gates  
