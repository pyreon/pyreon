---
title: 'Live Program Inlay Hints (LPIH)'
description: Surface live runtime data — signal fire counts, effect re-runs — directly at the source line in your editor, the same way TypeScript shows inferred types.
---

# Live Program Inlay Hints

LPIH surfaces **live runtime data at the source line** in your editor — signal fire counts, effect re-run counts, subscriber counts — rendered as ghost text inlay hints. The same surface TypeScript uses for inferred types, now showing your reactive program's actual runtime behavior.

```tsx
function App() {
  const count = signal(0)             // 🔥 signal fired 240× (12/s)
  const doubled = computed(() => count() * 2)  // 🔥 derived fired 240× (12/s)
  effect(() => console.log(doubled()))         // 🔥 effect fired 241× (12/s)
  return <div>{count()}</div>
}
```

Hints show both **cumulative count** and **current rate** (fires per second, decayed over a 1-second window). The rate makes hot-path debugging visible at a glance — "is this firing right now, or did it fire a lot a while ago?" The cumulative count makes before/after comparisons easy. When a node has been idle for a few seconds, the rate suffix disappears and only the count remains.

**No editor today shows live runtime data at source lines** for any reactive framework. The data exists in DevTools, but accessing it requires context-switching from the editor to a separate panel. LPIH closes that gap.

## How it works

Three layers cooperate:

1. **Runtime capture** (`@pyreon/reactivity`) — at every `signal()` / `computed()` / `effect()` creation, capture the source file + line from `new Error().stack`. Aggregated as fire counts via `getFireSummaries()`.
2. **Bridge** (`@pyreon/reactivity`) — `writeLpihCache(path)` writes the snapshot to a JSON file atomically (tmp + rename). `startLpihPolling(path, intervalMs)` writes repeatedly for dev-server integration.
3. **LSP integration** (`@pyreon/lint`) — on every `textDocument/inlayHint` request, the LSP server reads `PYREON_LPIH_CACHE` env var (if set), parses the cache, and emits inlay hints with the `🔥 <kind> fired N×` label at each creation line.

Filesystem cache is the bridge because LSP servers are stdio-only — they can't easily IPC with a browser. The LSP re-reads on every inlay-hint request, so live edits land immediately.

## Quick start (zero config — Vite users)

### 1. Use `@pyreon/vite-plugin`

If your project already uses `@pyreon/vite-plugin` (the default scaffold), **LPIH is on by default** — the plugin auto-injects a browser-side bridge AND registers the dev-server `POST /__pyreon_lpih__` middleware that writes the cache file. **You don't need to call `activateReactiveDevtools()` or `startLpihPolling()` — the plugin does it for you.**

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import pyreon from '@pyreon/vite-plugin'

export default defineConfig({
  plugins: [pyreon()],     // LPIH on by default in dev (R1, #786)
})
```

Opt out via `pyreon({ lpih: false })`. Override interval / cache path:

```ts
pyreon({ lpih: { intervalMs: 500 } })           // slower poll
pyreon({ lpih: { cachePath: '/custom/x.json' } }) // non-default path
```

### 2. Run `pyreon-lint --lsp` in your editor

That's it — the LSP auto-discovers `<project-root>/.pyreon-lpih.json` by walking up from the file being linted to the nearest `package.json`. No env var required.

### 3. Add the cache file to `.gitignore`

```gitignore
# Live Program Inlay Hints — runtime fire data (dev-mode only)
.pyreon-lpih.json
```

### 4. Run your app

On every signal write, the runtime bridge updates the cache file. The LSP picks it up on the next inlay-hint request (~150ms debounce). Ghost text appears at each creation line.

### Manual setup (non-Vite consumers)

If you're not using `@pyreon/vite-plugin` (e.g. Webpack, Rollup, or a custom dev server), wire it manually:

```ts
import { activateReactiveDevtools } from '@pyreon/reactivity'
import { startLpihPolling } from '@pyreon/reactivity/lpih'

