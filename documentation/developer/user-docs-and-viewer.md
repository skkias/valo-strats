# User docs & in-app viewer

## Two documentation trees

| Location | Served at `/docs`? |
|----------|---------------------|
| `documentation/user/**/*.md` | **Yes** — file tree + Markdown → HTML |
| `documentation/developer/**/*.md` | **No** — edit in repo / IDE only |

`lib/documentation.ts` sets `DOC_ROOT` to `documentation/user`. Anything outside that path (including `documentation/developer/`) never goes through `resolveDocFile` or the sidebar scanner.

## Editing user guides

1. Change or add `.md` under `documentation/user/`.  
2. Use `/docs/...` links for cross-links (see existing `index.md`).  
3. Redeploy for production; dev server picks up file changes on navigation/refresh.

## Auth flow (docs)

- Middleware allows `/docs/login` without the docs cookie.  
- Other `/docs` paths require a cookie whose value is an HMAC of `DOCS_PASSWORD` (see `lib/docs-token.ts`).  
- **Lock** in the viewer clears the cookie via server action.

## Product note

Keep **user** copy free of implementation details (no env var names unless you want coaches to see them — usually you don’t). Put stack and env detail here under **developer/**.
