# Pyreon Framework Internals

Plain Mode (the `'use plain'` dialect) has its own file: [plain-mode.md](./plain-mode.md).

## Compiler

Two backends: a Rust native binary (napi-rs, 3.7–8.9× faster) and a JS fallback used per call when native throws. Any emit change lands in both in the same PR. `native-equivalence.test.ts` is the byte-identical oracle; `fuzz-equivalence.test.ts` runs 300 generated seeds × client/SSR.

### Template emission

- `shouldWrap` wraps only a non-pure call, a props access or a signal reference. Known pure-static calls stay bare.
- Static JSX is hoisted to module scope (`const _$h0`). A tree with a DOM element lowers to `_tpl()` plus bindings; reactive text writes `TextNode.data`, and a sole dynamic text child bakes a `' '` placeholder.
- **Two-phase binds.** All node captures from the pristine clone (`__eN`, `__tN`, `__pN`) are emitted before any `_mountSlot`/`replaceChild`, so a slot cannot corrupt a later sibling's ref walk.
- `as`, `satisfies`, `!` and parentheses are transparent at child and attribute seams: `{(() => x()) as never}` compiles like `{() => x()}`.
- Element-conditional and `.map` children stay on `_tpl` via `_mountSlot` and a `<!>` placeholder.

### Text fusion (`fuseTextChildren` / `fuse_text_children`)

An element whose children are only text and text-position expressions (≥2 parts, ≥1 reactive) lowers to one accessor: `() => _fuse("Hello ", name(), "!")`. On `_tpl` it binds via `bindPolymorphicText`, on SSR it emits `_escSole(_fuse(...))`, on the `h()` path it becomes `<p>{() => _fuse(...)}</p>`. The result is one adopted text node and no `<!--$-->` markers.

- `_fuse` returns the joined string when all parts are text-like (same coercion as a lone `{x}`), else the parts array so a VNode part still mounts.
- Not fused: a lone expression (`_bindText` direct tier), static-only mixes (`_setChildAt`), element/fragment/spread/component children, `props.children`, helper calls, inline JSX, element-valued consts, component parents.

### Child classification

A `{value}` child is polymorphic: a `VNode`/`VNode[]` mounts, a primitive sets text.

| Shape | Lowering |
| --- | --- |
| `{sig()}` or `{() => sig()}` (via `tryDirectSignalRef`) | `_bindText` / `_bindDirect` |
| General reactive text (`{props.x}`, `{a() + b()}`) | `bindPolymorphicText(() => expr, textNode, parent)` |
| Static sole text / static mixed text | `_setChild(el, expr)` / `_setChildAt(parent, placeholder, expr)` |
| In-file JSX-returning helper call (`{cell(x)}`), scope-aware | `_mountSlot(() => (cell(x)))`; cross-file callees (no type info) take the general-text row |

`_bindText` upgrades permanently to a subtree mount the first time its value is a VNode, NativeItem or VNode array; before that it writes `.data` only.

### Signals and props

- **Auto-call.** A tracked `const x = signal()`/`computed()` used bare in JSX becomes `{() => x()}`. Scope-aware. Cross-module signals come from the Vite plugin's export registry and the `knownSignals` option.
- **Props inlining.** `const`s derived from `props.*` or `splitProps` are inlined at JSX use sites (transitive, cycle-safe). `let`/`var` are not.
- **`<For>` item params are values, not props.** `row.id` bakes to a one-time `_setChild`; `row.label()` keeps `_bindText`.
- **Component children.** Props-backed stable references emit a `() => expr` accessor; plain stable references (no signal, no props root) emit bare.

### Rocketstyle collapse (`pyreon({ collapse: true })`)

Opt-in and build-only. A rocketstyle call site with literal props becomes one `_rsCollapse(html, lightClass, darkClass, isDark)` clone plus an idempotent `injectRules`; a nested Vite SSR resolver renders the real component in light and dark to capture them.

