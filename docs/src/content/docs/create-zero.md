---
title: '@pyreon/create-zero'
description: Interactive scaffolder for Pyreon Zero projects — four templates (incl. monorepo), feature presets + grouped multiselect, six deployment adapters, two backend integrations, AI tooling, and framework-compat mode. Fully scriptable with flags.
---

`@pyreon/create-zero` is the interactive project scaffolder for [Pyreon Zero](/docs/zero). One command walks you through template choice, rendering mode, deployment adapter, feature selection, backend integrations, AI tooling, and framework-migration compat — then writes a ready-to-run project. Every prompt also has a flag, so the whole flow is scriptable for CI, templates repos, and `--yes` one-liners.

<PackageBadge name="@pyreon/create-zero" href="/docs/create-zero" />

## Installation

You don't install it — you invoke it through your package manager's `create` command. It ships under two bin aliases (`create-pyreon-app` is canonical, `create-zero` is the back-compat alias) but both run the same scaffolder.

:::code-group

```bash [npm]
npm create @pyreon/zero@latest my-app
```

```bash [bun]
bun create @pyreon/zero my-app
```

```bash [pnpm]
pnpm create @pyreon/zero my-app
```

```bash [yarn]
yarn create @pyreon/zero my-app
```

:::

Then start the dev server:

:::code-group

```bash [npm]
cd my-app
npm install
npm run dev
```

```bash [bun]
cd my-app
bun install
bun run dev
```

```bash [pnpm]
cd my-app
pnpm install
pnpm run dev
```

```bash [yarn]
cd my-app
yarn
yarn dev
```

:::

The scaffolder **never installs dependencies itself** — it prints `cd`, `install`, and `dev` as next steps and stops. (It accepts `--install` / `--no-install` as no-ops, since people pass them out of habit from `create-vite` / `create-next-app`.)

:::tip{title="Pick a starting point fast"}
`npm create @pyreon/zero@latest my-app -- --preset standard --yes` skips every prompt and gives you a streaming-SSR app with store, query, and forms. Add `-- --template blog` or `-- --template monorepo` for a richer shape.
:::

## Why a scaffolder?

A Pyreon Zero project has several genuinely-computed pieces — the `dependencies` map depends on which features you pick, the `vite.config.ts` plugins array depends on rendering mode + adapter + compat shim, and the deploy artefacts depend on the target platform. Wiring all of that by hand means cross-referencing docs and keeping versions in sync. The scaffolder does it in one pass:

- **Feature → dependency resolution** — pick `query` and it adds `@pyreon/query` + `@tanstack/query-core`; pick `forms` and it adds `@pyreon/form` + `@pyreon/validation` + `zod`. Every `@pyreon/*` dep is pinned to the same monorepo version as the scaffolder itself, so the set is always internally consistent.
- **Mode + adapter → `vite.config.ts`** — the generated config imports the matching `*Adapter()` factory and sets `zero({ mode, ssr })` for you.
- **Platform → deploy artefacts** — `vercel.json`, `wrangler.toml`, `Dockerfile`, etc. land alongside your code.
- **AI tooling** — generates `CLAUDE.md`, `.mcp.json`, Cursor rules, and more from one shared "Pyreon principles" body so the guidance stays consistent across editors.

## Quick Start

The fastest non-interactive paths, by template:

```bash
# Standard app (store + query + forms), SSR streaming, Vercel
npm create @pyreon/zero@latest my-app -- --preset standard --yes

# SSG markdown blog on Cloudflare Pages
npm create @pyreon/zero@latest my-blog -- --template blog --adapter cloudflare --yes

# SaaS-shape dashboard with Supabase + Resend
npm create @pyreon/zero@latest my-saas -- --template dashboard \
  --integrations supabase,email --yes

# Bun-workspaces monorepo
npm create @pyreon/zero@latest my-mono -- --template monorepo --preset standard --yes
```

:::note{title="Passing flags"}
With `npm` / `pnpm` / `yarn`, separate the scaffolder's flags from the package-manager's with a `--` (e.g. `npm create @pyreon/zero@latest my-app -- --yes`). With `bun create` you pass flags directly: `bun create @pyreon/zero my-app --yes`.
:::

## The interactive flow

