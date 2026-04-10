<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Valo Strats — project context

The sections below summarize an earlier conversation that shaped this repo. Use them when continuing work in this IDE so decisions and constraints stay aligned.

---

## Summary

| Topic | Decision |
|--------|----------|
| **Product** | Team Valorant strategy sheets: visuals (e.g. ValoPlant screenshots) plus structured text for players. |
| **Discord** | Rich “embeds” are **JSON** sent via webhook (or bots)—not arbitrary HTML. For HTML/interaction, **link out** to a hosted page. |
| **Stack** | **Next.js** (App Router) + **Supabase** (Postgres, auth, storage) + **Vercel** (hosting). Free tiers are expected to be enough. |
| **vs GitHub Pages** | Pages = static only. Next can **static export** with limits (no API routes/SSR as usually used). **Vercel** is the preferred host for full Next.js features. |
| **Env** | `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` (never commit real keys). |

---

## Discord: embeds vs HTML

- **Embeds** are Discord’s structured format: `title`, `description` (Markdown), `fields`, `image` / `thumbnail`, `color`, `footer`, `author`, `timestamp`. No custom HTML/CSS layout.
- **Link previews**: host a page (e.g. Vercel) and paste the URL in Discord.
- **DIY**: Webhooks + embed JSON, or tools like Discohook for building embeds without code.

Example payload shape (illustrative):

```json
{
  "embeds": [{
    "title": "A Site Default — Ascent",
    "color": 16711680,
    "fields": [
      { "name": "Entry", "value": "Jett dashes main", "inline": true },
      { "name": "Support", "value": "Brim smokes CT + Lane", "inline": true },
      { "name": "Flash", "value": "Phoenix pre-flashes Generator", "inline": false }
    ],
    "image": { "url": "https://example.com/strat-diagram.png" }
  }]
}
```

---

## Static strat sheet → web app

**v1 (static)**  
HTML on GitHub Pages; strats as data in-page (e.g. a `STRATS` array), ValoPlant images via hosted URLs.

**Later versions (conceptual)**  
| Version | Scope |
|---------|--------|
| v2 | Supabase DB — strats without editing HTML |
| v3 | Auth + coach CRUD UI |
| v4 | Optional map/draw tooling (e.g. canvas) |

**Rough structure discussed for static / early app:**

```text
valo-strats/
├── app/ …
├── components/
│   ├── StratGrid.tsx
│   ├── StratCard.tsx
│   ├── StratModal.tsx
│   └── CoachDashboard.tsx
├── lib/
│   └── supabase.ts
└── types/
    └── strat.ts
```

Coach route: `app/coach/page.tsx`. Dependency noted for UI: `lucide-react`.

---

## Supabase: database schema

First SQL attempt failed: **`desc` is reserved in PostgreSQL**. Use **`description`** (or another non-reserved name) instead.

**Corrected table definition (conceptual — apply via Supabase SQL Editor if recreating):**

```sql
create table strats (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc', now()),
  title text not null,
  map text not null,
  side text not null check (side in ('atk', 'def')),
  agents text[] not null default '{}',
  difficulty int not null check (difficulty between 1 and 3),
  description text not null,
  steps jsonb not null default '[]',
  roles jsonb not null default '[]',
  notes text not null,
  images jsonb not null default '[]',
  tags text[] not null default '{}'
);

alter table strats enable row level security;

create policy "Public can read strats"
  on strats for select
  using (true);

create policy "Authenticated users can insert"
  on strats for insert
  with check (auth.role() = 'authenticated');

create policy "Authenticated users can update"
  on strats for update
  using (auth.role() = 'authenticated');

create policy "Authenticated users can delete"
  on strats for delete
  using (auth.role() = 'authenticated');

insert into storage.buckets (id, name, public)
  values ('strat-images', 'strat-images', true);

create policy "Public can view images"
  on storage.objects for select
  using (bucket_id = 'strat-images');

create policy "Authenticated users can upload images"
  on storage.objects for insert
  with check (bucket_id = 'strat-images' and auth.role() = 'authenticated');

create policy "Authenticated users can delete images"
  on storage.objects for delete
  using (bucket_id = 'strat-images' and auth.role() = 'authenticated');
```

---

## Environment variables

Use **exact** names Supabase + Next expect:

```bash
# .env.local (not committed)
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from Supabase → Settings → API>
```

- Project URL must be the **HTTPS** Supabase URL, not a publishable key string in place of the URL.
- Anon key must use the **`NEXT_PUBLIC_`** prefix if it is read in client-side code.

---

## Setup flow (condensed)

1. Install Node LTS; verify `node -v` / `npm -v`.
2. Accounts: GitHub, Vercel (GitHub signup), Supabase (GitHub).
3. `create-next-app` for `valo-strats` (TypeScript, ESLint, Tailwind, App Router, no `src/` if matching this repo).
4. `npm install @supabase/supabase-js @supabase/ssr` and `lucide-react`.
5. Supabase: new project → run SQL above → Settings → API for URL + anon key → `.env.local`.
6. `.env.local` is gitignored.
7. Local: `npm run dev` → http://localhost:3000 — strat grid (may start empty); coach UI under `/coach` per app structure.

---

## External references mentioned

- ValoPlant / lineup tools and Discord bots were discussed as **alternatives** or complements (links may change; search current names if needed).
- **Discohook** — visual webhook/embed helper.
- Hosting: **Vercel** + **Supabase** as the default “low cost / free” public app path.

---

## Transcript (chronological, abbreviated)

> **User:** Ways to embed Valo strats in Discord?  
> **Assistant:** Options included sharing ValoPlant-style links, lineup bots, richer bots, or webhooks with embed JSON; asked what workflow they wanted.

> **User:** Can HTML “render” in Discord?  
> **Assistant:** No—embeds are JSON; listed embed fields; suggested PNG/diagram + fields or linking to a hosted HTML page.

> **User:** How to build static strat sheets easily?  
> **Assistant:** GitHub Pages + HTML structure; optional Notion/Obsidian/Google Sites; offered a digestible template with ValoPlant images + text.

> **User:** Template + `index.html` — worked. Can this become a real web app?  
> **Assistant:** Yes—auth, DB, CRUD, optional canvas; recommended Next + Supabase + Vercel with rough effort tiers.

> **User:** Still work on GitHub Pages with Next?  
> **Assistant:** Partially—static export + client Supabase possible; API routes/SSR/`next/image` as typically used don’t map 1:1; Vercel recommended for full Next.

> **User:** Want low-cost public hosting.  
> **Assistant:** Vercel + Supabase free tiers; workflow GitHub → Vercel, Supabase for DB/auth/storage.

> **User:** Walk through setup.  
> **Assistant:** Node install → Vercel/Supabase accounts → scaffold app → Supabase SQL → keys → fix `desc` → `.env.local` format → install `lucide-react` → file layout → `npm run dev`, then coach account + deploy next.

---

*End of migrated context. Update this file if major product or infra decisions change.*