- Variants: `_rsCollapse` (also static element children), `_rsCollapseH` (`on*` handlers), `_rsCollapseDyn` / `_rsCollapseDynH` (a prop that is a ternary of two literals).
- Gated `if (collapseEnabled && isBuild && !isSsr)`; in dev it keeps the HMR-reactive mount and says so once.
- Coverage ceiling 86.0% (`collapse-bail-census.test.ts`); component children, non-enumerable dynamic props, spread and boolean attributes cannot collapse.

### Reactivity Lens

`reactivityLens: true` adds a span sidecar with the compiler's per-expression reactive/static verdict; code is unchanged. `analyzeReactivity(code, file, { knownSignals? })` merges it with the `detectPyreonPatterns` detectors, and `@pyreon/lint --lsp` shows inlay hints (`live`, `static`, `live·prop`, `live·attr`, `hoisted`). A `static` where you expected `live` is a captured-once value. Docs: `docs/src/content/docs/reactivity-lens.md`.

Live Program Inlay Hints (LPIH) is the runtime companion: fire and subscriber counts at source lines, dev-only, capturing `new Error()` and parsing `.stack` lazily.

## Code splitting, HMR, devtools

- `lazy(loader)` integrates with Suspense; `Dynamic({ component, ...props })` renders a dynamic component.
- **Signal-preserving HMR.** Top-level `signal()` becomes `__hmr_signal(...)`; values persist in `globalThis.__pyreon_hmr_registry__`.
- **Fast refresh.** `injectHmr` emits `accept((m) => __pyreon_hmr_swap__(id, m) || invalidate())`. Never emit a bare `accept()`: it suppresses the reload fallback and leaves a stale UI. The router's `_hmrSwap` re-renders the active lazy record whose `_hmrId` matches.
- Dev auto-naming: `signal(0)` → `signal(0, { name })`.
- **Transform scope.** `pyreon({ include, exclude })` (`createFilter` patterns). By default JSX under `node_modules` is transformed only for `@pyreon/*`, so a third-party package's React JSX is never reinterpreted; opt one in with `include`. The signal-export and `island()` prescans share one source walker that skips `lib`/`dist`/`build` only at a package root (a `src/lib/store.ts` still registers).

### Devtools

- `installDevTools()` attaches `window.__PYREON_DEVTOOLS__`; `hydrateRoot` calls it too in dev. Components register post-order, so rebuild the tree from `parentId` (`childIds` is empty).
- The reactive bridge (`reactive-devtools.ts`, `.reactive`) is always on in dev and removed in production.
- **Reactive overlay** (`.reactive.showOverlay()`, `Ctrl+Shift+R`, `$p.reactivity()`), tabs:
  - Health: `describeReactiveGraph` summary and insights (`orphan-signal`, `high-fanout`, `deep-chain`).
  - Activity: `getReactiveFires` plus the cause chain of the latest fire.
  - Inspect: a DOM→signal picker (`$p.pick()`). `_bindText` tags `textNode → _rdNodeId(source)` in a dev-only `WeakMap`; `nodesForElement(el)` (`@pyreon/runtime-dom`) reads it. Text bindings only.
- Tests: `binding-registry.test.ts`, `reactive-overlay.test.ts`, `e2e/reactive-overlay.spec.ts`.

### Dev error printer (`pyreon({ devErrorPrinter })`)

Default-on in dev. The Vite plugin injects `virtual:pyreon/dev-error-printer`, which routes `registerErrorHandler` errors through `diagnoseError` (`@pyreon/compiler/diagnose`, browser-safe) and prints the fix. The runtime never imports the compiler. Two rules, locked by `e2e/dev-error-printer.spec.ts`:

