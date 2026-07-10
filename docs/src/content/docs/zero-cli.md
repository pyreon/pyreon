---
title: '@pyreon/zero-cli'
description: 'The Zero meta-framework CLI — the `zero` binary for dev, build, preview, doctor, context, and create. A framework-aware wrapper over Vite.'
---

`@pyreon/zero-cli` ships the **`zero` binary** — the dev/build CLI for apps built on [`@pyreon/zero`](/docs/zero). It is a thin, framework-aware wrapper over Vite: `zero dev` boots Vite's dev server and prints the file-system route table, `zero build` runs the production build (one `vite build` — the `zero()` plugin chain owns the whole pipeline), and the rest (`preview`, `doctor`, `context`, `create`) round out the day-to-day workflow.

<PackageBadge name="@pyreon/zero-cli" href="/docs/zero-cli" />

## Installation

:::code-group

```bash [npm]
npm install -D @pyreon/zero-cli
```

```bash [bun]
bun add -D @pyreon/zero-cli
```

```bash [pnpm]
pnpm add -D @pyreon/zero-cli
```

```bash [yarn]
yarn add -D @pyreon/zero-cli
```

:::

Most apps never install this directly — `bun create @pyreon/zero my-app` (see [`@pyreon/create-zero`](/docs/create-zero)) adds it as a dev dependency and wires the `package.json` scripts for you.

The package installs a single binary, **`zero`**. Its dependencies (`@pyreon/zero`, `@pyreon/server`, `@pyreon/cli`, `@pyreon/create-zero`, plus `vite` and `cac`) are pulled in transitively — you don't list them yourself.

## Why a dedicated CLI?

Vite alone doesn't know about Zero's conventions — file-system routing, per-route render modes, SSR/SSG server builds, or deploy adapters. `zero` closes that gap with the smallest possible surface:

- **`zero dev`** boots `vite.createServer()` and then prints the discovered route tree, so you see your page and API routes the moment the server is up.
- **`zero build`** runs **one** `vite build` and lets the `zero()` plugin chain own the entire production pipeline — client bundle, SSR/ISR server bundle + production template, SSG prerendering, deploy-adapter staging. It exists for the scaffolded `bun run build` script and symmetric UX, not to add build steps.
- **`zero preview`** serves the built client bundle (`dist/client/` when a node/bun-adapter build staged one, otherwise your `build.outDir`).
- **`zero doctor`** / **`zero context`** delegate to [`@pyreon/cli`](/docs/cli)'s health gates and AI-context generator, scoped to a Zero project.

Everything heavier — plugins, aliases, build tuning — lives in `vite.config.ts`. The CLI deliberately exposes only the few flags that make sense to flip per-invocation.

## Quick Start

A scaffolded project wires these into `package.json` scripts:

```json
{
  "scripts": {
    "dev": "zero dev",
    "build": "zero build",
    "preview": "zero preview",
    "doctor": "zero doctor"
  }
}
```

So the everyday loop is:

```bash
bun run dev       # → zero dev      (dev server + route table)
bun run build     # → zero build    (production build)
bun run preview   # → zero preview  (serve the build locally)
bun run doctor    # → zero doctor   (Pyreon health gates)
```

You can also invoke the binary directly:

```bash
zero dev                  # dev server on :3000 with HMR + route table
zero build                # production build (mode + adapter from vite.config.ts)
zero preview              # serve the production build for smoke-testing
zero doctor               # run Pyreon health gates
zero context              # write an AI-readable project summary
zero create my-app        # scaffold a new project
```

Every command except `create` takes an optional `[root]` positional argument — the project directory to operate in (defaults to the current working directory). Pass it when the project lives in a subdirectory:

```bash
zero dev ./apps/web
zero build packages/site
```

## Commands

### `zero dev [root]`

Start the Vite dev server with HMR, then print a compact startup banner: a one-line route summary, the **Local URL**, and the **ready time**.

| Flag | Description |
| --- | --- |
| `--port <port>` | Server port. Defaults to `3000` (see resolution order below). |
| `--host [host]` | Bind host. Pass `--host` alone to bind `0.0.0.0` (exposes the server on your LAN); pass `--host <addr>` for a specific interface. Omitted → Vite's default (localhost only). |
| `--open` | Open the browser on first listen. |
| `--routes` | Print the full route table instead of the collapsed one-line summary. |

