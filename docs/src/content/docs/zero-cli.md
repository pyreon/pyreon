---
title: '@pyreon/zero-cli'
description: 'Unified CLI for @pyreon/zero — dev, build, preview, doctor, scaffold.'
---

# @pyreon/zero-cli

Unified CLI for `@pyreon/zero`. Wraps Vite with framework-aware defaults: the dev command prints the route table on startup, the build command resolves rendering mode and adapter from `vite.config.ts`, and `doctor` runs the Pyreon health gates. Installed as the `zero` binary.

`@pyreon/zero-cli` is a distinct package from [`@pyreon/cli`](/docs/cli) — the latter covers the framework-wide `pyreon` binary (doctor, context, no Zero awareness). Apps using `@pyreon/zero` only need `zero-cli`.

## Install

:::code-group

```bash [bun]
bun add -D @pyreon/zero-cli
```

```bash [npm]
npm install -D @pyreon/zero-cli
```

```bash [pnpm]
pnpm add -D @pyreon/zero-cli
```

:::

Most apps don't install this directly — `npm create @pyreon/zero@latest my-app` adds it as a dev dep for you.

## Quick start

```bash
zero dev                  # dev server on :3000 with HMR + route table
zero build                # production build (mode + adapter from vite.config.ts)
zero preview              # serve the production build for smoke-testing
zero doctor               # run Pyreon health gates
```

## Commands

### `zero dev [root]`

Start the Vite dev server. Prints the discovered route tree (file-system routes + API routes) on startup.

| Flag | Description |
| --- | --- |
| `--port <port>` | Server port (default `3000`; overrides `zero({ port })` from `vite.config.ts`). |
| `--host [host]` | Server host (pass `--host` alone to bind `0.0.0.0`). |
| `--open` | Open the browser on first listen. |

Port resolution order: CLI flag > `zero({ port })` in `vite.config.ts` > framework default `3000`.

### `zero build [root]`

Production build. Reads `mode`, `adapter`, and `ssg` config from `vite.config.ts`. Writes per-adapter artefacts (`.vercel/output/config.json`, `_routes.json`, `netlify.toml`, etc.) alongside `dist/`.

| Flag | Description |
| --- | --- |
| `--mode <mode>` | Override the rendering mode (`ssr` \| `ssg` \| `isr` \| `spa`). |

### `zero preview [root]`

Serve the production `dist/` for smoke-testing. Honors the same `port` resolution as `dev`.

| Flag | Description |
| --- | --- |
| `--port <port>` | Server port (default `3000`). |
| `--host [host]` | Server host. |

### `zero doctor [root]`

Run the Pyreon health gates. Detects React patterns (`useState` / `useEffect` / `className`) that don't apply in Pyreon, Pyreon-specific anti-patterns (signal-write-as-call, `<For>` without `by`, …), lint violations, distribution issues, and (with the appropriate flags) island foot-guns / SSG misconfigurations.

| Flag | Description |
| --- | --- |
| `--fix` | Auto-fix fixable issues (`className` → `class`, etc.). |
| `--json` | Machine-readable output. |
| `--ci` | Exit with code `1` on errors. |
| `--check-islands` | Run cross-file island audit. |
| `--check-ssg` | Run SSG misconfiguration audit. |
| `--audit-tests` | Audit test environment parity (mock-VNode patterns, etc.). |

### `zero context [root]`

Generate an AI-readable project-context summary at `.pyreon/context.json`. Used by editor integrations / agent tooling that want a structured view of routes, exports, and configuration.

| Flag | Description |
| --- | --- |
| `--out <path>` | Custom output path. |

### `zero create <name>`

Convenience wrapper around [`@pyreon/create-zero`](/docs/create-zero) — scaffold a new project without a separate `npm create` step. Equivalent to running `npm create @pyreon/zero@latest <name>` directly.

## Gotchas

- The CLI is a thin wrapper around Vite. For any non-trivial config (custom plugins, alias maps, build options), edit `vite.config.ts` rather than reaching for CLI flags that don't exist.
- `--port` does NOT override a port set via `zero({ port })` in the plugin's `config()` hook unless explicitly passed at the CLI. Trust the resolution order.
- `zero doctor` runs against the current working directory. Pass `[root]` if the project lives in a subdirectory.
- `zero` (this package's binary) is different from `pyreon` ([`@pyreon/cli`](/docs/cli)'s binary). Same `doctor` philosophy, different default scope. Apps using `@pyreon/zero` should use `zero`; library packages without Zero use `pyreon`.

## See also

- [Zero overview](/docs/zero) — full meta-framework reference.
- [`@pyreon/cli`](/docs/cli) — framework-wide CLI for non-Zero projects.
- [Create Zero](/docs/create-zero) — project scaffolder.