1. Inject with `src="/@id/<id, \0 as __x00__>"`. An inline module script importing `virtual:…` is not import-analysed and fails in the browser. Production never injects it.
2. `resolveId` resolves `@pyreon/compiler/diagnose` from the plugin's own location (importer `DEV_ERROR_PRINTER_ID`), since most apps do not depend on the compiler. `@pyreon/core` stays a bare, app-resolved import. The e2e runs against fundamentals-playground precisely because it lacks the compiler dep (an app with it hides this bug).

## Runtime-DOM specifics

- SVG and MathML elements (tracked by `SVG_TAGS`/`MATHML_TAGS` plus a depth counter in `mount.ts`) are created with `createElementNS` and always receive attributes via `setAttribute` (namespace-aware for `xlink:href`), because many of their properties are read-only `SVGAnimated*` getters.
- Custom elements (hyphenated tags) receive props as properties, except `data-*`/`aria-*`, which are always attributes on every element.
- `Transition`/`TransitionGroup` finish via a 5s safety timeout if no `transitionend` arrives. Subpath exports `@pyreon/runtime-dom/transition`, `/keep-alive` and `/sanitizer` keep a `mount`-only import small.
- A 10k-row `<For>` allocates ~10k signals; virtualize with `@pyreon/virtual`.

## Islands (`island(loader, { name, hydrate, prefetch? })`)

- Strategies: `load`, `idle`, `visible`, `interaction`, `media(query)`, `never` (no registry entry, so zero JS). `interaction` hydrates on `focus`/`click`/`pointerenter`/`touchstart`/`submit` and replays captured clicks and form submits afterwards. `prefetch: 'idle' | 'visible'` warms the chunk before the trigger.
- `pyreon({ islands: true })` (default) generates the registry consumed by `hydrateIslandsAuto(registry)`.
- `name` is optional for `const X = island(…)`: the name `X$<fnv1a6(relPath)>` is derived by `deriveIslandName` in `@pyreon/compiler` `island-naming.ts`, shared by the transform, the prescan and the project scanner so marker, registry and audit names cannot disagree. An explicit name wins; the runtime throws with guidance when no name arrives (plugin-less build, bindingless call).
- `vite dev` runs the islands audit once on boot and prints findings; `pyreon doctor --check-islands` is the project audit. Other rules: the "Islands Mistakes" section of `.agents/rules/anti-patterns.md`.

## Dev perf counters

Framework packages emit counters via `globalThis.__pyreon_count__?.('name')` with no import of `@pyreon/perf-harness`, behind the bare `process.env.NODE_ENV !== 'production'` gate so they tree-shake. Every name has exactly one row in `packages/internals/perf-harness/COUNTERS.md` (drift-tested in both directions; the count is not gated, so count the rows rather than trusting a prose total). Consumer API: `perfHarness.snapshot()/reset()/record()/diff()/overlay()`; automation in `examples/perf-dashboard`, `bun run perf:record` / `perf:diff`, and the advisory `perf.yml`.

## Signal implementation

`signal<T>()` has `.set()`, `.update()` and `.trigger()`.

- `.trigger()` re-runs subscribers without a value change (signals compare with `Object.is`). Use it only for an owned mutable value mutated in place; prefer `set(newObject)`. `wrapSignal` forwards it to the base.
- Direct subscribers: inline slot `_d1`, promoted to a `Set` on the second. Tracking subscribers: two inline (`_s1`, then a function in `_s`), promoted to a `Set` on the third. Never read `_s` as a `Set`; use `_hasSubscribers` / `_tierCount`.
- A compiled slot with a static value mounts via `mountChildAsUnit` (effect-only cleanups, leaves with the clone). An accessor slot keeps a full remover.

### Batch (`batch.ts`)

- Tier 1 drains `{ equals }` computed refreshes; tier 2 runs effects, multi-pass for re-entrant writes (`MAX_PASSES = 32`).
- Every computed is dirty-marked at notify time, so derived values settle before any effect runs regardless of subscription order. Lazy computeds are never queued.
- The tier-1 drain clears an entry's queue flag before running it, so a later re-dirty re-runs instead of being deduplicated.

