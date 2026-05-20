# @pyreon/perf-harness

> **Private — internal to the Pyreon monorepo. Not published to npm.**

Dev-time instrumentation for framework perf work. Named call counters across the styler / unistyle / rocketstyle / runtime-dom / runtime-server / reactivity / router / store / rx / query / i18n / island layers, snapshot/diff/record API, in-page overlay, Playwright-driven recorder + regression comparator.

Counters are emitted by framework packages through a **dev-only `globalThis.__pyreon_count__` sink** — zero import coupling. The harness publishes the sink on `install()` / `enable()` and removes it on `disable()`. Until then, the optional-chain short-circuits and counter bookkeeping costs nothing. In production bundles the gates fold to dead code and the strings tree-shake out (locked by `src/tests/treeshake.test.ts` — a real Vite production bundle with `import.meta.env.DEV = false`, asserts every counter name string is absent).

## Why

Synthetic benchmarks don't catch real-app perf regressions. Three recent bugs (DynamicStyled effect regression, `startClient` re-render, unistyle 263-descriptor scan) were only found by ad-hoc `console.count` bolted into a running app. This package is that bolting, made permanent — a shared registry every framework layer can emit to, with isolation, diffing, and the CI plumbing built in.

## Framework-internal emit pattern

Framework packages (styler, unistyle, router, …) are **published to npm** and MUST NOT depend on this private package — it would break npm install for external consumers. Instead, they emit through the dev-only global:

```ts
// Inside a framework package — NO import from @pyreon/perf-harness.
interface ViteMeta { readonly env?: { readonly DEV?: boolean } }
declare const globalThis: {
  __pyreon_count__?: (name: string, n?: number) => void
}

export function resolve(...) {
  if ((import.meta as ViteMeta).env?.DEV === true)
    globalThis.__pyreon_count__?.('styler.resolve')
  // ...
}
```

### Gate shape differs by package category

- **Browser packages** (runtime-dom, router, styler, reactivity, …) — `import.meta.env?.DEV === true`. Vite/Rolldown fold this to `false` at build time and tree-shake the call.
- **Server packages** (runtime-server) — `typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'`. They don't run through a Vite bundle in production; the gate evaluates at runtime under Node and short-circuits when `NODE_ENV=production`.

### Rules

- **Always guard at the call site.** The literal `false` from the dev gate is what lets the bundler drop the whole call tree in prod.
- **Name counters `<layer>.<action>`.** `styler.resolve`, `unistyle.styles`, `router.navigate`. One dotted segment per layer, one per action.
- **Counters are opt-in at runtime.** Default is off — `globalThis.__pyreon_count__` is undefined until `perfHarness.enable()` or `install()` has been called. Zero cost on cold import.
- **Add new counters to `COUNTERS.md`.** The drift test (`catalog-drift.test.ts`) enforces both directions: emits without a catalog entry fail CI, and catalog entries without an emitter fail too.

## Consumer usage (examples, scripts, dev-tools)

```ts
import { install, perfHarness } from '@pyreon/perf-harness'

// Turn it on. Also attaches the full API to globalThis.__pyreon_perf__.
install()

// Isolated measurement window
const { diff, after } = await perfHarness.record('mount-dashboard', () => {
  mount(<Dashboard />, container)
})
console.log(perfHarness.formatDiff(diff))

// Raw snapshots
perfHarness.reset()
doThing()
const counters = perfHarness.snapshot()

// In-page overlay (Ctrl+Shift+P toggle)
const overlay = perfHarness.overlay()
```

After `install()`, the harness is also reachable from devtools:

```js
__pyreon_perf__.snapshot()
__pyreon_perf__.reset()
__pyreon_perf__.record('nav', () => router.push('/x'))
```

## Exports

### Low-level (counter write path)

| Export | Purpose |
|---|---|
| `_count(name, n?)` | Increment a counter. No-op when disabled. The sink that gets published to `globalThis.__pyreon_count__`. |
| `_reset()` | Clear all counters. Does not change the enabled flag. |
| `_snapshot()` | Materialise counter state as `Record<CounterName, number>`. |
| `_enable()` / `_disable()` / `_isEnabled()` | Toggle counter writes + publish/remove the global sink. |
| `CounterName` | Type for known counter names (drift-locked to `COUNTERS.md`). |

