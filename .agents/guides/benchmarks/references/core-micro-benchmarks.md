# Core micro-benchmarks

Bun-run cross-library micro-benchmarks under `scripts/bench/` (`bench:reactivity`, `bench:router`, `bench:head`, `bench:ssr`, `bench:ssr-cross`, `bench:validate`, …) plus per-package `bench` scripts for the fundamentals head-to-heads. They are separate from the browser DOM suite in `examples/benchmark`.

**Current figures live in the repo root `BENCHMARKS.md` (§5, §8–§11).** This file defers to it; it records the protocol, the traps, the mechanisms behind the standings, and the levers already measured and declined.

## Protocol

- Force `NODE_ENV=production` before any framework value import. Dev mode's always-on reactive-devtools registry dominates otherwise. ESM hoists static imports above a top-level assignment, so use a self-re-exec guard (see `scripts/bench/core/runtime-server.ts`), not an assignment at the top of the file.
- Resolve competitor imports to the build that does the work. Bare `solid-js` resolves to the inert SSR stub; import `solid-js/dist/solid.js`.
- One process per cell (op × library), rotated order, pooled windows, median + 95% bootstrap CI, adaptive warmup, a correctness gate before timing, and result sinks so reads cannot be dead-code-eliminated.
- Never force GC in bun/JSC micro-benches: `Bun.gc(true)` jettisons compiled code and adds re-tier noise. Pool small samples across process spawns instead.
- Never run benches concurrently. Stamp machine load before and after.
- Allocations in a micro-bench must escape, or JSC escape-analyzes them away (a `new Signal()` arm once read an impossible ~1.6 ns).
- Fundamentals benches run on JavaScriptCore; only the reactivity bench has a V8 (Node) pass. Profile anything that ships to Node (SSR) on Node, not Bun.
- `ns` figures are machine-dependent; the ratio is the portable signal.

## `process.env.NODE_ENV` is expensive in Node

A read costs ~1 ns in Bun (fast-pathed) and ~145 ns in Node (a real getter over the environment). Bundlers fold it, so browser apps and Vite production builds pay nothing. An unbundled Node process importing `lib/` pays it on every dev-gated hot path — `BENCHMARKS.md` §8's "unbundled" column is 10–20× the bundled one. Bun-run micro-benches cannot show this cost.

For genuinely unbundled server paths, gate with a module-init ternary whose condition is the bare inline expression: `const f = process.env.NODE_ENV === 'production' ? () => {} : realImpl`. A define folds the condition and the dev branch tree-shakes. A `const __DEV__` alias does not fold (`dev-gate-treeshake.test.ts` catches it).

## Router (`scripts/bench/core/router.ts`)

8-router protocol with per-cell process isolation, input rotation, and a correctness gate. Standings are in `BENCHMARKS.md` §9: Pyreon averages 1.00–1.01× of the fastest at 50 and 200 routes; Hono leads the 10-route table.

- Static resolve is flat O(1) across route counts.
- Dynamic matching reuses `scanCleanPath`'s recorded first-slash offset and skips re-comparing segment 0, which the dispatch key already proved (`packages/core/router/src/match.ts`). It is byte-identical to the previous matcher over a random-path differential.
- Miss → catch-all uses a first-char fail-fast mask built by `buildRouteIndex`: a path whose first char no route starts with jumps straight to the wildcard/not-found tail. The mask disables itself for dynamic-first routes and non-ASCII route first-chars; `%`- and `/`-first paths fall through. Locked by `packages/core/router/src/tests/first-char-mask.test.ts`.
- find-my-way/radix3 can edge param-heavy scenarios via radix-tree short-circuiting while returning less than Pyreon's full `ResolvedRoute` (params, parsed query, merged meta, matched chain).

## Reactivity (`scripts/bench/core/reactivity.ts`)

Standings are in `BENCHMARKS.md` §8. Pyreon leads effect propagation and batching; it loses signal creation (~5× vs Preact), computed diamond, deep chains, and (on V8) wide fan-out.

