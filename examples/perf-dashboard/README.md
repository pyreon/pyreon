# @pyreon/example-perf-dashboard

Stress-test dashboard for `@pyreon/perf-harness` development. Reproduces the bokisch.com failure shape in-repo so perf investigations can run locally instead of against a private app.

## Quick start

```bash
bun run dev       # vite dev server on :5800
```

Open `http://localhost:5800`, press **Ctrl+Shift+P** (or click `perf` in the header) to toggle the counter overlay. Counters are live from boot — the entry point calls `install()` unconditionally in dev.

## What it stresses

| Section | Counters it touches |
| --- | --- |
| `Stats` (24 cards) | `styler.resolve`, `unistyle.styles`, `runtime.mountChild` |
| `Rows` (100-row table + shuffle) | `runtime.mountFor.lisOps`, `runtime.mountChild` |
| `Form` (10 controlled fields) | `reactivity.signalWrite`, `reactivity.effectRun` |
| `Modal` (mount/unmount toggle) | `runtime.mount`, `runtime.unmount` |
| Theme toggle | `styler.resolve` (full re-resolve), `styler.sheet.insert.hit` |

## Recording a journey

`src/journeys.ts` exports named journeys (`boot`, `toggleTheme`, `shuffleRows`, etc.). `scripts/perf/record.ts` imports this catalog, drives each journey through Playwright, and captures counter snapshots.

```bash
# from repo root
bun run perf:record --app perf-dashboard --journey shuffleRows
```

The record script is documented in `scripts/perf/README.md`.

## Why this isn't a real app

- No router, no data layer, no feature packages. Every line of state is explicit.
- The only imports are the five framework layers the harness instruments plus `@pyreon/styler`.
- This is deliberate — when a counter value surprises us, we want to be able to trace it back without chasing through a full application.
