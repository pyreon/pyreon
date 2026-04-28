# @pyreon/create-zero · `create-pyreon-app`

Interactive scaffolder for [Pyreon Zero](https://github.com/pyreon/pyreon) projects.

This package ships **two bin aliases** — both invoke the same scaffolder:

```bash
# Canonical (recommended in docs)
bunx create-pyreon-app my-app

# Back-compat (older docs / `bun create` flow)
bun create @pyreon/zero my-app
```

Pick whichever you prefer; the interactive prompts and the resulting project are identical.

## Templates

Three curated starting points:

| Template | Default mode | What you get |
| --- | --- | --- |
| **`app`** | SSR streaming | Counter, posts, layout, admin route group — the full-featured starter. |
| **`blog`** | Static (SSG) | Markdown-style TSX posts in `src/content/posts/`, RSS feed at `/rss.xml`, SEO-ready. |
| **`dashboard`** | SSR streaming | SaaS-shape: marketing landing → auth-gated `/app/*` routes (overview, users, invoices, settings) → invoice export demo using `@pyreon/document-primitives` (the same component tree renders in browser AND exports to PDF/email). |

Force a template non-interactively:

```bash
bunx create-pyreon-app my-app --template blog
```

## Deployment adapters

Pick a target during the prompt or pass `--adapter`. Each adapter writes the platform-specific deploy artefact alongside the project:

| Adapter | Files written |
| --- | --- |
| `vercel` | `vercel.json` |
| `cloudflare` | `wrangler.toml`, `_routes.json` |
| `netlify` | `netlify.toml` |
| `node` | `Dockerfile`, `.dockerignore` |
| `bun` | `Dockerfile` (bun-based), `.dockerignore` |
| `static` | (none — `dist/` is the artefact) |

The `vite.config.ts` automatically imports the matching `*Adapter()` factory from `@pyreon/zero/server`.

## Backend integrations

Two scaffolders that write **plain files into your project** — no Pyreon-side wrapper packages, no version coupling. You own the integration code and update it independently of Pyreon releases.

| Integration | Files written | Replaces |
| --- | --- | --- |
| `supabase` | `src/lib/supabase.ts`, `src/lib/auth.ts`, `src/lib/db.ts` (in dashboard) | The dashboard template's in-memory auth + db stubs |
| `email` | `src/lib/email.ts`, `src/emails/welcome.tsx`, `src/routes/api/email/welcome.ts` | — |

The `dashboard` template preselects both. For `app` / `blog`, integrations are off by default but selectable.

The email integration is the **headline Pyreon angle**: the same `<DocDocument>` / `<DocSection>` / `<DocText>` component tree renders in the browser AND exports to email HTML via `@pyreon/document-primitives` — one author for many output formats.

## AI tooling

Multi-select for the AI rule files you want generated:

| Option | File | Default |
| --- | --- | --- |
| `mcp` | `.mcp.json` | ✓ |
| `claude` | `CLAUDE.md` | ✓ |
| `cursor` | `.cursor/rules/pyreon.md` | — |
| `copilot` | `.github/copilot-instructions.md` | — |
| `agents` | `AGENTS.md` | — |

All five share a canonical "Pyreon principles" body so guidance stays consistent across tools.

## Compat mode

Migrating from another framework? Pick `react` / `vue` / `solid` / `preact` and the scaffolder configures `@pyreon/vite-plugin` with the matching shim layer (`useState`, `useEffect`, `<Suspense>`, etc.).

## CLI flags (one-shot, non-interactive)

```bash
bunx create-pyreon-app my-app --template dashboard \
  --adapter vercel \
  --integrations supabase,email \
  --ai mcp,claude,cursor \
  --yes
```

| Flag | Values |
| --- | --- |
| `--template` | `app` / `blog` / `dashboard` |
| `--adapter` | `vercel` / `cloudflare` / `netlify` / `node` / `bun` / `static` |
| `--mode` | `ssr-stream` / `ssr-string` / `ssg` / `spa` |
| `--features` | csv (`store,query,forms,…`) |
| `--integrations` | csv (`supabase,email`) |
| `--ai` | csv (`mcp,claude,cursor,copilot,agents`) |
| `--compat` | `none` / `react` / `vue` / `solid` / `preact` |
| `--lint` / `--no-lint` | toggle `@pyreon/lint` |
| `--yes` | accept defaults, skip prompts |
| `--help`, `-h` | show usage |

## License

MIT