- **Diamond and deep chain are the cost side of a deliberate trade.** `computed` compares its value with `Object.is` at the runner boundary, so a downstream cascade stops when a derived value is unchanged (the memo-wall win). This bench changes every value every tick, so the gate never short-circuits and only adds a compare per hop. Do not revert it to win this bench.
- **Signal creation is bound by `Object.setPrototypeOf`** — the price of the callable-with-methods API. Per-instance method copies were measured and declined: they save a little once per signal, make every `.set()` dispatch ~2× slower (prototype dispatch beats own-property loads on a function object), and add ~95 B per signal.
- **Wide fan-out** is a near-tie whose sign machine load can flip; read it as leaning behind, not a regression.
- Memory: signal 152 B, + computed 913 B, + effect 929 B. Effect-queue flags are created lazily, so idle effects stay lean.
- Compiled apps use `_bindText` direct-subscriber bindings, not raw `effect()`, which is why DOM `partial update` wins while this bench's raw-effect rows are closer.

Mechanisms in place (all in `packages/core/reactivity/src/`):

- `_tpl()` clone + `_bind()` static-dep tracking; `TextNode.data` for reactive text.
- Inline single-subscriber slots (`_d1` direct, `_s1` tracking) promoting to a `Set` on the next subscriber.
- `_set` inline-batch direct dispatch, and a no-subscriber write fast path that skips the batch window.
- Verify-mode dep reuse (`tracking.ts:runVerify`): a steady-state effect/computed re-run verifies its previous deps positionally instead of rebuilding them — zero Set ops and zero allocations per re-run.
- Effect queue (`batch.ts`): an array + intrusive per-effect membership flag (`_eq`) + pass-generation counter (`_vg`), instead of Sets.
- Lazy computeds propagate dirtiness inline during the write's notify phase (`propagateLazyDirty`). Single-subscriber chains are walked iteratively via the `notify._c` back-ref stamped by `_markRecompute` — no closure call or WeakSet lookup per hop, no stack growth at any depth. Eager `{ equals }` computeds settle in the tier-1 queue before effects.

Declined micro-optimizations (measured on JSC; the current code was already fastest):

- Sole-subscriber extraction: `subs.values().next().value` is fastest (`for…of`+break 1.4× slower, `Set.forEach` 3.1×).
- Hoisting `Set.prototype.size` in `notifySubscribers`: no measurable delta; JSC folds the getter.
- Replacing `Object.is` in `_set`'s equality gate with an inlined expression: slower; `Object.is` is intrinsified.

## Head, styler, validate

Figures in `BENCHMARKS.md` §9. The head comparison is fair only when both sides serialize to the HTML string (Pyreon's resolve-only path against unhead's resolve-and-serialize overstates the lead).

## Fundamentals head-to-heads

All figures, wins and losses, are in `BENCHMARKS.md` §10. Notes that affect how to read them:

- **store** vs Zustand/Jotai: the hot path caches field signals in a dense array. With-subscriber `patch` suspends the store's change detector with an O(1) `_s` field swap (`_suspendSoleSubscriber` / `_resumeSoleSubscriber`) when the detector is the sole raw subscriber, guarded by a `detectorEpoch` counter that falls back to per-listener delete/add when user listeners share the field or a mid-patch side effect re-wired the detectors (`packages/fundamentals/store/src/index.ts`). "Leave detectors attached and ride the batch queue" was measured slower. `setup` is an architectural loss (per-field signals + registry, paid once per store id); per-op process isolation and untimed between-run resets keep harness heap from inflating it.
- **i18n**: `Intl.PluralRules` is memoized per locale (the bench caught a plural regression).
- **permissions**: only the fair resolver-race rows compare resolvers; memo-hit rows are a cache read.
- **query** vs `@tanstack/react-query`: both wrap the same `@tanstack/query-core`, so this measures the adapter. On a data-only change, an intra-component reader of 8 fields re-runs 1 field derivation and 0 components in Pyreon vs 8 derivations + 1 re-render in react-query. Cross-component (one component reads `status`, another `data`) is a tie — react-query's tracked props are field-aware across components. Mount is a tie. Runs in happy-dom.
- **http** vs ky/ofetch/redaxios/axios (`bun run --filter='@pyreon/http' bench:http`): every client goes through one stubbed `globalThis.fetch`, so rows isolate wrapper JS; the `bare` column is a floor, not a competitor. Static header objects are folded lazily at first request (so client creation stays lean) and snapshot there; function header sources stay live per request. Base clients disable Pyreon's and ky's default timeouts to match ofetch/redaxios/axios. This is CPU wrapper overhead: invisible for one request over a real network, relevant at SSR/loader fan-out volume.