```bash
zero dev                       # localhost:3000 — collapsed route summary
zero dev --port 5173           # explicit port
zero dev --host                # bind 0.0.0.0 — reachable from other devices
zero dev --host 192.168.1.50   # bind a specific interface
zero dev --open                # auto-open the browser
zero dev --routes              # expand the full route table
```

**Port resolution order** (highest precedence first):

```text
1. --port <port>            CLI flag
2. zero({ port })           vite.config.ts plugin config
3. 3000                     framework default
```

The CLI intentionally has **no** hardcoded default on the `--port` flag. When you omit it, the value falls through to `zero({ port })` from your `vite.config.ts`, and only then to `3000`. This is what lets an app with `zero({ port: 8080 })` work without also passing `--port` on every invocation.

The route banner is **collapsed to a one-line summary by default** — e.g. `Routes  SSR 15 · SSG 4 · API 1` — with per-mode page counts (`SSR` / `SSG` / `SPA` / `ISR`) plus the API count. Pass `--routes` to expand the full table (one line per route, API routes listed separately under their URL pattern). The banner is informational — if route scanning fails for any reason, the dev server still starts.

The **Local URL and ready time are always printed last**, after the route banner. This keeps them visible even when a large app is run under a wrapping task runner such as `bun run --filter <app> dev`, whose runner elides the *middle* of long child output and keeps only the tail — a full route table printed first would push the URL off the top.

