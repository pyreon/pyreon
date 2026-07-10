# @pyreon/zero-cli

Unified CLI for `@pyreon/zero` — dev, build, preview, doctor, scaffold.

Wraps Vite with framework-aware defaults: the dev command prints the route table on startup, the build command resolves rendering mode and adapter from `vite.config.ts`, and `doctor` runs the Pyreon health gates (React patterns, framework foot-guns, lint, distribution checks). Installed as the `zero` binary.

## Install

```bash
bun add -D @pyreon/zero-cli
```

Most apps don't install this directly — `bun create @pyreon/zero my-app` adds it as a dev dep for you.

## Quick start

```bash
zero dev                  # start the dev server on :3000 with HMR + route table
zero build                # production build (= vite build; the zero plugin owns the pipeline)
zero preview              # serve the production build for smoke-testing
zero doctor               # run Pyreon health gates
```

## Commands

### `zero dev [root]`

Start the Vite dev server. Prints the discovered route tree (file-system routes + API routes) on startup.

```
--port <port>      Server port (default: 3000; overrides zero({ port }) from vite.config.ts)
--host [host]      Server host (pass --host alone to bind 0.0.0.0)
--open             Open the browser on first listen
```

Port resolution order: CLI flag > `zero({ port })` in `vite.config.ts` > framework default `3000`.

### `zero build [root]`

Production build — exactly `vite build`, run once. The `zero()` plugin chain from `vite.config.ts` owns the entire pipeline: client bundle → `dist/`, SSR/ISR server bundle + production `template.html` → `dist/server/`, SSG prerendered HTML, and deploy-adapter artefacts (`.vercel/output/`, `_routes.json`, `netlify.toml`, `dist/index.js`, …) staged into the same `dist/` tree.

There is no `--mode` flag: the render mode comes from `zero({ mode })` in `vite.config.ts` — the plugin instances are constructed from that file, so a CLI flag can't override them.

### `zero preview [root]`

Serve the production build for smoke-testing (`dist/client/` when a node/bun-adapter build staged it, otherwise the project's `build.outDir`). Honors the same `port` resolution as `dev`.

```
--port <port>      Server port (default: 3000)
--host [host]      Server host
```

### `zero doctor [root]`

Run the Pyreon health gates. Detects React patterns (`useState` / `useEffect` / `className`) that don't apply in Pyreon, Pyreon-specific anti-patterns (signal-write-as-call, `<For>` without `by`, …), lint violations, distribution issues, and (with the appropriate flags) island foot-guns / SSG misconfigurations.

```
--fix              Auto-fix fixable issues (className → class, etc.)
--json             Machine-readable output
--ci               Exit with code 1 on errors
```

### `zero context [root]`

Generate an AI-readable project-context summary at `.pyreon/context.json`. Used by editor integrations / agent tooling that want a structured view of routes, exports, and configuration.

```
--out <path>       Custom output path
```

### `zero create <name>`

Convenience wrapper around `@pyreon/create-zero` — scaffold a new project without a separate `bunx` step. Equivalent to running `bunx create-pyreon-app <name>` directly.

## Gotchas

- The CLI is a thin wrapper around Vite. For any non-trivial config (custom plugins, alias maps, build options), edit `vite.config.ts` rather than reaching for CLI flags that don't exist.
- `--port` does NOT override a port set via `zero({ port })` in the plugin's `config()` hook unless explicitly passed at the CLI. Trust the resolution order.
- `zero doctor` runs against the current working directory. Pass `[root]` if the project lives in a subdirectory.

## Documentation

Full docs: [pyreon.dev/docs/cli](https://pyreon.dev/docs/cli) (or `docs/src/content/docs/cli.md` in this repo).

## License

MIT
