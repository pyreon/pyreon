# @pyreon/create-zero

Interactive scaffolder for new Pyreon Zero projects.

Ships two bin aliases — `create-pyreon-app` (canonical) and `create-zero` (back-compat) — both invoke the same scaffolder. Walks through template choice, deployment adapter, backend integrations, AI tooling, and compat mode via [@clack/prompts](https://github.com/bombshell-dev/clack), or accepts the full configuration non-interactively via CLI flags. Generates a working `@pyreon/zero` project with `vite.config.ts`, route tree, deploy artefacts, and optional AI rule files.

## Install

```bash
# Canonical
bunx create-pyreon-app my-app

# Back-compat (older docs / `bun create` flow)
bun create @pyreon/zero my-app
```

Both invocations are identical — pick whichever you prefer. The `--help` text echoes the alias you actually typed so docs links stay consistent.

## Quick start

```bash
# Interactive — answers every prompt
bunx create-pyreon-app my-app

# Non-interactive — accept defaults
bunx create-pyreon-app my-app --yes

# Fully specified
bunx create-pyreon-app my-app \
  --template dashboard \
  --adapter vercel \
  --mode ssr-stream \
  --integrations supabase,email \
  --ai mcp,claude,cursor \
  --yes
```

After scaffolding:

```bash
cd my-app
bun install
bun run dev
```

## Templates

| Template | Default mode | What you get |
|---|---|---|
| `app` | SSR streaming | Counter, posts, layout, admin route group — the full-featured starter. |
| `blog` | SSG (static) | TSX posts in `src/content/posts/`, RSS at `/rss.xml`, SEO-ready. |
| `dashboard` | SSR streaming | SaaS shape: marketing landing → auth-gated `/app/*` (overview, users, invoices, settings) → invoice export demo using `@pyreon/document-primitives` (the same component tree renders in browser AND exports to PDF / email). |

Force a template: `--template app | blog | dashboard`.

## Deployment adapters

Pick a target via `--adapter`. Each adapter writes the platform-specific deploy artefact alongside the project, and `vite.config.ts` imports the matching `*Adapter()` factory from `@pyreon/zero/server`.

| Adapter | Files written |
|---|---|
| `vercel` | `vercel.json` |
| `cloudflare` | `wrangler.toml`, `_routes.json` |
| `netlify` | `netlify.toml` |
| `node` | `Dockerfile`, `.dockerignore` |
| `bun` | `Dockerfile` (bun-based), `.dockerignore` |
| `static` | — (`dist/` is the artefact) |

## Rendering modes

`--mode ssr-stream | ssr-string | ssg | spa`

Maps to the `mode` + `ssr.mode` options on `@pyreon/zero`'s Vite plugin. `ssr-stream` is the default; `ssg` requires `getStaticPaths` on dynamic routes.

## Backend integrations

Two scaffolders that write **plain files into your project** — no Pyreon-side wrapper packages, no version coupling.

| Integration | Files written | Replaces |
|---|---|---|
| `supabase` | `src/lib/supabase.ts`, `src/lib/auth.ts`, `src/lib/db.ts` (in `dashboard`) | The dashboard template's in-memory auth + db stubs |
| `email` | `src/lib/email.ts`, `src/emails/welcome.tsx`, `src/routes/api/email/welcome.ts` | — |

The `dashboard` template preselects both. The email integration is the canonical Pyreon export-pipeline demo: the same `<DocDocument>` / `<DocSection>` / `<DocText>` component tree renders in the browser AND exports to email HTML via `@pyreon/document-primitives`.

## AI tooling

Multi-select for the AI rule files you want generated. All five share a canonical "Pyreon principles" body so guidance stays consistent across tools.

| Option | File | Default |
|---|---|---|
| `mcp` | `.mcp.json` | ✓ |
| `claude` | `CLAUDE.md` | ✓ |
| `cursor` | `.cursor/rules/pyreon.md` | — |
| `copilot` | `.github/copilot-instructions.md` | — |
| `agents` | `AGENTS.md` | — |

## Compat mode

Migrating from another framework? Pick `--compat react | vue | solid | preact` and the scaffolder configures `@pyreon/vite-plugin` with the matching shim layer (`useState`, `useEffect`, `<Suspense>`, etc.).

## Package strategy

`--packages meta | individual`

- `meta` (default) — installs `@pyreon/meta` (one dep re-exports the whole ecosystem)
- `individual` — installs only the specific `@pyreon/*` packages your selected features need

## CLI flags

| Flag | Values |
|---|---|
| `[name]` | Positional project name (first non-flag arg) |
| `--template` | `app` / `blog` / `dashboard` |
| `--adapter` | `vercel` / `cloudflare` / `netlify` / `node` / `bun` / `static` |
| `--mode` | `ssr-stream` / `ssr-string` / `ssg` / `spa` |
| `--features` | CSV: `store,query,forms,table,virtual,i18n,charts,…` |
| `--integrations` | CSV: `supabase,email` |
| `--ai` | CSV: `mcp,claude,cursor,copilot,agents` |
| `--compat` | `none` / `react` / `vue` / `solid` / `preact` |
| `--packages` (alias `--pm`, `--package-strategy`) | `meta` / `individual` |
| `--lint` / `--no-lint` | toggle `@pyreon/lint` |
| `--yes` | skip prompts, accept defaults |
| `--help` / `-h` | show usage |

Flag values accept both `--flag value` and `--flag=value` forms. Invalid enum values exit with a clear error.

## Documentation

Full docs: [docs.pyreon.dev/docs/create-zero](https://docs.pyreon.dev/docs/create-zero) (or `docs/src/content/docs/create-zero.md` in this repo).

## License

MIT
