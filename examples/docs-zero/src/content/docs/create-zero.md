---
title: '@pyreon/create-zero'
description: Interactive scaffolder for Pyreon Zero projects — four templates (incl. monorepo), feature presets + grouped multiselect, six deployment adapters, two backend integrations, AI tooling, and compat mode.
---

`@pyreon/create-zero` is the interactive scaffolder for new Pyreon projects. It ships under two bin aliases (both invoke the same tool):

```bash
# Canonical (recommended)
bunx create-pyreon-app my-app

# Back-compat (older docs)
bun create @pyreon/zero my-app
```

The interactive prompts walk through template choice, deployment adapter, feature selection (preset shortcut or grouped multiselect), backend integrations, AI tooling, and compat mode. Pass `--yes` to accept defaults non-interactively.

<PackageBadge name="@pyreon/create-zero" href="/docs/create-zero" />

## Templates

Four curated starting points selected by the `--template` flag (or interactively):

| Template | Default mode | What you get |
| --- | --- | --- |
| **`app`** | SSR streaming | Counter, posts, layout, admin route group — the full-featured starter. |
| **`blog`** | Static (SSG) | Markdown-style TSX posts in `src/content/posts/`, RSS feed at `/rss.xml`, SEO-ready. |
| **`dashboard`** | SSR streaming | SaaS shape: marketing landing → auth-gated `/app/*` routes (overview, users, invoices, settings) → invoice export demo using `@pyreon/document-primitives` (the same component tree renders in browser AND exports to PDF / email). |
| **`monorepo`** | SSR streaming | Bun workspaces shell — `apps/web/` (full Pyreon Zero app, `app`-template shape) + `packages/ui/` (`@<name>/ui` shared components) + `packages/types/` (`@<name>/types` framework-agnostic shared types). Root `package.json` declares workspaces and proxies `dev`/`build`/`preview`/`typecheck` via `bun run --filter='web' …`. |

Force a template non-interactively:

```bash
bunx create-pyreon-app my-app --template blog
bunx create-pyreon-app my-mono --template monorepo
```

### Monorepo layout

`--template monorepo` produces:

```
my-mono/
├── package.json              # workspaces: ["apps/*", "packages/*"], proxy scripts
├── tsconfig.json             # global TS settings (no project references)
├── README.md
├── .gitignore
├── apps/
│   └── web/                  # full Pyreon Zero app
│       ├── package.json      # name: "web" + workspace deps for shared packages
│       └── …                 # everything the `app` template produces
└── packages/
    ├── ui/                   # @my-mono/ui — shared components stub
    │   ├── package.json      # deps: { "@my-mono/types": "workspace:^" }
    │   └── src/index.ts      # Button + ButtonProps stub
    └── types/                # @my-mono/types — framework-agnostic types
        ├── package.json
        └── src/index.ts      # ButtonVariant + User stubs
```

The `@<projectName>/` scope is auto-derived from the project name — no extra prompt. All feature, preset, adapter, integration, AI, and lint flags apply to the inner web app (the inner template is always `app`-shaped for now).

## Deployment adapters

Pick a target during the prompt or pass `--adapter`. Each adapter writes the platform-specific deploy artefact alongside the project, and the generated `vite.config.ts` automatically imports the matching `*Adapter()` factory from `@pyreon/zero/server`.

| Adapter | Files written |
| --- | --- |
| `vercel` | `vercel.json` |
| `cloudflare` | `wrangler.toml`, `_routes.json` |
| `netlify` | `netlify.toml` |
| `node` | `Dockerfile`, `.dockerignore` |
| `bun` | `Dockerfile` (bun-based), `.dockerignore` |
| `static` | (none — `dist/` is the artefact) |

## Features

22 Pyreon fundamentals can be selected per project. The interactive prompt offers a **preset shortcut first**, then drops to a **grouped multiselect** (8 categories) when you pick `Custom`.

### Presets

Four atomic shortcuts via `--preset`:

| Preset | Feature set |
| --- | --- |
| `minimal` | (no features) |
| `standard` | `store` + `query` + `forms` — today's `app` defaults |
| `dashboard` | `standard` + `table` + `charts` |
| `full` | every feature on (22 total) |

```bash
bunx create-pyreon-app my-app --preset standard --yes
bunx create-pyreon-app my-mono --template monorepo --preset full --yes
```

### Atomic add / remove

`--with-<feature>` adds a feature, `--no-<feature>` removes one. They **compose with `--preset`** (or with `--features` / with the template default under `--yes`):

```bash
# Standard preset + i18n - forms
bunx create-pyreon-app my-app --preset standard --with-i18n --no-forms --yes
```

`--no-X` always wins over `--with-X` for the SAME feature (set-subtraction semantics).