if (import.meta.env.DEV) {
  activateReactiveDevtools()
  startLpihPolling() // writes to <cwd>/.pyreon-lpih.json by default
}
```

### Custom paths (if needed)

If you need to override the default location (e.g. shared dev environment, custom workspace layout), set the env var or pass an explicit path:

```bash
PYREON_LPIH_CACHE=/custom/path/lpih.json pyreon-lint --lsp
```

```ts
startLpihPolling('/custom/path/lpih.json', 250)
```

The env var takes priority over the auto-discovered default.

## What you measure

Per-creation, LPIH captures and surfaces:

- **fire count** — total `signal.set()` / `computed.recompute()` / `effect.run()` invocations
- **kind** — `signal` / `derived` / `effect`
- **lastFire** — `performance.now()` of the most recent fire
- **source location** — `file:line:col` from the captured stack

## Measured performance

### LSP roundtrip latency

Time from "save file" to "ghost text updated", measured 20-trial median over a real JSON-RPC `didChange + inlayHint` cycle:

| Metric | Value |
|---|---|
| Median LSP roundtrip | **0.32 ms** |
| p95 | **2.78 ms** |
| User-perceived (incl. 150 ms LSP debounce) | **~150 ms** total |

For context: a traditional devtools-panel workflow takes ~3-5 seconds of conscious human work (switch tab → click panel → scan list → map back to source). LPIH is **20× faster** for "is this signal firing?"-type questions.

### Runtime overhead (worst case)

100,000 signals + 10,000 computeds + 10,000 effects = 120k reactive primitives, 5-trial median:

| Devtools state | Wall-clock | Per-creation |
|---|---|---|
| **INACTIVE** (production-equivalent) | 7.4 ms | **62 ns** |
| **ACTIVE** (LPIH worst case) | 269 ms | **2,245 ns** (~2.2 µs) |
| Production NODE_ENV=production | — | **0** (tree-shaken) |

At realistic real-app creation rates (~100-1000 signals total / ~100/sec peak), per-session LPIH cost is **0.2-2.3 ms total** — invisible. Devtools-attached mode is **opt-in**; the default is OFF.

### Bridge roundtrip (end-to-end)

Time from "user clicked button → signal fired" to "ghost text reflects the new count":

| Step | Time |
|---|---|
| Bridge write (`writeLpihCache`) — getFireSummaries + JSON.stringify + atomic rename | ~1.5 ms |
| Cache read + JSON.parse | ~0.05 ms |
| LSP inlayHint (analyze + merge + serialize) | ~0.24 ms |
| **Total bridge-to-editor** | **~1.8 ms** |

Add the ~150 ms LSP debounce + the polling interval (250 ms default) → end-to-end latency is **~400 ms** in the worst case. Still subjectively instant.

## Where LPIH helps (concrete scenarios)

### Scenario A: "Which signal in this file is firing the most?"

**Without LPIH** (9 steps):

1. Save file (or wait for HMR)
2. Switch focus to browser DevTools
3. Click "Pyreon" DevTools tab
4. Click "Signals" sub-panel
5. Sort by fire count (click header)
6. Visually scan top entries
7. Identify the offending node by name
8. Switch back to editor
9. Cmd+P / search the editor for the signal definition

**With LPIH** (2 steps):

1. Look at the source file
2. Eyes land on the line with the highest 🔥 count

**4.5× reduction in workflow steps.**

### Scenario B: "Is this effect re-running more than expected?"

**Without LPIH** (8 steps):

1. Add `console.log` inside the effect body
2. Save file
3. Switch to browser
4. Trigger the action
5. Open browser console
6. Count log entries
7. Switch back to editor
8. Remove the `console.log`

**With LPIH** (2 steps):

1. Look at the `effect()` line
2. Read the 🔥 count

**4× reduction in workflow steps.** Also: zero code-pollution from debug `console.log` statements.

### Scenario C: "Did my memoization actually reduce fire count?"

**Without LPIH** (10 steps):

1. Open DevTools "Pyreon" tab
2. Note current fire count
3. Edit code to add memoization
4. Save
5. Wait for HMR
6. Trigger the action again
7. Switch back to DevTools
8. Read new fire count
9. Mental math: before vs after
10. Switch back to editor

**With LPIH** (4 steps):

1. Note fire count visible on the line
2. Edit code
3. Save (auto-refreshes via LSP)
4. Read updated fire count on the same line

**2.5× reduction.** Before-and-after comparison happens in your peripheral vision.

## API

### `@pyreon/reactivity` (capture surface)

```ts
import {
  activateReactiveDevtools,
  deactivateReactiveDevtools,
  getFireSummaries,
  type SourceLocation,
  type FireSummary,
} from '@pyreon/reactivity'
```

### `@pyreon/reactivity/lpih` (bridge / dev-mode integration)

```ts
import {
  writeLpihCache,
  startLpihPolling,
  getDefaultLpihCachePath,
  LPIH_DEFAULT_FILENAME,
} from '@pyreon/reactivity/lpih'
```

Subpath because the bridge depends on `node:fs/promises` (Node-only) and is dev-mode integration glue, not a core primitive. Separating it keeps the main entry slim and tree-shakes cleanly for browser-only consumers.

#### `activateReactiveDevtools(): void`

Turn on source-location capture + fire recording. Idempotent.

#### `getFireSummaries(): FireSummary[]`

Snapshot of fires aggregated by source location. Each entry: `{ loc, count, lastFire, kind }`.

#### `writeLpihCache(path?: string): Promise<number>`

Atomically write `getFireSummaries()` to a JSON file. Returns the number of fires written. Safe to call on every signal write; uses tmp+rename so readers never see a half-written file.

When `path` is omitted, defaults to `<cwd>/.pyreon-lpih.json` (resolved via `getDefaultLpihCachePath()`). Throws if no default can be resolved (e.g. web worker without `process.cwd()`).

#### `startLpihPolling(path?: string, intervalMs?: number): () => void`

Call `writeLpihCache(path)` at the given interval (default 250ms). Returns a disposer. Same path-resolution as `writeLpihCache` — omit to use the zero-config default.

#### `getDefaultLpihCachePath(): string | null`

Returns `<cwd>/.pyreon-lpih.json` when `process.cwd` is available, `null` otherwise. The LSP server uses the same convention (walking up to the nearest `package.json`) so writer and reader agree without configuration.

#### `LPIH_DEFAULT_FILENAME: '.pyreon-lpih.json'`

The canonical filename constant. Stable identifier for tools that want to compose paths from a different directory root.

### `@pyreon/compiler`

```ts
import {
  mergeFireDataIntoFindings,
  firesToCreationSiteFindings,
  type LPIHFireDatum,
  type LPIHMergeOptions,
} from '@pyreon/compiler'
```

#### `firesToCreationSiteFindings(fires, sourceFile, options?)`

Synthesize inlay-hint findings directly from fire data. The simpler, more useful surface — produces one hint per signal/computed/effect creation line.

#### `mergeFireDataIntoFindings(findings, fires, sourceFile, options?)`

Enrich existing static Reactivity-Lens findings with fire counts at matching lines. For the rare case where a JSX reactive-read site happens to coincide with a creation line.

### `@pyreon/lint` LSP

The LSP server reads `PYREON_LPIH_CACHE` env var on every `textDocument/inlayHint` request. When set + file exists + JSON is valid, fires are merged into the response as `🔥 <kind> fired N×` hints. Malformed cache or unset env var → degrades silently to static Reactivity-Lens hints only.

## Production cost

**Zero.** The capture is gated behind `process.env.NODE_ENV !== 'production'`. Vite, Webpack, esbuild, Rollup, Parcel, and Bun all dead-code-eliminate the entire path at build time. Tree-shake verified by the existing `reactive-devtools-treeshake.test.ts` suite.

## What's next

Foundation work — the editor extension (VS Code / Neovim) that auto-bridges devtools fire data to the cache file is a follow-up. The current setup requires manually wiring `startLpihPolling()` in your dev entry; the LSP auto-discovers the cache file from `<project-root>/.pyreon-lpih.json` so no env var is needed.

A further follow-up: `@pyreon/vite-plugin` build-time location injection. This replaces the runtime stack capture with a compile-time literal (`signal(0, { __sourceLocation: { file, line, col } })`), eliminating the 2.2 µs/creation overhead even when devtools is active.

See also:

- [`@pyreon/devtools`](/docs/devtools) — Chrome DevTools panel with Signals / Graph / Effects / Profiler tabs
- [Reactivity](/docs/reactivity) — signal/computed/effect API reference
- [Compiler](/docs/compiler) — Reactivity Lens (static analysis side)
