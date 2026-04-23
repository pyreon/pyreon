# Counter Catalog

Canonical list of every counter name emitted through `globalThis.__pyreon_count__`. Updated whenever a new counter is added. Enforced by `src/tests/catalog-drift.test.ts` — CI fails if a call site emits a name not in this list, or if a listed name has no emitting call site.

## Naming convention

`<layer>.<action>[.<variant>]`

- **layer** — the framework package, lower-case, single word (`styler`, `unistyle`, `rocketstyle`, `runtime`, `reactivity`, `router`)
- **action** — what happened (`resolve`, `mount`, `navigate`)
- **variant** (optional) — a qualifier like `.hit` for cache hits, `.fallback-scan` for unusual paths

## Counters

| Name                                | Emitted from                                             | What a healthy number looks like                                                                                                                                                    |
| ----------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `styler.resolve`                    | `packages/ui-system/styler/src/resolve.ts`               | Roughly proportional to the number of distinct styled() instances that changed this frame. Spikes on every keystroke = unnecessary resolution; trace to the caller.                 |
| `styler.sheet.insert`               | `packages/ui-system/styler/src/sheet.ts`                 | High on first paint, then ≈ `styler.sheet.insert.hit`. A growing insert count over time means cache is not catching reused CSS.                                                     |
| `styler.sheet.insert.hit`           | `packages/ui-system/styler/src/sheet.ts`                 | Should dominate after warmup. Ratio `hit / (hit + miss)` > 0.9 on steady-state pages.                                                                                               |
| `unistyle.styles`                   | `packages/ui-system/unistyle/src/styles/styles/index.ts` | 1-N per styled component depending on breakpoints + pseudo states. Compare to component count — a 10× ratio is a sign makeItResponsive is doing redundant work.                     |
| `unistyle.descriptor`               | same file                                                | Pre-optimisation this ran ~257 per `unistyle.styles`. Post-Tier-1 it's ~10-20. Sudden spike = a theme key isn't in the lookup and triggers fallback-scan.                           |
| `unistyle.descriptor.fallback-scan` | same file                                                | Should be zero in normal use. Non-zero = a theme key wasn't in `keyToIndices` and the full-scan path ran. Investigate which theme key is off-map.                                   |
| `rocketstyle.getTheme`              | `packages/ui-system/rocketstyle/src/rocketstyle.ts`      | One per `$rocketstyleAccessor` invocation. Under a reactive scope that depends on theme/mode, this fires on every theme/mode change. Stable app should see this plateau.            |
| `rocketstyle.dimensionsMap.hit`     | same file                                                | Should approach 1:1 with rocketstyle component mounts after first paint — confirms the per-definition WeakMap cache is doing its job.                                               |
| `rocketstyle.localThemeManager.hit` | same file                                                | Rolls up 4 cache tiers (baseTheme, dimensionsThemes, modeBaseTheme, modeDimensionTheme). Stable theme = 4× `rocketstyle.getTheme`.                                                  |
| `rocketstyle.omitSet.hit`           | same file                                                | Should be ≈ rocketstyle component mount count. Zero = Set is being rebuilt every mount (regression).                                                                                |
| `reactivity.signalCreate`           | `packages/core/reactivity/src/signal.ts`                 | Spikes on page boot, then flat. Growing linearly during steady interaction = signals leaked into a hot path (create in render, not setup).                                          |
| `reactivity.signalWrite`            | same file                                                | Counts only post-`Object.is` writes (no-op self-writes don't count). High per-frame = over-writing during keystroke / pointer / rAF loops.                                          |
| `reactivity.effectRun`              | `packages/core/reactivity/src/effect.ts`                 | Includes initial mount runs + every re-run. Watch for "1 signal write → N effect runs" cascade.                                                                                     |
| `reactivity.computedRecompute`      | `packages/core/reactivity/src/computed.ts`               | Should be ≤ signalWrite count for any given dependency graph. Higher means diamond deps recomputing multiple times (pre-batch).                                                     |
| `runtime.mount`                     | `packages/core/runtime-dom/src/index.ts`                 | One per `mount(root, container)` top-level call — typically 1 per app.                                                                                                              |
| `runtime.unmount`                   | same file                                                | Pairs with `runtime.mount`. Divergence means an unmount leaked.                                                                                                                     |
| `runtime.mountChild`                | `packages/core/runtime-dom/src/mount.ts`                 | Hottest of the runtime counters. Roughly "VNodes inserted into DOM" per render cycle. Compare frame-over-frame during an interaction — flat = good, monotonic = unbounded children. |
| `runtime.mountFor.lisOps`           | `packages/core/runtime-dom/src/nodes.ts`                 | Binary-search probe count during keyed reorder. O(n log n) per reorder — a 1000-row list that reshuffles should hit ~10,000 here. Flat during non-reordering updates = good.        |
| `router.navigate`                   | `packages/core/router/src/router.ts`                     | One per navigation attempt (incl. redirects). Click → ideally 1 bump; redirect chains add more.                                                                                     |
| `router.loaderRun`                  | same file                                                | Bumps only when a loader actually ran (cache miss, in-flight not deduped). Compare to `router.loaderCache.hit`.                                                                     |
| `router.loaderCache.hit`            | same file                                                | Should exceed `loaderRun` in a warm app navigating between seen routes.                                                                                                             |
| `router.prefetch`                   | `packages/core/router/src/loader.ts`                     | One per `prefetchLoaderData()` call (hover intent, viewport prefetch).                                                                                                              |