Run without `--yes` (or with any prompt's flag omitted) and you get an ordered series of prompts. Every prompt is **skipped** when its flag is supplied — flags and prompts are interchangeable.

1. **Project name** — the positional argument, or a text prompt. The target directory must not already exist (it bails if it does). Required up front when using `--yes`.
2. **Template** — `app` / `blog` / `dashboard` / `monorepo`.
3. **Rendering mode** — `ssr-stream` / `ssr-string` / `ssg` / `spa`. **Skipped** for templates that force a mode (`blog` → SSG, `dashboard` → SSR streaming).
4. **Deployment target** — filtered to the adapters the chosen template supports.
5. **Feature preset** — pick a preset, or `Custom` to drop into a grouped multiselect of all 22 features (8 categories).
6. **Package imports** — `@pyreon/meta` single barrel, or individual packages.
7. **Backend integrations** — Supabase, Email (Resend), or none.
8. **AI tooling** — multi-select of rule files (MCP, `CLAUDE.md`, Cursor, Copilot, `AGENTS.md`).
9. **Compat mode** — native Pyreon, or a React / Vue / Solid / Preact migration shim.
10. **Lint** — include `@pyreon/lint` (the prompt advertises "59 Pyreon-specific rules").

Cancelling at any prompt (Ctrl-C) aborts cleanly.

## Templates

Four curated starting points, selected by `--template` or interactively. Each declares its own default rendering mode, default feature set, supported adapters, and (for `dashboard`) preselected integrations.

| Template | Default mode | Mode forced? | Default features | What you get |
| --- | --- | --- | --- | --- |
| **`app`** | SSR streaming | no | `store` + `query` + `forms` | Full-featured starter — counter, posts list + detail, an `(admin)` route group, `_layout` / `_error` / `_loading`, and `api/` route handlers. |
| **`blog`** | Static (SSG) | **yes** | (none) | Markdown-style TSX posts in `src/content/posts/`, an RSS feed at `/api/rss`, SEO-ready. Static-first — `node` / `bun` adapters are excluded. |
| **`dashboard`** | SSR streaming | **yes** | `store` + `query` + `forms` + `table` | SaaS shape — marketing landing → auth-gated `app/*` routes (dashboard, users, invoices, settings) → an invoice PDF/email export demo built on `@pyreon/document-primitives`. Server-required, so `static` is excluded. Preselects **both** integrations. |
| **`monorepo`** | SSR streaming | no | `store` + `query` + `forms` | Bun workspaces shell — `apps/web/` (a full `app`-shaped project) + `packages/ui/` + `packages/types/`. |

```bash
npm create @pyreon/zero@latest my-app -- --template dashboard
npm create @pyreon/zero@latest my-blog -- --template blog
```

:::note{title="Templates and modes are orthogonal to presets"}
A preset sets the `(features, mode, adapter)` trio but **does not** pick the template. You can combine any template with any preset (where the template doesn't force a mode). When a template forces its mode (`blog`, `dashboard`), the rendering-mode prompt is skipped and any `--mode` you pass is overridden by the template.
:::

### Generated structure (flat templates)

The `app` template scaffolds the following. `blog` and `dashboard` share the same shell (entry points, config, `public/`) with different `src/routes/` content.

```
my-app/
├── package.json            # generated — deps computed from your selections
├── vite.config.ts          # generated — plugins computed from mode + adapter + compat
├── tsconfig.json           # strict, jsxImportSource: @pyreon/core, moduleResolution: bundler
├── index.html              # #app mount point + theme-flash-prevention script
├── env.d.ts                # ambient types for virtual:zero/* modules
├── .gitignore
├── README.md
├── public/
│   └── favicon.svg
└── src/
    ├── entry-client.ts     # startClient({ routes }) from @pyreon/zero/client
    ├── entry-server.ts     # createServer({ ... }) with the SSR mode baked in
    ├── global.css
    └── routes/             # file-based routing
        ├── index.tsx
        ├── about.tsx
        ├── counter.tsx
        ├── _layout.tsx
        ├── _error.tsx
        ├── _loading.tsx
        ├── (admin)/dashboard.tsx
        ├── api/health.ts
        ├── api/posts.ts
        └── posts/
            ├── index.tsx
            └── [id].tsx
```

There is **no `pyreon.config.ts`** — all configuration lives in `vite.config.ts` via the `zero({ ... })` plugin and in `tsconfig.json`. Selecting the `store` feature adds `src/stores/app.ts` (and swaps in a store-aware `_layout.tsx`); selecting `feature` adds `src/features/posts.ts` + a `posts/new.tsx` route. Integration and AI selections add their own files (see below).

### Monorepo layout

`--template monorepo` scaffolds the web app first (running the full flat pipeline against `apps/web/` with the `app` shape), then wraps it in a Bun workspaces root:

```
my-mono/
├── package.json            # workspaces: ["apps/*", "packages/*"] + proxy scripts
├── tsconfig.json           # root TS settings
├── README.md
├── .gitignore
├── apps/
│   └── web/                # full app-shaped project
│       ├── package.json    # name: "web" + workspace deps on the shared packages
│       └── …               # everything the `app` template produces
└── packages/
    ├── ui/                 # @my-mono/ui — shared component stub
    │   ├── package.json    # deps: { "@my-mono/types": "workspace:^" }
    │   ├── tsconfig.json
    │   └── src/index.ts    # Button + ButtonProps stub
    └── types/              # @my-mono/types — framework-agnostic shared types
        ├── package.json
        ├── tsconfig.json
        └── src/index.ts    # ButtonVariant + User stubs
```

The `@<projectName>/` scope is derived from the project name automatically — no extra prompt. The root `package.json` carries no dependencies; it's a dispatcher whose `dev` / `build` / `preview` scripts proxy to the web app via `bun run --filter='web' …`, and `typecheck` runs `--filter='*'`. All your feature / adapter / integration / AI / lint choices apply to the inner web app (which is always `app`-shaped today).

## Rendering modes

Set with `--mode` (ignored when the template forces a mode). The mode maps directly to the generated `vite.config.ts` and `entry-server.ts`.

| Mode | `zero({ ... })` | When to use |
| --- | --- | --- |
| `ssr-stream` | `mode: 'ssr', ssr: { mode: 'stream' }` | **Recommended.** Progressive HTML with Suspense — best TTFB. |
| `ssr-string` | `mode: 'ssr'` | Buffered HTML — simpler, slower first byte. |
| `ssg` | `mode: 'ssg'` | Pre-rendered at build time. No runtime server. |
| `spa` | `mode: 'spa'` | Client-only — no server rendering. |

At the server level the `ssr.mode` field only has `stream` / `string`; `ssg` and `spa` both fall back to `string` (SSG renders once at build time; SPA never SSRs). See [Zero → Rendering modes](/docs/zero) for the full semantics.

## Deployment adapters

Pick a target during the prompt or pass `--adapter`. The prompt is filtered to the adapters the chosen template supports. Each adapter writes its platform deploy artefacts and (where applicable) injects the matching `*Adapter()` factory into the generated `vite.config.ts`.

| Adapter | Vite factory | Files written | Env keys |
| --- | --- | --- | --- |
| `vercel` | `vercelAdapter()` | `vercel.json` | — |
| `cloudflare` | `cloudflareAdapter()` | `wrangler.toml`, `_routes.json` | — |
| `netlify` | `netlifyAdapter()` | `netlify.toml` | — |
| `node` | `nodeAdapter()` | `Dockerfile`, `.dockerignore` | `PORT` |
| `bun` | `bunAdapter()` | `Dockerfile` (Bun-based), `.dockerignore` | `PORT` |
| `static` | (none) | (none — `dist/` after build is the whole site) | — |

```bash
npm create @pyreon/zero@latest my-app -- --adapter cloudflare
```

:::warning{title="Template adapter compatibility"}
The `blog` template excludes `node` / `bun` (a static blog needs no runtime), and the `dashboard` template excludes `static` (auth + db need a server). Passing an unsupported `--adapter` for a template fails fast with the allowed list — e.g. `--template dashboard --adapter static` exits with an error.
:::

:::note{title="Cloudflare SSR needs `nodejs_compat`"}
The generated Cloudflare `wrangler.toml` sets the `nodejs_compat` flag for you — the SSR bundle imports `node:async_hooks` and `node:fs`, which workerd resolves only with that flag. See [Deployment](/docs/guides/deployment) for the details.
:::

## Features

22 Pyreon fundamentals can be enabled per project. The interactive flow offers a **preset shortcut first**; choosing `Custom` drops you into a multiselect grouped into 8 categories for discoverability.

### Presets

Four atomic shortcuts via `--preset`. Each is a `(features, mode, adapter)` triple:

| Preset | Feature set | Mode | Adapter |
| --- | --- | --- | --- |
| `minimal` | (none) | `spa` | `static` |
| `standard` | `store` + `query` + `forms` | `ssr-stream` | `vercel` |
| `dashboard` | `standard` + `table` + `charts` | `ssr-stream` | `vercel` |
| `full` | every feature (22) | `ssr-stream` | `vercel` |

```bash
npm create @pyreon/zero@latest my-app -- --preset standard --yes
npm create @pyreon/zero@latest my-app -- --preset full --yes
```

### Feature categories

When you pick `Custom`, the multiselect groups features for browsing:

| Category | Features |
| --- | --- |
| State management | `store`, `state-tree`, `storage`, `url-state` |
| Forms + validation | `forms`, `feature` |
| Data fetching + transforms | `query`, `rx` |
| UI primitives + animation | `styler`, `elements`, `animations`, `coolgrid` |
| Collections + tables | `table`, `virtual` |
| Interactive widgets | `charts`, `code`, `flow`, `toast` |
| Internationalization + accessibility | `i18n`, `hotkeys`, `permissions` |
| Utility hooks | `hooks` |

Each feature pulls its package(s) into `dependencies`. Some pull peers — `query` adds `@tanstack/query-core`, `forms` adds `@pyreon/validation` + `zod`, and the `feature` (CRUD) bundle pulls `store` + `query` + `forms` + their peers.

### Atomic add / remove

`--with-<feature>` adds one feature; `--no-<feature>` removes one. They **compose on top of** whatever the base set is (preset, explicit `--features`, or template default under `--yes`):

```bash
# Standard preset, plus i18n, minus forms
npm create @pyreon/zero@latest my-app -- --preset standard --with-i18n --no-forms --yes
```

`--no-X` always wins over `--with-X` for the same feature (set-subtraction semantics). An unknown feature in `--with-` / `--no-` is a hard error that prints the known list.

### Explicit feature list

`--features <csv>` is an explicit set that **overrides `--preset` entirely** (only `--with-` / `--no-` still compose on top):

```bash
npm create @pyreon/zero@latest my-app -- --features store,query,i18n --with-toast --yes
```

:::warning{title="`--features` values are not validated"}
Unlike `--with-X` / `--no-X` (which error on an unknown feature), the `--features` csv is taken as-is — a typo like `--features stroe` silently contributes nothing (the unknown key has no dependency to add). Use `--with-X` if you want a hard error on typos.
:::

### Resolution order

When several feature sources are combined, the highest-priority source wins as the base, then `--with-X` / `--no-X` overlay on top:

1. `--features <csv>` — explicit list, ignores preset + template default
2. `--preset <id>` — preset's feature set as the base (skips the feature prompts)
3. `--yes` (no preset / features) — the chosen template's default features
4. Interactive — preset prompt → `Custom` → grouped multiselect

## Package imports

The `--packages` flag (prompt: "Package imports") chooses how features reach your code:

| Value | Behaviour |
| --- | --- |
| `meta` | Adds `@pyreon/meta` — a single barrel re-exporting everything, tree-shaken at build. Simpler imports. |
| `individual` | Installs only the packages your selected features need — smaller `node_modules`. |

```bash
npm create @pyreon/zero@latest my-app -- --packages individual --yes
```

Either way, the specific feature packages are still added to `dependencies` (templates import them by their real package name, e.g. `@pyreon/query`); `meta` just adds the barrel on top for ergonomic imports.

## Backend integrations

Two scaffolders that write **plain files into your project** — no Pyreon-side wrapper packages and no version coupling. You own the code and update it independently of Pyreon releases. Select with `--integrations` (csv) or the multiselect.

| Integration | Files written | Dependencies | Env keys |
| --- | --- | --- | --- |
| `supabase` | `src/lib/supabase.ts` (+ `src/lib/auth.ts`, `src/lib/db.ts` on the `dashboard` template) | `@supabase/supabase-js` | `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| `email` | `src/lib/email.ts`, `src/emails/welcome.tsx`, `src/routes/api/email/welcome.ts` | `resend`, `@pyreon/document-primitives`, `@pyreon/document`, `@pyreon/connector-document` | `RESEND_API_KEY`, `EMAIL_FROM` |

Each integration appends its env keys to a generated `.env.example`. On the `dashboard` template, Supabase's `auth.ts` / `db.ts` replace the template's in-memory stubs (same contract). The `dashboard` template preselects both integrations; on `app` / `blog` they're off by default but selectable.

```bash
npm create @pyreon/zero@latest my-saas -- --template dashboard --integrations supabase,email --yes
```

The email integration showcases the **document-primitives angle**: the same `<DocDocument>` / `<DocSection>` / `<DocText>` tree renders in the browser **and** exports to email HTML via `@pyreon/document-primitives` — one author surface for many output formats.

## AI tooling

Generate per-tool rule files so AI assistants understand Pyreon's conventions. All share a canonical "Pyreon principles" body, so the guidance stays consistent across editors. Select with `--ai` (csv) or the multiselect.

| Option | File written | Default |
| --- | --- | --- |
| `mcp` | `.mcp.json` (also adds `@pyreon/mcp` as a dev dep) | ✓ |
| `claude` | `CLAUDE.md` (includes a `bun run doctor` line) | ✓ |
| `cursor` | `.cursor/rules/pyreon.md` | — |
| `copilot` | `.github/copilot-instructions.md` | — |
| `agents` | `AGENTS.md` | — |

```bash
npm create @pyreon/zero@latest my-app -- --ai mcp,claude,cursor --yes
```

## Compat mode

Migrating from another framework? `--compat` (or the "Migrating from another framework?" prompt) configures `@pyreon/vite-plugin` with the matching shim and adds the matching compat package.

| Value | Package added | Lets you write |
| --- | --- | --- |
| `none` | — | Native Pyreon (recommended) |
| `react` | `@pyreon/react-compat` | `useState`, `useEffect`, … |
| `vue` | `@pyreon/vue-compat` | `ref`, `computed`, `watch`, … |
| `solid` | `@pyreon/solid-compat` | `createSignal`, `createEffect`, … |
| `preact` | `@pyreon/preact-compat` | `useState`, signals, … |

```bash
npm create @pyreon/zero@latest my-app -- --compat react --yes
```

## Lint

`--lint` / `--no-lint` (prompt: "Include @pyreon/lint?", default yes) toggles `@pyreon/lint`. When enabled, the scaffolder adds the dev dep, writes a `.pyreonlintrc.json` with the recommended preset, and adds a `lint` script (`pyreon-lint .`).

```bash
npm create @pyreon/zero@latest my-app -- --no-lint --yes
```

## Generated `package.json` scripts

Every scaffolded project gets these scripts (lint adds one more when enabled):

| Script | Command | Purpose |
| --- | --- | --- |
| `dev` | `zero dev` | Dev server with HMR |
| `build` | `zero build` | Production build |
| `preview` | `zero preview` | Preview the production build locally |
| `doctor` | `zero doctor` | Project health audit (React-pattern + anti-pattern detection) |
| `doctor:fix` | `zero doctor --fix` | Auto-fix what the audit can |
| `doctor:ci` | `zero doctor --ci` | Exit non-zero on findings (CI gate) |
| `lint` | `pyreon-lint .` | Only present when `@pyreon/lint` is enabled |

The dev dependencies always include `@pyreon/vite-plugin`, `@pyreon/zero-cli` (the `zero` CLI), `typescript`, and `vite`. See [Zero CLI](/docs/zero-cli) for the `zero` command surface.

## CLI flags

Every prompt maps to a flag, so the entire flow is scriptable. Run `--help` (or `-h`) for the built-in usage text.

| Flag | Values |
| --- | --- |
| `[name]` | Positional project name (required with `--yes`) |
| `--template <id>` | `app` / `blog` / `dashboard` / `monorepo` |
| `--mode <id>` | `ssr-stream` / `ssr-string` / `ssg` / `spa` |
| `--adapter <id>` | `vercel` / `cloudflare` / `netlify` / `node` / `bun` / `static` |
| `--preset <id>` | `minimal` / `standard` / `dashboard` / `full` (composes with `--with-X` / `--no-X`) |
| `--features <csv>` | e.g. `store,query,forms` — overrides `--preset` entirely |
| `--with-<feature>` | atomic add, e.g. `--with-store --with-i18n` |
| `--no-<feature>` | atomic remove, e.g. `--no-forms` |
| `--integrations <csv>` | `supabase,email` |
| `--ai <csv>` | `mcp,claude,cursor,copilot,agents` |
| `--compat <id>` | `none` / `react` / `vue` / `solid` / `preact` |
| `--packages <id>` | `meta` (single barrel) / `individual` (selected packages only) |
| `--lint` / `--no-lint` | toggle `@pyreon/lint` |
| `--yes` | skip every prompt that has a usable default |
| `--install` / `--no-install` | accepted no-ops (the scaffolder never installs) |
| `--help`, `-h` | print usage and exit |

`--packages` also accepts the aliases `--pm` and `--package-strategy`. An unknown flag, an invalid enum value, or an extra positional argument fails fast with an actionable message and a non-zero exit code.

:::warning{title="`--yes` requires a project name"}
Running `--yes` with no positional name exits with an error — there is no default name to fall back to. Always pass the name first: `npm create @pyreon/zero@latest my-app -- --yes`.
:::

### Worked examples

```bash
# Standard app, defaults for everything else
npm create @pyreon/zero@latest my-app -- --yes

# Dashboard + Supabase + Resend + full AI tooling, on Vercel
npm create @pyreon/zero@latest my-saas -- --template dashboard \
  --adapter vercel \
  --integrations supabase,email \
  --ai mcp,claude,cursor \
  --yes

# Standard preset, plus i18n, minus forms
npm create @pyreon/zero@latest my-app -- --preset standard --with-i18n --no-forms --yes

# Blog on Cloudflare Pages
npm create @pyreon/zero@latest my-blog -- --template blog --adapter cloudflare --yes

# Monorepo with the full preset, individual package imports
npm create @pyreon/zero@latest my-mono -- --template monorepo \
  --preset full --packages individual --yes

# React migration target, no lint
npm create @pyreon/zero@latest my-app -- --compat react --no-lint --yes
```

## After scaffolding

```bash
cd my-app
bun install        # or npm install / pnpm install / yarn
bun run dev        # zero dev — HMR dev server
```

The generated project is a complete Pyreon Zero app: file-based routing, SSR/SSG/SPA per your mode, `@pyreon/vite-plugin` wired up, strict TypeScript with `jsxImportSource: @pyreon/core`, and your selected features, adapter, integrations, and AI rule files all in place. From here, see:

- **[Zero](/docs/zero)** — the meta-framework the scaffolder targets (routing, rendering modes, adapters, server actions).
- **[Zero CLI](/docs/zero-cli)** — the `zero` command your scripts call (`dev` / `build` / `preview` / `doctor`).
- **[SSG](/docs/ssg)** — static generation (the `blog` template's mode).
- **[Deployment](/docs/guides/deployment)** — per-platform deploy notes for each adapter.
- **[Create Multiplatform](/docs/create-multiplatform)** — the scaffolder for iOS + Android + web targets, when you need native.

## Reference

| Flag | Default (interactive) | Notes |
| --- | --- | --- |
| `--template` | prompt (`app` under `--yes`) | Drives mode/adapter/feature/integration defaults |
| `--mode` | template default | Skipped when the template forces a mode |
| `--adapter` | template default | Prompt filtered to template-supported adapters |
| `--preset` | prompt (`Custom`) | `minimal` / `standard` / `dashboard` / `full` |
| `--features` | template default | csv; overrides `--preset`; not validated |
| `--with-<feature>` | — | composes on top of the base set; errors on unknown |
| `--no-<feature>` | — | composes on top; wins over `--with-` for the same feature |
| `--integrations` | template default (`[]`, both for `dashboard`) | `supabase` / `email` |
| `--ai` | `mcp,claude` | `mcp` / `claude` / `cursor` / `copilot` / `agents` |
| `--compat` | `none` | `react` / `vue` / `solid` / `preact` shim |
| `--packages` | prompt | `meta` / `individual` (aliases: `--pm`, `--package-strategy`) |
| `--lint` | `true` | `--no-lint` to opt out |
| `--yes` | — | requires a positional name |