### Retained heap

Signal ~152 B, effect ~930 B, computed ~913 B (≈6× a signal — prefer plain signals), `effectScope` ~64 B. Measure with `bun run measure-memory` under `NODE_ENV=production`.

### Introspection (dev/test, `@pyreon/reactivity`)

- **Reactive coverage** (`@pyreon/reactivity/coverage`): `startReactiveCoverage` / `takeReactiveCoverage` / `stopReactiveCoverage`, `computeReactiveCoverage(getReactiveGraph().nodes)`, `formatReactiveCoverage`. A signal counts when it changed; an effect or computed only when it re-ran after mount (else `ran-once`). Demo: `bun scripts/demo-reactive-coverage.ts`.
- **`describeReactiveGraph()`** / `formatGraphDescription`: plain-English per-node description plus health insights.
- **`getUpdateCause(nodeId)`** / `formatUpdateCause`: causal chain for a node's latest fire, walked over the dependency graph (fire order is not cause order, since a lazy computed recomputes during its reader). Returns `{ target, chain, rootReached }`; `rootReached: false` means older fires left the ring buffer.

## SSR

`renderToString(vnode)` and `renderToStream(vnode)` (Suspense streaming, 30s default timeout).

- `renderToString` is maybe-sync: only a real `async function Component()` makes its subtree async.
- Call `mergeChildrenIntoProps(vnode)` before `runWithHooks`. `runWithRequestContext(fn)` isolates context and store state per request; both renderers inherit an active request context.
- `renderPage()` (`@pyreon/server`) is the one string-mode page pipeline, used by `createHandler`, SSG prerender and zero dev SSR.
- Resolve lazy route components before rendering with `router.preload(path, req)`, not loaders-only `prefetchLoaderData`; an unresolved `lazy()` route renders blank.
- `renderToStream` calls `globalThis.__PYREON_STYLER_FLUSH__()` after the shell and in each Suspense boundary so content arrives styled.
- Boolean `aria-*` renders `"true"`/`"false"`. `UNSAFE_URL_RE` (`@pyreon/core` `url-guard.ts`, shared) drops `javascript:`/`data:` URLs except `data:image/*` on image elements.
- `<For>` emits per-item key markers `<!--k:KEY-->` (URL-encoded, `-` → `%2D`).

### `ssrTemplate` (compile-to-string)

Eligible trees lower to `_ssr(["<li>…", "</li>"], hole0, …)`. Holes resolve through the same `renderNode` as `h()`, so output is byte-identical (`ssr-template-differential.test.tsx`).

- Opt-in in `@pyreon/compiler` (`ssrTemplate: true`), because the emit injects an `@pyreon/runtime-server` import and `_ssr` returns an `instanceof`-branded `RawHtml` the app's own renderer must recognise.
- Auto in `@pyreon/vite-plugin`: enabled when `@pyreon/runtime-server` resolves from the app, else the `h()` path with a one-time dev warning. `true`/`false` force it.
- Rows and `.map` items concatenate statics and hole temps inline instead of calling `_ssrItem`. Holes not provably `string` are guarded; a failed guard (async `_esc`, a `RawHtml` from `_ssrChildren`/`_ssrForKeyed`) falls back to `_ssrItem`. Declines entirely when a user param could be shadowed by the `_h<n>` temps.

### Hydrating compiled templates

`_tpl` adopts server nodes at its cursor; verification is in `hydration-plan.ts`. Relaxations are declared by the compiler on the element, never inferred:

- `data-pyreon-hole`: a trailing mount hole for absorbed component children.
- `data-pyreon-html`: accept any server children (no string comparison); `_setHtml` (`applyDangerousHtml`) skips its first write to a marked element (the `h()` path marks in `hydrateElement`). A client `__html` differing from the server's shows until the first reactive update (as in React). The sanitized `innerHTML` prop is always re-assigned.
