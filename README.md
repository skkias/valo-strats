# Hexecute

Team strategy workspace for VALORANT: public strat browsing, coach editing tools, staged map plans, and documentation.

## What is implemented

- Public strat browser with filters/search and detailed modal view.
- Multi-stage strat viewer with map overlays, agent pins, and ability visuals.
- Coach dashboard for strat CRUD, map shape editing, and agent ability blueprints.
- Password-gated `/coach` and `/docs` routes via secure cookies.
- Supabase-backed data + storage (`strat-images` bucket).

## Tech stack

- Next.js App Router + React 19 + Tailwind CSS v4
- Supabase Postgres + Storage
- Vercel-friendly deployment setup

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
COACH_PASSWORD=<shared coach password>
DOCS_PASSWORD=<shared docs password>
```

3. Apply SQL migrations in Supabase (CLI or SQL editor) from `supabase/migrations`.
4. Run locally:

```bash
npm run dev
```

5. Open:
- `http://localhost:3000` (public)
- `http://localhost:3000/coach/login` (coach)
- `http://localhost:3000/docs/login` (docs)

## Quality checks

```bash
npm run lint
npm run typecheck
npm run test
```

CI workflow is defined in `.github/workflows/ci.yml`.

## Developer docs

- `documentation/developer/README.md`
- `documentation/developer/architecture.md`
- `documentation/developer/environment.md`

## Deployment notes

- Set the same environment variables in your host (e.g. Vercel project settings).
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.
- Rotate `COACH_PASSWORD` / `DOCS_PASSWORD` when team membership changes.
