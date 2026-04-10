# Architecture

## Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js (App Router), React 19 |
| UI | Tailwind CSS v4, lucide-react |
| Data | Supabase (Postgres + Row Level Security + Auth + Storage) |
| Deployment | Vercel (typical) |

## Main routes

| Path | Purpose |
|------|---------|
| `/` | Public strat grid (server-fetches rows from `strats`) |
| `/coach` | Client dashboard: auth, CRUD, uploads to `strat-images` bucket |
| `/docs` | Password-gated Markdown viewer; content root is `documentation/user/` |
| `/docs/login` | Shared password form (`DOCS_PASSWORD`) |

## Supabase schema (summary)

- Table **`strats`**: `title`, `map`, `side` (`atk` or `def`), `agents` (text[]), `difficulty`, **`description`** (not `desc` — reserved in SQL), `steps` / `roles` / `images` (jsonb), `notes`, `tags`.  
- RLS: public `select`; `insert` / `update` / `delete` for `authenticated`.  
- Storage bucket **`strat-images`**: public read; write/delete for authenticated users.

## Code map

- `lib/supabase.ts` — browser Supabase client  
- `lib/supabase-server.ts` — server client (cookies; do not import from client components)  
- `components/Strat*`, `CoachDashboard.tsx` — product UI  
- `lib/documentation.ts` — filesystem scan of `documentation/user` only  
- `middleware.ts` — docs cookie gate  
