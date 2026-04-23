# @pyreon/perf-harness

Internal (private) package. Dev-time instrumentation — named call counters, snapshot/diff, window global, scripted recording.

Not published to npm. Consumed via workspace protocol by framework packages (to emit counter writes) and by examples / scripts (to read and diff counters).

## Why

Synthetic benchmarks (krausest-style) don't catch the shapes of real-app perf regressions. Three recent bokisch.com bugs (DynamicStyled effect regression, startClient re-render, unistyle 263-descriptor scan) were only found by ad-hoc `console.count` bolted into a running app. This package is that bolting, made permanent — a shared counter registry every framework layer can emit to, with isolation + diffing built in.

Counter writes are gated at framework call sites with `import.meta.env?.DEV === true`, so prod bundles tree-shake the calls. The harness itself starts disabled, so even in dev there is zero bookkeeping cost until something opts in via `install()` or `perfHarness.enable()`.

## Usage (framework-internal)

Framework packages (styler, unistyle, router, …) are PUBLISHED to npm and must not depend on this private package — it would break npm install for external consumers. Instead, they emit through a dev-only global sink:

```ts
// Inside a framework package (e.g. styler/src/resolve.ts) — NO import.
declare const globalThis: {
  __pyreon_count__?: (name: string, n?: number) => void
}

export function resolve(...) {
  if (import.meta.env?.DEV === true) globalThis.__pyreon_count__?.('styler.resolve')
  // ...
}
```

`@pyreon/perf-harness` publishes `_count` onto `globalThis.__pyreon_count__` on `install()` / `enable()`, and removes it on `disable()`. Until then the `?.` short-circuits — counter bookkeeping costs nothing, and there is no import-time coupling.

Rules:

- **Always guard at the call site.** `if (import.meta.env?.DEV === true) globalThis.__pyreon_count__?.(...)` — not just inside the sink. The literal `false` from the dev gate is what lets Vite/Rolldown drop the whole call tree in prod.
- **Name counters `<layer>.<action>`.** e.g. `styler.resolve`, `unistyle.styles`, `router.navigate`. One dotted segment per layer, one per action.
- **Counters are opt-in at runtime.** The default is off — `globalThis.__pyreon_count__` is undefined until `perfHarness.enable()` or `install()` has been called. Zero cost on cold import.

## Usage (consumer — examples, scripts)

```ts
import { install, perfHarness } from '@pyreon/perf-harness'

// Turn it on. Also attaches to window.__pyreon_perf__ for devtools use.
install()

// Isolated measurement window:
const { diff, after } = await perfHarness.record('mount-dashboard', () => {
  mount(<Dashboard />, container)
})
console.log(perfHarness.formatDiff(diff))

// Or raw snapshots:
perfHarness.reset()
doThing()
const counters = perfHarness.snapshot()
```

After `install()`, the harness is also reachable from devtools:

```js
__pyreon_perf__.snapshot()
__pyreon_perf__.reset()
__pyreon_perf__.record('nav', () => router.push('/x'))
```

## API

| Export | Purpose |
| --- | --- |
| `_count(name, n?)` | Increment a counter. No-op when disabled. Guard at call site. |
| `_reset()` | Clear all counters. Does not change the enabled flag. |
| `_snapshot()` | Materialise counter state as a plain object. |
| `_enable()` | Enable counter writes + publish `globalThis.__pyreon_count__` sink. |
| `_disable()` | Disable counter writes + remove the sink. |
| `_isEnabled()` | Read current enabled state. |
| `perfHarness` | Object bundling all of the above + `record`, `diff`, `formatDiff`. |
| `install()` | `_enable()` + attach full API to `globalThis.__pyreon_perf__`. |
| `uninstall()` | Remove the `__pyreon_perf__` global (writes stay on). |
| `diffSnapshots(a,b)` | Structured diff of two snapshots. |
| `formatDiff(diff)` | Fixed-width table for printing to console / overlay. |

## Scope & roadmap

PR 1 (this one): counter API, snapshot/diff/reset, install/uninstall, record. Instrumentation for `@pyreon/styler` and `@pyreon/unistyle`.

Planned in follow-up PRs:

- Overlay (`perfHarness.overlay()`) — in-page HTML panel showing live counters
- Instrumentation for `@pyreon/rocketstyle`, `@pyreon/runtime-dom`, `@pyreon/router`
- `examples/perf-*` stress apps (dashboard, list, form, realtime, route)
- `scripts/perf/record.ts` + `scripts/perf/diff.ts` — Playwright-driven journeys + CI regression gate