### High-level (harness API)

| Export | Purpose |
|---|---|
| `perfHarness` | Object bundling `enable` / `disable` / `isEnabled` / `reset` / `snapshot` / `diff` / `formatDiff` / `record` / `overlay`. |
| `PerfHarness` | TypeScript type for the bundle. |
| `install()` | `_enable()` + attach `perfHarness` to `globalThis.__pyreon_perf__`. Returns the harness for non-DOM consumers. |
| `uninstall()` | Remove the `__pyreon_perf__` global (writes stay on). |
| `diffSnapshots(before, after)` | Structured diff — `{ name, before, after, delta }[]`. |
| `formatDiff(diff)` | Fixed-width table for printing. |
| `CounterDiff` / `CounterDiffEntry` | Diff types. |

### Overlay

| Export | Purpose |
|---|---|
| `mountOverlay(options?)` | Shadow-DOM floating panel — live counters, reset/record/export buttons, Ctrl+Shift+P toggle. One overlay per window. |
| `OverlayHandle` / `OverlayOptions` | Types. |

## Record + diff (`record`)

```ts
const result = await perfHarness.record('mount-1000-rows', () => {
  for (let i = 0; i < 1000; i++) mount(<Row />, container)
})

result.label   // 'mount-1000-rows'
result.before  // snapshot taken inside record (after reset)
result.after   // snapshot at the end of fn
result.diff    // formatted diff
```

`record` is safe to nest — it saves the previous counter state, resets, runs, captures, then restores. Async `fn` is awaited. After `record`, counters return to whatever they were before the call.

## What's shipped

- Counter API (`_count`, `_snapshot`, `_reset`, `_enable`, `_disable`, `_isEnabled`)
- Harness API (`perfHarness.snapshot / reset / record / diff / formatDiff / overlay`, plus `install` / `uninstall`)
- Overlay (shadow-DOM panel, Ctrl+Shift+P toggle, reset/record/export buttons)
- Instrumentation across 11 layers, 66+ counters — full catalog in [`COUNTERS.md`](./COUNTERS.md)
- `examples/perf-dashboard` — real-app-shape stress rig; auto-installs the harness in dev so counters are live from boot
- `scripts/perf/record.ts` + `scripts/perf/diff.ts` — Playwright recorder + regression comparator (`bun run perf:record --app <name> --journey <name>` / `bun run perf:diff <baseline> <current>`)
- `.github/workflows/perf.yml` — advisory CI (manual + `perf`-labelled PRs + nightly)
- Tree-shake regression test (`treeshake.test.ts`) — Vite-production-bundles each instrumented file and asserts both the `__pyreon_count__` identifier and every counter name string are absent
- Catalog drift test (`catalog-drift.test.ts`) — enforces emits ↔ `COUNTERS.md` agreement in both directions
- SSR overhead test (`ssr-overhead.test.ts`) — measures a 1k-row SSR render three ways (prod, dev/no-sink, dev/no-op-sink): dev-mode overhead is ~5% with sink installed, ~0% without

## Gotchas

- **Optional-chain sink, not direct call.** Always `globalThis.__pyreon_count__?.('name')`. A bare `globalThis.__pyreon_count__('name')` crashes when the harness isn't installed.
- **Dev-gate is REQUIRED at every call site**, not just at the sink. The literal `false` from the gate is what lets the bundler tree-shake the call.
- **`enable()` does not reset.** It turns writes on but counter values persist from whatever was already there. Call `reset()` separately for a clean baseline.
- **`install()` enables AND publishes the global.** `enable()` alone turns writes on but doesn't publish to `globalThis.__pyreon_perf__` — useful when you want counters from code but not the devtools-console API.
- **Counter names drift-test the catalog.** Adding a new emit means adding a row to `COUNTERS.md` in the same PR; the drift test fails CI otherwise.

## License

MIT (private to the Pyreon monorepo).