The banner honors [`NO_COLOR`](https://no-color.org) / `FORCE_COLOR` and falls back to plain text on a non-interactive stdout, so piped output (`bun run dev > log`, CI) stays free of raw escape codes.

:::tip
`--host` exposes your dev server to the local network. Use it to test on a phone or another machine, but don't leave it on for a server you don't trust the network around.
:::

### `zero build [root]`

Run the full production build — **exactly `vite build`, run once**. The `zero()` plugin chain from your `vite.config.ts` owns the entire pipeline (this is the same battle-tested path a plain `vite build` of any Zero app takes):

1. **Client bundle** → `dist/` (your project's `build.outDir`).
2. **SSR/ISR** (`mode: 'ssr' | 'isr'`): server bundle → `dist/server/entry-server.js` (your `src/entry-server.ts` when present, a synthetic entry otherwise — zero-config apps get a server bundle too) **plus** `dist/server/template.html`, the built client `index.html` staged next to the entry as the production SSR template (hashed asset refs — this is what makes the deployed page hydrate).
3. **SSG** (`mode: 'ssg'`, plus hybrid static-first routes in server modes): prerendered per-route HTML into `dist/`.
4. **Deploy adapter** (Vercel / Netlify / Cloudflare / Node / Bun / static): platform artefacts staged into the same `dist/` tree — e.g. the node adapter emits `dist/index.js` + a clean `dist/client/` copy of the client assets, Vercel emits `dist/.vercel/output/`, Cloudflare emits `dist/_worker.js` + `_routes.json`.

On success it prints `Build completed in <N>ms`. On failure it logs `Build failed: <message>` and exits with code `1` — including when an **explicitly configured** adapter's build step fails (an auto-selected adapter failure is reported but doesn't fail the build; the server bundle itself is still usable).

```bash
zero build                 # mode + adapter resolved from vite.config.ts
zero build ./apps/web      # build a project in a subdirectory
```

:::note{title="No --mode flag"}
The render mode comes from `zero({ mode })` in `vite.config.ts` — the plugin instances are constructed from that file, so a CLI flag structurally cannot override them. Earlier versions accepted `--mode` as a "fallback"; it only gated the CLI's own (since removed) duplicate build passes while the plugin ran its configured mode regardless, so it was dropped. To switch modes, change the config. The full mode reference (what each mode emits) lives in the [Zero docs](/docs/zero).
:::

:::note
If the project has no `pyreon-zero` plugin in its Vite plugin chain, `zero build` is just a plain `vite build` — client bundle only, no server bundle or adapter artefacts.
:::

:::tip{title="Upgrading from ≤ 0.43"}
Older versions ran extra CLI-owned passes on top of the plugin: a duplicate server build to `dist/server/` and an adapter pass into `dist/output/` — the `dist/output` server bundle was staged **without** `template.html`, so a deployed `dist/output` server rendered but never hydrated, and zero-config apps got no server bundle at all (silently). Deploy the plugin-owned `dist/` tree instead (`node dist/index.js` for the node adapter); `dist/output` no longer exists.
:::

### `zero preview [root]`

Serve the production build locally for smoke-testing, via `vite preview`.

| Flag | Description |
| --- | --- |
| `--port <port>` | Server port. Same resolution order as `dev` (`--port` → `zero({ port })` → `3000`). |
| `--host [host]` | Bind host. `--host` alone binds `0.0.0.0`. |

```bash
zero build && zero preview          # build, then serve it
zero preview --port 4173            # explicit preview port
zero preview --host                 # expose the preview on your LAN
```

`zero build` puts the client bundle at your project's `build.outDir` (`dist/` by default), which `vite preview` serves natively. When a `dist/client/` directory exists — the node/bun adapters stage a clean copy of the client assets there, next to the emitted `dist/index.js` runner — `zero preview` prefers it, so the preview doesn't also expose the server bundle / adapter scaffolding at the `dist/` top level.

:::warning{title="Build first"}
`zero preview` serves whatever is already on disk. It does **not** trigger a build. Run `zero build` first, or your preview will serve a stale (or missing) bundle. `preview` is a static smoke-test of the client bundle — it does not run your SSR server entry. To exercise SSR/SSG/adapter output, run the emitted server bundle (e.g. `node dist/index.js` for the node adapter) or deploy per your adapter's instructions.
:::

### `zero doctor [root]`

Run Pyreon's project health gates against the project. Delegates to [`@pyreon/cli`](/docs/cli)'s `doctor` — it surfaces React-isms that don't apply in Pyreon (`useState`, `useEffect`, `className`), Pyreon-specific anti-patterns (signal-write-as-call, `<For>` without `by`, …), lint findings, distribution issues, and more.

| Flag | Description |
| --- | --- |
| `--fix` | Auto-fix the fixable findings (e.g. `className` → `class`). |
| `--json` | Emit machine-readable JSON instead of the formatted report. |
| `--ci` | CI mode — exit with code `1` when there are errors. |

```bash
zero doctor                # formatted report against the cwd
zero doctor --fix          # apply auto-fixes
zero doctor --json         # JSON output for tooling
zero doctor --ci           # non-zero exit on errors — wire into CI
zero doctor ./apps/web     # check a project in a subdirectory
```

:::note
`zero doctor` exposes exactly three flags: `--fix`, `--json`, `--ci`. The richer audits some workflows reach for — cross-file island checks, SSG misconfiguration audits, test-environment parity — live on the framework-wide `pyreon doctor` binary in [`@pyreon/cli`](/docs/cli), and are **not** forwarded through `zero doctor`. Run `pyreon doctor --check-islands` / `--check-ssg` / `--audit-tests` for those.
:::

### `zero context [root]`

Generate an AI-readable project-context summary (a structured view of routes, exports, and configuration) by delegating to [`@pyreon/cli`](/docs/cli)'s `generateContext`. Editor integrations and agent tooling consume the resulting file.

| Flag | Description |
| --- | --- |
| `--out <path>` | Output path. Defaults to `.pyreon/context.json`. |

```bash
zero context                       # write .pyreon/context.json
zero context --out ./ctx.json      # custom output path
zero context ./apps/web            # generate for a subdirectory project
```

### `zero create <name>`

Scaffold a new Pyreon Zero project from the bundled default template. `<name>` is required — it's both the new directory name and the generated `package.json` `name`.

```bash
zero create my-app
```

What it does:

1. Refuses to overwrite — errors out if a directory named `<name>` already exists.
2. Copies `@pyreon/create-zero`'s **default** template into `./<name>`.
3. Rewrites the template's `package.json` `name` to your project name.
4. Writes a starter `.gitignore` (`node_modules`, `dist`, `.DS_Store`, `*.local`).
5. Prints next steps.

```text
Created "my-app"!

Next steps:
  cd my-app
  bun install
  bun run dev
```

:::tip
`zero create` ships only the **default** template (no prompts). For the full interactive scaffolder — template choice, feature presets, deployment adapter, compat mode, monorepo layout — use `bun create @pyreon/zero` (see [`@pyreon/create-zero`](/docs/create-zero)). The CLI's `create` is the zero-prompt shortcut.
:::

## How it relates to Vite and the `zero()` plugin

`zero` is a wrapper, not a replacement, for Vite:

- `zero dev` calls Vite's `createServer()`.
- `zero build` calls Vite's `build()` once per pass.
- `zero preview` calls Vite's `preview()`.

Your `vite.config.ts` is the single source of truth for everything else — plugins, aliases, build options, and crucially the `zero({ ... })` plugin, which declares your **render mode**, **port**, **deploy adapter**, and **SSG paths**. The CLI reads that config back at runtime (via an internal accessor on the resolved `pyreon-zero` plugin instance) to decide how to build and which port to serve on:

```ts title="vite.config.ts"
import { defineConfig } from 'vite'
import { pyreon } from '@pyreon/vite-plugin'
import { zero } from '@pyreon/zero'

export default defineConfig({
  plugins: [
    pyreon(),
    zero({
      mode: 'ssr',        // ← zero build reads this (wins over --mode)
      port: 5173,         // ← zero dev / preview read this (below --port)
      // adapter, ssg: { paths }, … also read by zero build
    }),
  ],
})
```

The flags `zero` exposes are deliberately minimal — the per-invocation knobs that make sense on a command line (`--port`, `--host`, `--open`, the doctor flags). Anything structural belongs in `vite.config.ts`.

## Gotchas

- **The CLI is a thin Vite wrapper.** For custom plugins, alias maps, or build tuning, edit `vite.config.ts` — don't look for CLI flags that don't exist. The complete flag set is in the [reference table](#command--flag-reference) below.
- **`--port` does not always win at the CLI.** It does — but only when you actually pass it. If you omit it, `zero({ port })` from config wins over the `3000` default. Trust the resolution order.
- **There is no `--mode` flag.** The render mode is `zero({ mode })` in `vite.config.ts` — the plugin instances are constructed from that file, so a CLI flag can't reach them. Change the config to switch modes.
- **`zero preview` does not build for you** — run `zero build` first. It serves `dist/client/` when a node/bun-adapter build staged it, otherwise your `build.outDir`.
- **`zero` is not `pyreon`.** `zero` (this package) is the Zero-aware CLI for `@pyreon/zero` apps; `pyreon` ([`@pyreon/cli`](/docs/cli)) is the framework-wide CLI for non-Zero / library packages. Same `doctor` philosophy, different default scope. Zero apps should use `zero`.
- **`zero --version` reports `0.0.1`.** The `--version` string is a placeholder baked into the CLI, independent of the installed package version. Check `package.json` (or `npm ls @pyreon/zero-cli`) for the real version.
- **`zero create` is template-only.** It copies the *default* `@pyreon/create-zero` template with no prompts. The next-steps it prints assume `bun`; substitute your package manager (`npm install` / `pnpm install`) as needed.

## Command & flag reference

| Command | Positional | Flags | Purpose |
| --- | --- | --- | --- |
| `zero dev [root]` | `[root]` (dir, default `.`) | `--port <port>`, `--host [host]`, `--open` | Vite dev server + route table |
| `zero build [root]` | `[root]` | — | Production build (one `vite build`; the zero plugin owns client + SSR + prerender + adapter) |
| `zero preview [root]` | `[root]` | `--port <port>`, `--host [host]` | Serve the built client bundle locally |
| `zero doctor [root]` | `[root]` | `--fix`, `--json`, `--ci` | Pyreon health gates |
| `zero context [root]` | `[root]` | `--out <path>` (default `.pyreon/context.json`) | AI-readable project summary |
| `zero create <name>` | `<name>` (required) | — | Scaffold from the default template |
| `zero --help` | — | — | Print usage |
| `zero --version` | — | — | Print version (placeholder `0.0.1`) |

Render modes (`ssr`, `ssg`, `isr`, `spa`) are set via `zero({ mode })` in `vite.config.ts`; the default is `ssr`. What each mode emits is documented in the [Zero overview](/docs/zero).

## See also

- [Zero overview](/docs/zero) — the full meta-framework: file-system routing, render modes, adapters, SSG paths.
- [`@pyreon/create-zero`](/docs/create-zero) — the interactive project scaffolder (`bun create @pyreon/zero`).
- [`@pyreon/cli`](/docs/cli) — the framework-wide `pyreon` binary that backs `zero doctor` / `zero context`.