Known features: `store`, `state-tree`, `storage`, `url-state`, `forms`, `feature`, `query`, `rx`, `styler`, `elements`, `animations`, `coolgrid`, `table`, `virtual`, `charts`, `code`, `flow`, `toast`, `i18n`, `hotkeys`, `permissions`, `hooks`.

### Resolution order

Highest-priority flag wins; `--with-X` / `--no-X` overlay every priority:

1. `--features <csv>` — explicit list wins outright
2. `--preset <id>` — preset feature set as starting point
3. `--yes` — template default as starting point
4. Interactive — preset prompt → `Custom` → grouped multiselect

## Backend integrations

Two scaffolders that write **plain files into your project** — no Pyreon-side wrapper packages, no version coupling. You own the integration code and update it independently of Pyreon releases.

| Integration | Files written | Replaces |
| --- | --- | --- |
| `supabase` | `src/lib/supabase.ts`, `src/lib/auth.ts`, `src/lib/db.ts` (in dashboard) | The dashboard template's in-memory auth + db stubs |
| `email` | `src/lib/email.ts`, `src/emails/welcome.tsx`, `src/routes/api/email/welcome.ts` | — |

The `dashboard` template preselects both. For `app` / `blog`, integrations are off by default but selectable.

The email integration showcases the **document-primitives angle**: the same `<DocDocument>` / `<DocSection>` / `<DocText>` component tree renders in the browser AND exports to email HTML via `@pyreon/document-primitives` — one author surface for many output formats.

## AI tooling

Multi-select for the AI rule files you want generated. All five share a canonical "Pyreon principles" body so the guidance stays consistent across tools.

| Option | File | Default |
| --- | --- | --- |
| `mcp` | `.mcp.json` | ✓ |
| `claude` | `CLAUDE.md` | ✓ |
| `cursor` | `.cursor/rules/pyreon.md` | — |
| `copilot` | `.github/copilot-instructions.md` | — |
| `agents` | `AGENTS.md` | — |

## Compat mode

Migrating from another framework? Pick `react` / `vue` / `solid` / `preact` and the scaffolder configures `@pyreon/vite-plugin` with the matching shim layer (`useState`, `useEffect`, `<Suspense>`, etc.).

## CLI flags (one-shot, non-interactive)

```bash
# Standard app, default everything
bunx create-pyreon-app my-app --yes

# Dashboard + Supabase + Resend, full AI tooling
bunx create-pyreon-app my-app --template dashboard \
  --adapter vercel \
  --integrations supabase,email \
  --ai mcp,claude,cursor \
  --yes

# Standard preset + i18n minus forms
bunx create-pyreon-app my-app --preset standard --with-i18n --no-forms --yes

# Blog on Cloudflare Pages
bunx create-pyreon-app my-blog --template blog --adapter cloudflare --yes

# Monorepo with the standard preset
bunx create-pyreon-app my-mono --template monorepo --preset standard --yes
```

| Flag | Values |
| --- | --- |
| `--template` | `app` / `blog` / `dashboard` / `monorepo` |
| `--adapter` | `vercel` / `cloudflare` / `netlify` / `node` / `bun` / `static` |
| `--mode` | `ssr-stream` / `ssr-string` / `ssg` / `spa` |
| `--preset` | `minimal` / `standard` / `dashboard` / `full` (composes with `--with-X` / `--no-X`) |
| `--features` | csv (`store,query,forms,…`) — overrides `--preset` entirely |
| `--with-<feature>` | atomic add (e.g. `--with-store --with-i18n`) |
| `--no-<feature>` | atomic remove (e.g. `--no-forms`) |
| `--integrations` | csv (`supabase,email`) |
| `--ai` | csv (`mcp,claude,cursor,copilot,agents`) |
| `--compat` | `none` / `react` / `vue` / `solid` / `preact` |
| `--packages` | `meta` (single barrel) / `individual` (selected packages only) |
| `--lint` / `--no-lint` | toggle `@pyreon/lint` |
| `--yes` | accept defaults, skip prompts |
| `--help`, `-h` | show usage |

## What gets generated

Every template scaffolds a project with:

```
my-app/
├── src/
│   ├── routes/        # File-based routing
│   ├── components/
│   ├── stores/
│   └── app.tsx
├── public/
├── pyreon.config.ts
├── vite.config.ts
├── tsconfig.json
└── package.json
```

The generated project includes:

- **Pyreon Zero** with all fundamentals via `@pyreon/meta`
- **Vite** preconfigured with `@pyreon/vite-plugin`
- **TypeScript** with strict mode and Pyreon-specific type settings
- **Router** with starter routes and (for `app` / `dashboard`) a `_layout.tsx`
- **File-based routing** convention ready to use
- Selected adapter's deploy artefacts
- Selected backend integration files
- Selected AI rule files

After scaffolding:

```bash
cd my-app
bun install
bun dev
```
