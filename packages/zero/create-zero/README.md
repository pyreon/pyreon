# @pyreon/create-zero

Interactive scaffolder for new Pyreon Zero projects.

Scaffold a new `@pyreon/zero` project. Invoke through the npm/bun create-convention — `npm create @pyreon/zero@latest my-app` or `bun create @pyreon/zero my-app` (both resolve this package). It walks through template choice, deployment adapter, backend integrations, AI tooling, and compat mode via [@clack/prompts](https://github.com/bombshell-dev/clack), or accepts the full configuration non-interactively via CLI flags. Generates a working `@pyreon/zero` project with `vite.config.ts`, route tree, deploy artefacts, and optional AI rule files. (The package exposes `create-pyreon-app` / `create-zero` bins once installed; `bunx create-pyreon-app` does NOT resolve — no package is published under that bare name — so use the create-convention above.)

## Install

```bash
# Canonical
npm create @pyreon/zero@latest my-app

# Back-compat (older docs / `bun create` flow)
bun create @pyreon/zero my-app
```

Both invocations are identical — pick whichever you prefer. The `--help` text echoes the alias you actually typed so docs links stay consistent.

## Quick start

```bash
# Interactive — answers every prompt
npm create @pyreon/zero@latest my-app

# Non-interactive — accept defaults
npm create @pyreon/zero@latest my-app -- --yes

# Fully specified
npm create @pyreon/zero@latest my-app -- \
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

| Template | Default mode | Mode forced? | What you get |
|---|---|---|---|
| `app` | SSR streaming | no | Counter, posts, layout, admin route group — the full-featured starter. |
| `blog` | SSG (static) | yes | TSX posts in `src/content/posts/`, an RSS feed, SEO-ready. Static-first — `node`/`bun` adapters are excluded. |
| `dashboard` | SSR streaming | yes | SaaS shape: marketing landing → auth-gated `/app/*` (overview, users, invoices, settings) → invoice export demo using `@pyreon/document-primitives` (the same component tree renders in browser AND exports to PDF / email). Server-required — `static` is excluded. Preselects both backend integrations. |
| `monorepo` | SSR streaming | no | Bun workspaces shell — `apps/web/` (a full `app`-shaped project) + `packages/ui/` + `packages/types/`, with a root `package.json` proxying `dev`/`build`/`preview` to the web app. |

Force a template: `--template app | blog | dashboard | monorepo`.

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

`node`/`bun` skip the Dockerfile entirely under `--mode spa` — a SPA build has no server entry for the container's `CMD` to run, so shipping a Dockerfile there would crash the container at startup. Deploy a SPA to any static host, or pick the `static` adapter.

## Rendering modes

`--mode ssr-stream | ssr-string | ssg | isr | spa`

Maps to the `mode` + `ssr.mode` options on `@pyreon/zero`'s Vite plugin. `ssr-stream` is the default; `ssg` requires `getStaticPaths` on dynamic routes; `isr` keeps a server-side SWR cache, so the `static` adapter is excluded from the deploy prompt whenever `isr` is selected (`--adapter static --mode isr` fails fast).

## Feature presets

22 fundamentals features (`store`, `query`, `forms`, `table`, `virtual`, `i18n`, `charts`, …) can be enabled per project. The interactive flow offers a preset shortcut first; picking `Custom` drops into a multiselect grouped into 8 categories.

| Preset | Feature set | Mode | Adapter |
|---|---|---|---|
| `minimal` | (none) | `spa` | `static` |
| `standard` | `store` + `query` + `forms` | `ssr-stream` | `vercel` |
| `dashboard` | `standard` + `table` + `charts` | `ssr-stream` | `vercel` |
| `full` | every feature (22) | `ssr-stream` | `vercel` |

Per-feature `--with-<feature>` / `--no-<feature>` flags (e.g. `--with-i18n --no-forms`) compose on top of whichever base set is active — explicit `--features`, a `--preset`, or (under `--yes`) the template's default. `--no-X` wins over `--with-X` for the same feature; an unknown feature name in either is a hard error listing the known set. `--features <csv>` overrides `--preset` entirely.

```bash
npm create @pyreon/zero@latest my-app -- --preset standard --with-i18n --no-forms --yes
```

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
| `--template` | `app` / `blog` / `dashboard` / `monorepo` |
| `--adapter` | `vercel` / `cloudflare` / `netlify` / `node` / `bun` / `static` |
| `--mode` | `ssr-stream` / `ssr-string` / `ssg` / `spa` / `isr` |
| `--preset` | `minimal` / `standard` / `dashboard` / `full` (composes with `--with-X` / `--no-X`) |
| `--features` | CSV: `store,query,forms,table,virtual,i18n,charts,…` — overrides `--preset` entirely, not validated |
| `--with-<feature>` | atomic add, e.g. `--with-store --with-i18n` (errors on an unknown feature) |
| `--no-<feature>` | atomic remove, e.g. `--no-forms` (wins over `--with-` for the same feature) |
| `--integrations` | CSV: `supabase,email` |
| `--ai` | CSV: `mcp,claude,cursor,copilot,agents` |
| `--compat` | `none` / `react` / `vue` / `solid` / `preact` |
| `--packages` (alias `--pm`, `--package-strategy`) | `meta` / `individual` |
| `--lint` / `--no-lint` | toggle `@pyreon/lint` |
| `--typed-routes` / `--no-typed-routes` | toggle typed routes (`<Link href>` autocomplete + typo rejection; default on) |
| `--yes` | skip prompts, accept defaults (requires a positional project name) |
| `--install` / `--no-install` | accepted no-ops — the scaffolder never installs; it prints the install command as a next step |
| `--help` / `-h` | show usage |

Flag values accept both `--flag value` and `--flag=value` forms. Invalid enum values, an unknown flag, or an extra positional argument exit with a clear, non-zero-exit-code error.

## Documentation

Full docs: [pyreon.dev/docs/create-zero](https://pyreon.dev/docs/create-zero) (or `docs/src/content/docs/create-zero.md` in this repo).

## License

MIT
