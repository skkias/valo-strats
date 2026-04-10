# Environment variables

## App + Supabase (public to the browser)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL: `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon (JWT) key from Supabase **Settings → API** |

Never commit real keys. Use `.env.local` locally; set the same on the host (e.g. Vercel).

## Coach dashboard (server-only)

| Variable | Purpose |
|----------|---------|
| `SUPABASE_SERVICE_ROLE_KEY` | Service role secret from Supabase **Settings → API**. Used only in server actions after the coach cookie is verified. **Never** use `NEXT_PUBLIC_` for this. |

Without it, coach actions return an error about missing server config.

## Documentation viewer (server-only)

| Variable | Purpose |
|----------|---------|
| `DOCS_PASSWORD` | Shared password for `/docs`; used to set an httpOnly cookie after server-side check |
| `COACH_PASSWORD` | Shared password for `/coach` (separate from docs); httpOnly cookie on path `/coach` |

If unset, each login page explains that the password is not configured.

**Coach flow:** Unlock `/coach` with `COACH_PASSWORD`. Strat CRUD runs in **server actions** using `SUPABASE_SERVICE_ROLE_KEY` (never expose to the browser). Add the service role key from Supabase **Settings → API** to `.env` only.

## Documentation viewer theme (optional, server-only)

Injected as CSS variables on `.docs-theme-root` in `app/docs/layout.tsx`. Defaults live in `lib/docs-theme.ts` (`DOCS_THEME_DEFAULTS`). Restart the dev server or redeploy after changes.

| Variable | Maps to | Example |
|----------|---------|---------|
| `DOCS_THEME_ACCENT` | Links, buttons, accents | `#22d3ee` |
| `DOCS_THEME_BG_PAGE` | Page background | `#070709` |
| `DOCS_THEME_SURFACE` | Sidebar / muted panels | `rgba(24,24,27,0.55)` |
| `DOCS_THEME_SURFACE_STRONG` | Toolbar, login card | `rgba(24,24,27,0.92)` |
| `DOCS_THEME_BORDER` | Dividers, inputs | `rgba(63,63,70,0.65)` |
| `DOCS_THEME_BORDER_STRONG` | Hover borders | `rgba(82,82,91,0.5)` |
| `DOCS_THEME_TEXT` | Body prose | `#d4d4d8` |
| `DOCS_THEME_TEXT_HEADING` | Headings | `#fafafa` |
| `DOCS_THEME_TEXT_MUTED` | Secondary text | `#a1a1aa` |
| `DOCS_THEME_TEXT_FAINT` | Labels, hints | `#71717a` |
| `DOCS_THEME_CODE_BG` | Inline / block code bg | `#27272a` |
| `DOCS_THEME_CODE_TEXT` | Inline code color | `#fda4af` |
| `DOCS_THEME_QUOTE_BORDER` | Blockquote accent | `rgba(244,63,94,0.45)` |
| `DOCS_THEME_FOLDER_ICON` | Tree folder icon | `#fbbf24` |
| `DOCS_PROSE_MAX_WIDTH` | Article column | `42rem` |
| `DOCS_LAYOUT_MAX_WIDTH` | Whole viewer shell | `88rem` |
| `DOCS_SIDEBAR_WIDTH` | Sidebar | `18rem` |
| `DOCS_RADIUS_SM` / `DOCS_RADIUS_MD` / `DOCS_RADIUS_LG` | Corners (number = px, or any CSS length) | `8` → `8px` |
| `DOCS_HEADING_SCALE` | Multiply h1–h3 sizes | `1` or `1.05` |
| `DOCS_FONT_HEADING` | `font-family` for titles | `Georgia, serif` |
| `DOCS_FONT_BODY` | `font-family` for prose | `system-ui, sans-serif` |

Stylesheet: `app/docs/docs-theme.css`.

## Not in this app

- **Service role** key is not required for the shipped UI. Do not expose it to the client.