## SSR harnesses

- `bench:ssr` (`scripts/bench/core/runtime-server.ts`) is Pyreon-only throughput, not a comparison. It forces production via the self-re-exec guard, pools windows with a bootstrap CI (flags `~noisy` when the half-width exceeds 10% of the median), warms adaptively, randomizes scenario order, and gates correctness. Running it in dev mode makes results swing ~100× between identical runs as the devtools registry grows.
- `bench:ssr-cross` (`scripts/bench/core/ssr-crossframework.ts`) renders the same tree through Pyreon/React/Preact/Solid behind a byte-identical output gate, one bun child per scenario. A shared process lets scenarios contaminate each other through the JSC heap (a byte-identical emit moved 22%). `--scenario=<label>` is the A/B unit; `--no-isolate` restores the shared sweep.
- The `examples/benchmark` `bench-ssr.ts` compares compiled SSR idiomatically against Vue/Svelte/React (`BENCHMARKS.md` §5).

### SSR `h()`-path floor

Self-time on the `h()` path is structural: `renderChildList`, GC, `escapeHtml`, `renderNode`, `renderElement`. The GC is VNode allocation inherent to `h()`. Rejected:

- Replacing `acc += r` with an array join in `renderChildList`: concat wins at every size (V8 builds ropes).
- Chasing the GC on the `h()` side: nothing removes per-render VNode allocation.

Headroom lives in widening compile-to-string `_ssr` eligibility (5–6× faster than `h()` on `bench:ssr-cross`).

### `_ssr` eligibility rules

- Self-closing roots, nested self-closing elements, and `.map`/`<For>` item bodies are eligible in both backends. A void element given explicit children still bails (the runtime drops them).
- A DOM wrapper holding a component child is eligible via `_ssrDeferred(() => _ssr(...))` (`packages/core/runtime-server/src/index.ts`). An `_ssr` hole is an eagerly evaluated argument; rendering a component has context side effects, so the whole call is deferred to its render position. Otherwise `<Provider><div><Consumer/></div></Provider>` renders `Consumer` before `provide()` runs and reads the context default. Rule: a compile-to-string hole may contain a pure value read, never a render with context side effects, unless the construct is deferred.
- Test compile-to-string changes in component-children and module-const positions, not only at top level, where eager and deferred evaluation coincide.
- Before trusting a green e2e on this path, confirm `ssrTemplate` was on: it auto-enables only when `@pyreon/runtime-server` resolves from the app.
- `transformJSX` prefers the native backend. A JS-only edit measures as "no change", and `bun run build` does not rebuild the `.node` binary — use `build:native`.
- Assert on the root element's emit, not on `_ssr(` substring presence; a salvaged sibling makes a substring check false-positive.
- Measure eligibility changes on `bench:ssr-cross`, not a bespoke harness (an async-promoted `h()` arm against a synchronous `_ssr` arm once reported 97×).

### Client `_tpl` self-closing roots

The client template path pre-gates self-closing roots out of `_tpl` (`tryTemplateEmit`). Closing that gate is a no-op: for a single element `cloneNode` and `createElement` do the same DOM work (measured 1.01×). `_ssr` wins by replacing VNode allocation with string concatenation; `_tpl` wins only by amortizing a subtree parse. Measure before porting a fix across gates that look alike.

## Declined DOM-path levers

- The per-row `NativeItem` wrapper `_tpl` returns is the largest JS allocator on create-10k, but the op is dominated by the harness's deliberate forced layout and GC, and `NativeItem` is a compiler↔runtime contract consumed by `mountChild`, `hydrateRoot`, and `<For>`. The win is below measurement.
- For create and clear ops, profile before optimizing. `getBoundingClientRect` dominating a profile is the harness working as designed. See `.agents/guides/benchmarks/README.md` ("Create/replace gap", "Clear rows") for the current decomposition.
