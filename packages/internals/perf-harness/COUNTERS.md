# Counter Catalog

Canonical list of every counter name emitted through `globalThis.__pyreon_count__`. Updated whenever a new counter is added. Enforced by `src/tests/catalog-drift.test.ts` — CI fails if a call site emits a name not in this list, or if a listed name has no emitting call site.

## Naming convention

`<layer>.<action>[.<variant>]`

- **layer** — the framework package, lower-case, single word (`styler`, `unistyle`, `rocketstyle`, `runtime`, `reactivity`, `router`)
- **action** — what happened (`resolve`, `mount`, `navigate`)
- **variant** (optional) — a qualifier like `.hit` for cache hits, `.fallback-scan` for unusual paths

> **The `.hit` suffix is load-bearing.** `scripts/perf/diff.ts` treats counters
> whose name ends in `.hit` as success counters — a DROP is a regression
> (cache stopped working), not an improvement. Every other counter measures
> work, so an INCREASE is a regression. Rename accordingly when adding new
> counters: if the counter measures "how many times a fast path fired,"
> end the name in `.hit`; otherwise don't.

## Counters

| Name | Emitted from | What a healthy number looks like |
| --- | --- | --- |
| `styler.resolve` | `packages/ui-system/styler/src/resolve.ts` | Roughly proportional to the number of distinct styled() instances that changed this frame. Spikes on every keystroke = unnecessary resolution; trace to the caller. |
| `styler.sheet.insert` | `packages/ui-system/styler/src/sheet.ts` | High on first paint, then ≈ `styler.sheet.insert.hit`. A growing insert count over time means cache is not catching reused CSS. |
| `styler.sheet.insert.hit` | `packages/ui-system/styler/src/sheet.ts` | Should dominate after warmup. Ratio `hit / (hit + miss)` > 0.9 on steady-state pages. |
| `styler.elClassCache.hit` | `packages/ui-system/styler/src/styled.tsx` | Per-`createStyledComponent` `$element`-keyed cache hit. Fires when a non-rocketstyle styled component (Element / Wrapper / Text) sees a `$element` bundle identity it has resolved before. Pairs with `@pyreon/elements` `internElementBundle()`. After warmup this should dominate Element mounts — a low ratio means upstream isn't sending stable `$element` identities (intern bypassed because of a function value or non-string `extraStyles`). |
| `unistyle.styles` | `packages/ui-system/unistyle/src/styles/styles/index.ts` | 1-N per styled component depending on breakpoints + pseudo states. Compare to component count — a 10× ratio is a sign makeItResponsive is doing redundant work. |
| `unistyle.descriptor` | same file | Pre-optimisation this ran ~257 per `unistyle.styles`. Post-Tier-1 it's ~10-20. Sudden spike = a theme key isn't in the lookup and triggers fallback-scan. |
| `unistyle.descriptor.fallback-scan` | same file | Should be zero in normal use. Non-zero = a theme key wasn't in `keyToIndices` and the full-scan path ran. Investigate which theme key is off-map. |
| `rocketstyle.getTheme` | `packages/ui-system/rocketstyle/src/rocketstyle.ts` | One per FRESH theme resolution (cache miss in the dimension-prop memo). Stable apps plateau quickly: equals the number of unique `(theme, mode, dimensionPropTuple, pseudoState)` combinations the app exercises. Compare to `rocketstyle.dimensionMemo.hit` — high `getTheme` + low `dimensionMemo.hit` means the memo isn't catching reused combos (key collision or churn). |
| `rocketstyle.dimensionMemo.hit` | same file | Per-definition memo caches the `(rocketstyle, rocketstate)` object pair keyed on `(theme, mode, dimensionPropTuple, pseudoState)`. A hit returns the cached object identities so the styler's downstream `classCache` skips the resolve pipeline (no `styler.resolve`, no `unistyle.styles`, no `unistyle.descriptor`). Should dominate after warmup; ratio `hit / (hit + getTheme)` > 0.9 on steady-state pages. |
| `rocketstyle.dimensionsMap.hit` | same file | Should approach 1:1 with rocketstyle component mounts after first paint — confirms the per-definition WeakMap cache is doing its job. |
| `rocketstyle.localThemeManager.hit` | same file | Rolls up 4 cache tiers (baseTheme, dimensionsThemes, modeBaseTheme, modeDimensionTheme). Stable theme = 4× `rocketstyle.getTheme`. |
| `rocketstyle.omitSet.hit` | same file | Should be ≈ rocketstyle component mount count. Zero = Set is being rebuilt every mount (regression). |
| `reactivity.signalCreate` | `packages/core/reactivity/src/signal.ts` | Spikes on page boot, then flat. Growing linearly during steady interaction = signals leaked into a hot path (create in render, not setup). |
| `reactivity.signalWrite` | same file | Counts only post-`Object.is` writes (no-op self-writes don't count). High per-frame = over-writing during keystroke / pointer / rAF loops. |
| `reactivity.effectRun` | `packages/core/reactivity/src/effect.ts` | Includes initial mount runs + every re-run. Watch for "1 signal write → N effect runs" cascade. |
| `reactivity.computedRecompute` | `packages/core/reactivity/src/computed.ts` | Should be ≤ signalWrite count for any given dependency graph. Higher means diamond deps recomputing multiple times (pre-batch). |
| `runtime.mount` | `packages/core/runtime-dom/src/index.ts` | One per `mount(root, container)` top-level call — typically 1 per app. |
| `runtime.unmount` | same file | Pairs with `runtime.mount`. Divergence means an unmount leaked. |
| `runtime.mountChild` | `packages/core/runtime-dom/src/mount.ts` | Hottest of the runtime counters. Roughly "VNodes inserted into DOM" per render cycle. Compare frame-over-frame during an interaction — flat = good, monotonic = unbounded children. |
| `runtime.mountFor.lisOps` | `packages/core/runtime-dom/src/nodes.ts` | Binary-search probe count during a keyed reorder. Random shuffles are O(n log n) — a 1000-row shuffle produces ~5000 probes. Full reversals degenerate to linear (LIS length is 1). Flat during non-reordering updates. |
| `runtime.tpl` | `packages/core/runtime-dom/src/template.ts` | One per `_tpl()` (cloneNode fast path) invocation. Compiled JSX with ≥1 DOM element emits `_tpl()` calls; non-templatable trees fall back to `h()`. The tpl count tells you how many components hit the fast path — compare to `runtime.mountChild` to estimate the ratio. |
| `runtime-server.render` | `packages/core/runtime-server/src/index.ts` | One per `renderToString()` call. Typically one per SSR request — divergence means the server is rendering twice (e.g. double-pass for hydration prep). |
| `runtime-server.stream` | same file | One per `renderToStream()` call. Mutually exclusive with `render` in most apps — pick one path. |
| `runtime-server.component` | same file | Fires once per component function invocation during SSR (both sync and streaming paths). Proportional to server component count. Sudden spike = memoization broken or loop in the tree. |
| `runtime-server.escape` | same file | HTML-escape calls on text content. Fires only when a string contains `&<>"'` (fast-path skip otherwise). Proxy for "how much user-supplied text is being rendered" — scales with page content size. |
| `runtime-server.suspense.boundary` | same file | One per `<Suspense>` encountered during streaming. Normal: small integer (route-level, lazy-load boundaries). Exploding = boundary loop or nested-suspense misuse. |
| `runtime-server.suspense.fallback` | same file | Fires when a `<Suspense>` boundary hit the 30s timeout and the fallback stayed visible. Should be zero in healthy apps — non-zero = an async child never resolved. |
| `runtime-server.for.keyMarker` | same file | One per `<For>` item's `<!--k:KEY-->` hydration marker. Equals total rows rendered across all `<For>` instances. Used to diagnose `<For>` item cost during SSR — compare to mountChild ratio post-hydration. |
| `form.fieldSignalCreate` | `packages/fundamentals/form/src/use-form.ts` | Six emissions per field at `useForm({fields})` init time (one for each of value/error/touched/dirty/disabled/readOnly). Total = 6×N. Flat after init — should not grow during typing. A growing count during steady interaction means `useForm` is being recreated on every render. The 6×N eager-allocation cost is the bottleneck `forms-stress` benchmarks (PR 2 candidate fix: lazy materialization). |
| `form.fieldEffectCreate` | same file | One auto-revalidation effect per field at init (tracks `valueSig` + `submitCount`). Total = N. A `submitCount` flip re-runs ALL N effects in one pass. Should be flat after init — non-zero growth means `useForm` is leaking effects. |
| `form.validateParallel` | same file | One emission per `form.validate()` call. The N async tasks span across `Promise.all(fieldEntries.map(...))` — measure dispatch fan-out via wall-clock + heap deltas in the perf-record harness. Higher than `submit` count = validation is being triggered outside submit (cross-field validators tripped). |
| `form.formStateScan` | `packages/fundamentals/form/src/use-form-state.ts` | One emission per `useFormState()` `buildSummary` call. Should equal the number of distinct `useFormState()` reads. Pairs with `form.formStateScan.fieldsRead` to surface the "selector ignored — full O(N) scan happens regardless" predicted bottleneck. |
| `form.formStateScan.fieldsRead` | same file | Fields touched per scan. Equals N for any `useFormState()` call regardless of selector — even when the selector only reads `isValid` or `isSubmitting`. PR 3 candidate fix: split summary into atomic computeds resolved against a getter-backed surface. |
| `router.navigate` | `packages/core/router/src/router.ts` | One per navigation attempt (incl. redirects). Click → ideally 1 bump; redirect chains add more. |
| `router.loaderRun` | same file | Bumps only when a loader actually ran (cache miss, in-flight not deduped). Compare to `router.loaderCache.hit`. |
| `router.loaderCache.hit` | same file | Should exceed `loaderRun` in a warm app navigating between seen routes. |
| `router.prefetch` | `packages/core/router/src/loader.ts` | One per `prefetchLoaderData()` call (hover intent, viewport prefetch). |
| `store.defineStore` | `packages/fundamentals/store/src/index.ts` | One per `defineStore()` call that creates a fresh store (cache miss in the registry). Cache hits short-circuit before this counter, so the count equals unique store-id creations. Mount-N-stores baseline. |
| `store.pluginRun` | same file | Per plugin iteration during store creation. Tracks O(stores × plugins). The plugin chain runs uncached on every fresh store creation — under `storePluginScale-1000` this counter equals `pluginCount × storeCount` and is the cleanest signal that caching plugin init is worth investigating. |
| `store.patchKey` | same file | Per signal write inside the object-form `patch()` body. Tracks batch-size distribution. Correlate with `reactivity.signalWrite` — they should match 1:1 on the object-form path; gaps mean signals named in the patch object weren't classified as state at setup time (likely a duck-type mismatch). |
| `store.subscribeNotify` | same file | Per `subscribe()` callback invocation. Two emit sites: direct signal-write path (×N writes × subscribers) and batched-patch path (1 × subscribers per patch). Should be roughly proportional to writes — sudden growth means subscribers leaking or fan-out widening. |
| `store.actionListenerNotify` | same file | Per `onAction()` callback invocation. Fires BEFORE every wrapped-action call. Pair with `store.actionCall` — their ratio equals listener count; a divergence run-over-run means listeners are attaching/detaching (probably a leak). |
| `store.actionCall` | same file | Per wrapped-action invocation. Fires once per `store.action()` call regardless of how many listeners are attached. The denominator for the listener fan-out ratio. |
| `rx.transform.signal` | `packages/fundamentals/rx/src/collections.ts` + `aggregation.ts` | Per `reactive()` call with a Signal input — allocates a tracked `computed`. Sum across a page = total computeds rx created. Fires from collection transforms (filter/map/sortBy/etc.) and aggregations (count/sum/min/max/etc.) when given a signal source. |
| `rx.transform.raw` | same files | Per `reactive()` call with a non-signal input — direct call, no computed. Should be near zero in real apps; non-zero = consumer accidentally pre-resolved a signal where rx expected one (result becomes stale, no reactive update). |
| `rx.pipe` | `packages/fundamentals/rx/src/pipe.ts` | One per `pipe()` call regardless of chain depth — pipe collapses the chain into a SINGLE computed. Compare to `rx.transform.signal` summed across an equivalent separate-call chain to see the structural win. |
| `rx.debounce.create` | `packages/fundamentals/rx/src/timing.ts` | Per `debounce()` instance. Grows with the number of debounced signals the app currently holds; growing across navigations without matching `.dispose()` calls = leak (each instance owns an effect + a setTimeout). |
| `rx.throttle.create` | same file | Per `throttle()` instance. Same leak-detection rationale as `rx.debounce.create`. |
| `query.useQuery` | `packages/fundamentals/query/src/use-query.ts` + `use-suspense-query.ts` + `use-infinite-query.ts` | One per `useQuery` / `useSuspenseQuery` / `useInfiniteQuery` / `useSuspenseInfiniteQuery` call. Each emit is followed by an observer alloc + 9 fine-grained signals + subscribe + setOptions effect — list-row-heavy apps paying this cost N × per page. Mount-N baseline. |
| `query.useMutation` | `packages/fundamentals/query/src/use-mutation.ts` | One per `useMutation` call. Similar shape (observer + 8 signals + subscribe). Mutations are typically per-form, not per-row, so this counter stays small even on large pages. |
| `query.observerNotify` | same files as `query.useQuery` | Per observer.subscribe callback fire — i.e. per upstream cache update × per subscriber. Each fire runs `batch(() => 9 signal.set)`. Compare with `query.useQuery` for the notify/mount ratio: high values = subscriber fan-out (one cache change rippling through many list rows). The likely first optimization target — most consumers only read 1-2 of the 9 signals. |
| `query.setOptions` | same files | Per `effect(() => observer.setOptions(options()))` re-run. Reactive query keys (signal reads inside the options builder) drive this counter. High value vs `query.useQuery` count = upstream signals churning the options builder. |
| `query.invalidate` | `packages/fundamentals/query/src/use-mutation.ts` | Per `client.invalidateQueries()` call triggered by `useMutation({ invalidates })`. Counter grows with `mutationCount × invalidates.length`. Each call fans out to matching cache entries and triggers their `query.observerNotify`. |
| `query.isFetchingScan` | `packages/fundamentals/query/src/use-is-fetching.ts` | Per `useIsFetching` / `useIsMutating` cache scan. Each scan walks the entire query/mutation cache (`client.isFetching(filters)`), so the counter grows with `cacheEvents × cacheSize`. High values on update-heavy pages indicate the global counter is the dominant cost. |
