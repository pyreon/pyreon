# Pyreon — Signal-Based UI Framework

## Overview

Full-stack UI framework with fine-grained reactivity (signals). SSR, SSG, islands, SPA. All packages under `@pyreon/*` scope.

**This file is the single source of truth** for feature status, shipped patterns, and open gaps — tracked next to the code they describe. Keep it lean: durable contracts + non-obvious gotchas, NOT per-PR changelog narrative (that lives in git history / CHANGELOG / `.claude/rules/*`). The engineering bar is "do it properly, not quickly." For prioritization across open items, ask the user.

Deep-dive references live in `.claude/rules/` (anti-patterns, architecture, code-style, testing, workflow, test-environment-parity) and `.claude/audits/`. Read `.claude/rules/anti-patterns.md` before introducing a module-level cache/stack/registry or touching the compiler/SSR/mount paths.

## Benchmark Results

**Pyreon (idiomatic JSX) is the fastest FRAMEWORK on a synthetic krausest-style row-list benchmark** (Chromium via Playwright), after a 2026-06 objectivity pass. On a proven `--repeat 5` pooled run it wins **7 of 9 framework verdicts outright**, ties Solid on `select`, and Solid edges it on `remove` (7.20 vs 7.30ms). Robust signals: a tight cluster with Vue/Solid on small ops + create-1k; a genuine **2.4–3.0× edge over React/Svelte/Preact at bulk-create (10k)**; ~10× on React's keyed `swap`; 3.2–4.1× on Vue/Svelte `append`. Only measurable cost vs **Vanilla** is bulk-create (~6–7%, from per-row signal alloc + cleanup closure + keyed-For map). On **retained memory Pyreon is mid-pack (2.90MB after the 2026-07 anchor-registry fix — was 3.14–3.16; the latest full run ranks it 5th of 7, ahead of Solid 2.97 + Vue 3.97, behind Preact/Svelte/React/Vanilla)** — the one dimension it does NOT lead. The fix deleted a structural 256KB WeakSet-table high-water (anti-patterns: "module-level WeakSet registries"); heap-SNAPSHOT self-size (object graph) is now below Solid's, and the residual usedJSHeapSize gap tracks code-space/bundle size. Retained has real cross-run variance (Solid measured 2.27–2.97 across same-day runs) — treat mid-table ranks as a band.

| Benchmark | Vanilla | **Pyreon** | Vue 3 | Solid | React 19 | Svelte 5 | Preact |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Create 1,000 | 8.40 | **9.00** | 10.00 | 10.40 | 11.60 | 12.60 | 13.90 |
| Replace 1,000 | 8.50 | **9.00** | 9.90 | 10.20 | 11.30 | 12.90 | 13.80 |
| Partial update | 800µs | **700µs** | 1.60 | 4.50 | 1.10 | 2.30 | 1.30 |
| Select row | 0µs | **0µs** | 700µs | 0µs | 300µs | 400µs | 400µs |
| Swap rows | 800µs | **700µs** | 1.40 | 800µs | 7.10 | 2.40 | 1.10 |
| Remove row | 6.90 | **7.30** | 8.40 | 7.20 | 7.50 | 8.80 | 7.80 |
| Clear rows | 100µs | **200µs** | 400µs | 500µs | 1.00 | 400µs | 800µs |
| Create 10,000 | 89.80 | **95.00** | 110.50 | 115.50 | 226.20 | 237.70 | 288.20 |
| Append 1k→10k | 20.90 | **22.40** | 92.30 | 23.80 | 24.70 | 72.10 | 28.30 |

(ms unless noted. Median of 100 pooled samples, Apple M3 Max / Chromium 148. Reproduce: `cd examples/benchmark && bun bench:fair --repeat 5`.)

**ONE honest Pyreon entry** = the idiomatic JSX users ship (`pyreon.tsx`). There is no manufactured "compiled" tier — the compiler already lowers idiomatic JSX to the same `_tpl()` cloneNode + fine-grained-binding output a hand-written `_tpl()` would (PR #1501 removed a per-row `_bind()` inefficiency for static `<For>`-item reads, making them byte-identical). Earlier "4–8× on small ops" claims were a harness artifact (an `rAF` commit wait inside the timed region + missing per-run resets), fixed by tightest-commit timing (`flushSync`/microtask/synchronous per framework) + per-run reset hooks.

**Methodology** (designed for objectivity): per-framework page isolation (`page.goto('?framework=X')`); forced GC between iterations (`--expose-gc`); adaptive warmup; 20 timed runs + median + 95% bootstrap CI + CV + CI95-overlap `🤝` tied-marker; real Chromium on production `vite build`; DOM verification per iteration; seeded RNG; real published deps; tightest-commit-per-framework (no `rAF`); per-run resets on every op; randomized + per-pass-reshuffled execution order; machine stamp printed; retained-heap metric (`--enable-precise-memory-info`, post-GC). **Honest limits**: this is CPU-objective, not real-world-async-latency (React's default path would be higher); the deepest limit is **author-judge** (the framework author writes + judges the bench) — only an upstream submission to the independent krausest/js-framework-benchmark fully resolves it (a ready-to-submit `frameworks/keyed/pyreon` implementation is staged at `contrib/krausest/pyreon-keyed/` — built + 8-op-smoked against PUBLISHED npm packages; submission steps in its README-SUBMISSION.md — the upstream PR itself is a human decision). A **real-app head-to-head does not exist yet** (the `cpa-pw-app-*` ports run on Pyreon compat shims, not the real frameworks) — "fastest" claims stop at this synthetic suite's evidence.

### Core micro-benchmarks (`scripts/bench/`)

Bun-run cross-library micro-benchmarks (separate from the browser DOM suite). **Must force `NODE_ENV=production` before framework imports** (dev mode's reactive-devtools registry dominates) and resolve competitor imports to the build that does the work (bare `solid-js` resolves to the inert SSR stub — import `solid-js/dist/solid.js`). Honest standings: **Router** static resolve is flat O(1) (~16ns median) across 10/50/200 routes — ties radix3 for fastest at realistic sizes, where Hono's mega-regex COLLAPSES (150ns+ at 50/200 — it leads ONLY the 10-route toy table, where its single compiled regex wins 6/7 rows ~5–11×); on dynamic routes the find-my-way/radix3 radix-trees edge it ~1.1–1.2× while returning less than Pyreon's full ResolvedRoute (params + parsed query + merged meta + matched chain). Measured with an 8-router pooled-CI95 protocol (per-cell process isolation, input rotation, correctness gate — `scripts/bench/core/router.ts`); **Reactivity** improved by the 2026-07 verify-mode dep-reuse change (`runVerify` positional dep verification — effect/computed re-runs no longer tear down + rebuild their dep Sets; preact's versioned-node reuse SEMANTICS adapted to Pyreon's array/Set architecture, signal-side notify byte-identical): Pyreon now LEADS effect propagation outright (~1.4× over Preact, ~3× over Solid — was 1.6× behind Preact) and ties Preact on batch-50 (was 1.9× behind); Preact still leads signal create (~1.5×), computed diamond (~2.9×), deep chain (~2.1×), and wide fan-out (~2.4×, narrowed from 4.5× — the residual gap is batch-queue Set machinery per enqueued effect, not dep tracking); NOT contradicted by the DOM `partial update` win because compiled apps use `_bindText` direct-subscriber bindings, not raw `effect()`); **Head** ~1.3–2.1× faster than unhead (5/20/50 tags — fair comparison: both serialize to the HTML string; the prior 4.9–7.2× figure compared Pyreon's resolve-only against unhead's resolve-and-serialize); **real-app TodoMVC** ~5.7–16× vs real `react-dom@19` (µs-scale, high-CV — magnitude is the signal).

Per-library head-to-heads (all `NODE_ENV=production`, idiomatic per lib, correctness gate, per-op process isolation): **store** vs Zustand/Jotai — wins the per-field hot path (dispatch 6.4× / write→1sub 2.3× / no-sub patch 1.7×), 🤝 ties read; LOSES `setup` ~12.6× (per-field signals + registry, paid once per store id — a third of the previously-reported 20× was harness artifact: shared child heap + unbounded registry retention, fixed by per-(op×impl) process isolation + untimed between-run resets) and with-subscriber `patch` 1.7× (down from 2.6×; the per-key `{key,oldValue,newValue}` event model does more per notify than Zustand's shallow merge — documented Pareto, suspend-optimization measured a wash). Bench-harness lesson: NO forced GC in bun/JSC micro-benches (`Bun.gc(true)` jettisons compiled code → re-tier noise; pooled small samples across process spawns instead); **state-tree** vs MST — faster on the action/patch/reactive hot path; **machine** vs XState — large constant-factor win on common ops (XState buys statechart features Pyreon offloads to signals); **i18n** vs i18next — faster on every op (`Intl.PluralRules` memoized per locale — the bench caught a ~16× plural regression); **permissions** vs CASL; **form** vs TanStack form-core; **query** vs `@tanstack/react-query` (`bench:react-query`, real react-dom@19 in happy-dom) — both wrap the SAME `@tanstack/query-core` (pinned tree-wide), so it measures the ADAPTER not the engine; the HEADLINE is a deterministic COUNT: on a data-ONLY change (`setQueryData`), an INTRA-component reader of 8 fields re-runs **1 field-derivation + 0 component re-runs** (Pyreon signal-granular) vs react-query's **8 derivations + 1 whole-component re-render + VDOM reconcile** (observer=component granularity); CROSS-component (one reads `status`, one `data`) is a **🤝 tie** — react-query's tracked-props ARE field-aware across components, so the honest win is INTRA-component + steady-state per-update latency (~4× on data-flip→DOM: synchronous fine-grained patch vs react-query's macrotask-batched render), NOT mounting (~tied) and NOT cross-component. ns is machine-dependent — the ratio is the portable signal.

Key reactivity optimizations: `_tpl()` (cloneNode), `_bind()` static-dep tracking, `TextNode.data` reactive text, single-subscriber inline slot (`_d1`) promoting to `Set` on 2nd subscriber, `_bindText` single-subscriber fast path, `_set` inline-batch direct dispatch (single-subscriber notify ~131ns→~16ns), verify-mode dep reuse (`tracking.ts:runVerify` — steady-state effect/computed re-runs verify the previous dep list positionally instead of Set-teardown+rebuild: zero Set ops + zero allocations per re-run; measured 2.0–2.2× effect propagation, 1.85× batch-50, 2.6× 10k-effect re-run, memory-neutral). The 2026-06 create-path opts (`createSelector` inline-first-subscriber, baked text placeholder) cut the create-10k gap vs Vanilla ~31%.

## Package Overview

| Package | Description |
| --- | --- |
| `@pyreon/reactivity` | signal, computed, effect, onCleanup, batch, createSelector, createStore, untrack, wrapSignal, isServer/isClient |
| `@pyreon/core` | VNode, h(), Fragment, lifecycle, context, JSX runtime, Suspense, ErrorBoundary, lazy(), Dynamic, cx(), splitProps, mergeProps, createUniqueId |
| `@pyreon/runtime-dom` | DOM renderer, mount, hydrateRoot, Transition, TransitionGroup, KeepAlive, SVG/MathML namespace, custom elements |
| `@pyreon/compiler` | JSX transform: Rust native (napi-rs, 3.7-8.9x faster) + JS fallback. `shouldWrap`, static hoisting, `_bind`, pure calls, spread templates. Reactivity-Lens sidecar (`analyzeReactivity`). Owns the SHARED zero fs-route convention (`@pyreon/compiler/fs-route-convention` — zero's fs-router/api-routes re-export it, identity-locked) + island-name derivation |
| `@pyreon/runtime-server` | renderToString, renderToStream, Suspense 30s timeout, XSS-safe templates, For key markers |
| `@pyreon/router` | hash+history+SSR, context-based, prefetching, guards, loaders, useIsActive, View Transitions (reduced-motion-aware — skips the animation under `prefers-reduced-motion: reduce`, DOM still swaps; WCAG 2.3.3), route-change screen-reader announcements (a11y — root `<RouterView>` writes the new page's title/path to a visually-hidden `aria-live` region on nav; opt out with `announceRouteChanges={false}`), middleware, typed search params, typed routes (`RegisteredRoutes` augmentation → `RouterLink` typo-rejection), auto external-link handling (`target=_blank`/`rel`, per-router `links` config + per-link overrides), link DX (RouterLink resolves context ?? active-router like hooks; NO router → plain-anchor degradation + once-per-`to` dev warning; dev document-level warning when a plain internal `<a href>` full-reloads — opt out via `target`/`download`/`data-allow-reload`), browser Back/Forward runs the FULL navigation pipeline (loaders/guards/blockers/afterEach/scroll/title; cancelled traversals restore URL+position via `history.state.__pyreonIdx` stamps; only the newest live router writes shared history back), `push()`/`replace()` resolve with `NavigationResult` (`'committed'|'cancelled'|'superseded'`), `router.revalidate()` (in-place loader refresh), prefetch routes through the loader cache + in-flight dedup |
| `@pyreon/head` | useHead, HeadProvider, renderWithHead, ScriptTag |
| `@pyreon/server` | createHandler (SSR), renderPage (shared string-mode pipeline), prerender (SSG), island(), middleware |
| `@pyreon/vite-plugin` | JSX transform + SSR dev middleware + signal-preserving HMR |
| `@pyreon/react-compat` | Full hooks + forwardRef, memo, lazy, Suspense, createContext, createPortal shims. Companion compat layers: `preact-compat`, `vue-compat`, `solid-compat`, `svelte-compat` — each at near-full public-API parity |
| `@pyreon/storybook` | Storybook renderer — mount, render, interact with Pyreon components |
| `@pyreon/typescript` | TypeScript config presets: base, app (noEmit), lib (declarations) |
| `@pyreon/lint` | Pyreon-specific linter — 94 rules, 18 categories (incl. opt-in best-practices: frontend/query/rx/i18n/storage + router/form), config files, watch mode, AST cache, LSP server |
| `@pyreon/testing` | PUBLIC test kit — Testing-Library-style `render`/`screen`/`cleanup` + `getByText`/`getByTestId` families (fireEvent/waitFor/renderHook + reactive-native matchers landing across follow-up PRs). Browser package. Distinct from the private `@pyreon/test-utils` (framework-internal) |
| `@pyreon/test-utils` | Private framework-internal testing utilities — initTestConfig, withThemeContext, getComputedTheme, renderProps, resolveRocketstyle, mountReactive, mountAndExpectOnce, accessInternal, callInternal, mockAdapter |
| `@pyreon/manifest` | Private: type + `defineManifest` helper feeding doc + MCP generators |
| `@pyreon/perf-harness` | Private: dev-time counter registry. Framework packages emit via `globalThis.__pyreon_count__?.(name)` — zero import coupling |
| `@pyreon/vitest-config` | Private: `defineNodeConfig` / `defineBrowserConfig` — single canonical shape for every package's vitest config. Locked by `pyreon/vitest-config-uses-shared` |

### UI System (Component Library)

| Package | Description |
| --- | --- |
| `@pyreon/ui-core` | Config engine, init(), utilities, HTML tags |
| `@pyreon/styler` | CSS-in-JS: styled(), css, keyframes, theming |
| `@pyreon/unistyle` | Responsive breakpoints, CSS property mappings, unit utilities |
| `@pyreon/elements` | 5 foundational primitives (Element, Text, List, Overlay, Portal) |
| `@pyreon/attrs` | Chainable HOC factory (.attrs(), .config(), .statics()) |
| `@pyreon/rocketstyle` | Multi-state styling (states, sizes, variants, themes, dark mode) |
| `@pyreon/coolgrid` | 12-column responsive grid (Container, Row, Col) |
| `@pyreon/kinetic` | CSS-transition animations (Transition, Stagger, Collapse) |
| `@pyreon/kinetic-presets` | 120+ animation presets |
| `@pyreon/connector-document` | Bridge between ui-system components and @pyreon/document |
| `@pyreon/document-primitives` | Rocketstyle-based document components — render in browser AND export |

### UI Component Library (packages/ui/)

| Package | Description |
| --- | --- |
| `@pyreon/ui-theme` | Default theme + rocketstyle ThemeDefault/StylesDefault augmentation |
| `@pyreon/ui-components` | 67 rocketstyle components across 10 categories |
| `@pyreon/ui-primitives` | Headless behavior primitives (ComboboxBase, CalendarBase, etc.) |

**@pyreon/ui-components architecture**: three bases — `el` (Element/layout), `txt` (Text/typography), `list` (List/flowing). Factory re-exports `el`/`txt`/`list`/`rs` from `bases/`. **Layout in `.attrs()`** (`tag`, `direction`, `alignX`, `alignY`, `gap`, `block` → Element's inner layout); **CSS + pseudo-states in `.theme()`** (`hover`/`focus`/`active`/`disabled` objects → `:hover`/`:focus-visible`/`:active`/`:disabled`). `:hover` is unconditional (only `cursor:pointer` gates on `onClick`/`href`). CSS naming is unistyle convention (`borderWidthTop`, not `borderTopWidth`). **`useBooleans: false` is the rocketstyle default** — dimension props take strings (`state="primary"`), not booleans; opt in via `rocketstyle({ useBooleans: true })`. Theme augmentation lives in `@pyreon/ui-theme` (`ThemeDefault extends Theme`, `StylesDefault extends ITheme`) — apps must NOT re-augment.

### UI System — Key Technical Details

- **@pyreon/styler**:
  - `styled('div')` → `ComponentFn`; `css` → lazy `CSSResult`; `keyframes` → animation name; `createGlobalStyle`/`createSheet()`.
  - `ThemeContext` is REACTIVE (`createReactiveContext<Theme>`) — `useTheme()` snapshots, `useThemeAccessor()` returns the `() => Theme` for tracking in effects. Whole-theme swaps re-resolve CSS + swap classnames without remounting.
  - Singleton `StyleSheet` (FNV-1a hashing, dedup, SSR).
  - **`innerRef` is a `ref` alias** on `styled()` (a styled component renders one DOM node so `ref` already targets it); without it `<Styled innerRef={fn}>` silently dropped the ref.
  - **SSR fast path** in `DynamicStyled` (`IS_SERVER` const): skips the per-component reactive `computed`+`ref`+`renderEffect` allocation server-side (~5× faster `renderToString`, byte-identical className → no hydration mismatch).
- **@pyreon/unistyle**:
  - single value, mobile-first array `[xs,sm,md,lg]`, or breakpoint object. 170+ CSS property mappings.
  - Responsive `@media (min-width)` emits only deltas (mobile-first cascade — `optimizeBreakpointDeltas`).
  - **`themeToCssVars(theme, opts?)`** autogenerates `--px-*` custom properties from a plain theme JSON — returns `{ vars, css, registry }`; units baked at emission via `value()`+rootSize (`spacing.small: 8` → `--px-spacing-small: 0.5rem`); plain `var()`/`calc()` strings flow through the whole value pipeline untouched (the tested passthrough contract). Pure + WeakMap-cached by theme identity. See "CSS-variables theming" below.
- **@pyreon/rocketstyle**:
  - `rocketstyle(component)` multi-dimensional engine (dimensions: `state`/`size`/`variant`/`theme` + custom; dark/light via `useDarkMode`).
  - **Per-definition caching** (created once per `rocketComponent()`, shared via WeakMap): `_dimensionsCache`, `_reservedKeysCache`, `_omitSetCache`, `LocalThemeManager`, and `_rsMemo` — a `WeakMap<theme, Map<keyString, {rocketstyle, rocketstate}>>` keyed by `mode|dimensionPropTuple|pseudoState` that returns SAME object identities on hit so the styler `classCache` skips resolution (LRU 128/theme; real apps need ONE shared `<PyreonUI>` for the memo to span instances).
  - `getTheme` in-place merge + frozen `EMPTY_PSEUDO`. Dev guard tree-shaken in prod.
- **@pyreon/attrs**: `attrs(component)` chainable — `.attrs({props})` (default props), `.config({dimensions})`, `.statics({method})`, `.compose(enhancer)`.
- **@pyreon/kinetic**:
  - `kinetic(component)` → `.preset()`, `.enter()/.enterTo()`, `.leave()/.leaveTo()`, `.collapse()`, `.stagger()`, `.group()`. 4 modes.
  - **SSR contract**: `<Transition show={() => false}>` always emits children with hidden-state classes inlined (`leaveTo` else `enterFrom`) — critical for SSG scroll-reveal (IO can't fire server-side). Animation is visual, content is structural; matches Framer Motion / react-transition-group norm.
  - Trade-off: initially-hidden `unmount:true` no longer triggers true DOM removal after a later leave.
- **@pyreon/elements**:
  - `Element` (block w/ responsive style props), `Text`, `List`, `Overlay` (positioned + backdrop), `Portal` (per-instance wrapper element inside `DOMLocation`, default `document.body` — read rendered DOM one level deeper).
  - **Overlay focus restore** (a11y): `useOverlay` returns focus to the trigger on close only when focus is still inside the closing overlay. Use `useOverlay` for tooltips/popovers/dropdowns; never reimplement positioning.
  - Element simple-path fast path (no before/after content + non-needsFix tag → single styled invocation, 31–45% faster); `$element` bundle interning (`internElementBundle()`, same primitive tuple → same identity → `elClassCache` hit).
- **@pyreon/ui-core PyreonUI**: single provider (theme/mode/config). Props `theme`, `mode` (`"light"|"dark"|"system"` — system auto-detects `prefers-color-scheme`), `inversed`. `useMode()` → mode signal; `enrichTheme(theme)` merges defaults. `init()` preserved for custom envs.

**CSS-variables theming — `init({ cssVariables: true | { prefix, attribute } })`** (opt-in, ui-system-wide; flag off = byte-identical classic):

- PyreonUI tokenizes the enriched theme via `themeToCssVars`, injects the `:root` block once (SSR-aware), provides a var-leaf tree.
- Dark/light flip becomes ONE `documentElement[data-theme]` attribute write with ZERO re-resolution / className churn (rocketstyle `_resolveRsEntry` neither reads nor keys on the mode signal under the flag — styler `classCache` skips resolution on flip).
- Component-level `mode(a, b)` becomes a hashed deduped var-pair factory (`--px-m-<fnv1a>`); theme authoring is UNCHANGED.
- **Root-vs-nested split** (FOUC fix): the ROOT provider writes the mode attribute to `document.documentElement` via a client effect + returns children unwrapped; only NESTED/`inversed` providers render a `display:contents` wrapper scoping an override.
- `cssVariablesPrePaintScript({ attribute?, storageKey?, fallback? })` (from `@pyreon/ui-core`) builds the blocking `<head>` script (zero's `themeScript` composes automatically).
- Document export resolves `mode(a,b)` vars via `resolveModeVar` + `extractDocNode({ theme?, mode? })`.
- Measured: ~1.9× faster steady-state toggle at 300 real components (vars does ZERO per-component JS; the EAGER-vs-LAZY `coreContext` getter fix was load-bearing — an eager `{ theme, mode }` object subscribed every theme reader to mode). Retained heap neutral; bundle ~2.2 KB gz.
- The one bug class is JS arithmetic on a `var()` value (`gap/2` → NaN) — found only in coolgrid (`isCssVarValue` → native `calc()`); the styler dev validator (`sheet.insert` NaN/malformed-var scan) is the runtime safety net.
- Reference: `unistyle/cssVariables.ts`, `ui-core/{config,PyreonUI}.tsx`, `rocketstyle/utils/theme.ts`, `styler/sheet.ts`.

## PMTC Multi-Target Architecture

The Pyreon Multi-Target Compiler emits SwiftUI + Compose from one `.tsx` source. **Scope the "100%" precisely**: what's done is the **emit vocabulary** (all 15 canonical primitives map to both targets). It does NOT mean "all packages work on native," "device-proven," or "production-ready" (current honest score ~66/100, demo-quality). Three reality-checks:

- (a) **PMTC compiles a declarative TS subset; the failure mode outside it is now MOSTLY a NAMED warning, not a silent drop** — the current per-PR-maintained closed/open construct list lives in `docs/multiplatform.md` (do NOT re-enumerate it here; an inline list drifts stale). Verified LOWERING + `swiftc`/`kotlinc`-typechecking on both real toolchains: local object/array literals, destructuring, `Map`/`Set`, common control flow, template literals, optional chaining, fractional math, and string/array methods. Constructs still OUT of the subset now WARN by name (`interface`/`enum`/`class`, `try`/`throw`, JSX spread on a primitive, regex literals, `JSON.*`, computed object keys, call-arg spreads, top-level helper functions). Genuine remaining gaps: generics in logic, and nested/edge shapes outside the tested corpus — see `docs/multiplatform.md` for the live per-construct status (esp. the helper-function arc, which is moving from warn → native emit). **The load-bearing caveat still holds**: the per-PR gate is `swiftc -parse` (syntax-only, NOT typecheck) + `kotlinc`-against-stubs, so a type-level corruption in the UNTESTED TAIL isn't caught per-PR — only the slow `test (native)` / `Validate emitted` CI cells (real `-typecheck` + `kotlinc`), the idiom-sweep corpus, and the advisory device gate reach it.
- (b) **Device proof is advisory** (`native-device.yml` gates zero PRs).
- (c) **Rich web packages (flow/charts/code/dnd/document/query/table/virtual + the CSS-in-JS ui-system) are web-only by architecture** — PMTC compiles your source, not npm libraries.

**Four-layer shared-code model**:

- L0 `signal()/computed()/effect()` (runs identically; maps to `@State`/`mutableStateOf`);
- L1 custom pure-logic hooks (100% shared);
- L2 ServiceBackend hooks (`useStorage`/`useRouter`/`useFetch`/`usePermissions`);
- L3a `@pyreon/primitives` (15 canonical multi-platform primitives — `Stack`, `Inline`, `Layer`, `Scroll`, `Spacer`, `Text`, `Heading`, `Image`, `Icon`, `Button`, `Press`, `Link`, `Field`, `Toggle`, `Modal`; one canonical name per concept, `onPress` everywhere, tokens-first styling, no responsive/animations in v1);
- L3b `@pyreon/elements` (web-only-rich, rocketstyle/styler-coupled);
- L4 `<NativeIOS>`/`<NativeAndroid>`/`<Web>` escape hatches.

Canonical primitive maps: `packages/native/compiler/src/canonical-primitives.ts` (`SWIFT_NAMES`/`KOTLIN_NAMES`, 15 each). Cross-platform a11y vocab (`AccessibilityProps`): `accessibilityLabel`/`accessibilityHidden` lower per-target (web lowering ships; iOS/Android emit is a tracked follow-up).

**Per-platform import resolution**: on web `@pyreon/primitives` runs the real DOM impl; on iOS/Android the PMTC compiler intercepts the JSX and emits native code before the runtime — the import is type-anchor-only.

**Native runtime ports** (`packages/native/runtime-{swift,kotlin}/`): storage (`@PyreonAppStorage`/`rememberPyreonStorage`), forms, fetch, permissions, router (`PyreonRouter` + guards + nested routes + per-route loaders), plus Phase-5 hooks (`useAuth`/`useDatabase`/`useGeolocation`/`useMap`/`useWebSocket`/`usePush`/`usePayments`).

**Lifecycle auto-start** — PARTIAL (not "none"):

- `useFetch` (auto-fetch) + `useWebSocket` (auto-connect) + `onMount(fn)` sync bodies ARE synthesized on mount on BOTH targets with NO explicit `.begin()`/`.connect()` call needed (Swift `.task`/`.onAppear` on a stable-identity ZStack host, Kotlin `LaunchedEffect(Unit)`).
- The remaining service hooks (`useGeolocation`/`usePush`/`usePayments`) are NOT yet auto-started — their Kotlin `start(register:)`/`connect(register:)` needs a default per-hook transport first (the SAME OkHttp-for-WebSocket asymmetry: Swift's `PyreonGeolocation.start()` is 0-arg, Kotlin's takes a host closure), so call `.start()`/`.connect()` from an effect for those.
- `useDatabase`/`useMap` need no start (ready-on-init); `useAuth.beginSignIn()` is user-triggered. `useSecureStorage` deferred.

**Native lifecycle gotchas (device-found, compile-only can't catch)**:

- (1) `<Suspense>`/`<ErrorBoundary>` compile to an INLINE conditional read in the component body (the `@Observable`/recomposition read must be in `body` to be tracked — wrapper-struct arg-passing does NOT track).
- (2) Swift `.task` needs a STABLE-identity host — a fetch-bearing component's body is wrapped in a concrete `ZStack` so `.task` fires once (attached to a transparent `Group{if…}`, SwiftUI redistributes it onto the branch and cancels+restarts per flip → fetch thrashes forever); Kotlin uses a `LaunchedEffect(Unit)` sibling, no equivalent needed.
- (3) **`<Inline>` is a non-wrapping Compose Row (overflows) but a shrinking SwiftUI HStack** — a horizontal group that fits on iOS can clip its last children off-screen on Android; stack vertically or keep groups narrow; treat "tap works on iOS, times out on Android" as Row-overflow first.

Honest capability matrix: `docs/src/content/docs/multiplatform.md`.

## Fundamentals — Key Technical Details

| Package | Description |
| --- | --- |
| `@pyreon/store` | Global state — `defineStore(id, setup)` composition stores returning `StoreApi<T>` |
| `@pyreon/state-tree` | Structured reactive state tree — models, snapshots, patches, middleware |
| `@pyreon/form` | Signal-based forms — `field()`, `useField('name')`, `<Form>/<Submit>`, arrays, validation |
| `@pyreon/validation` | Universal, library-agnostic validation gate + **single canonical home for the Standard Schema contract**. Owns the validation contract (`ValidationError`/`ValidateFn`/`SchemaValidateFn`), the Standard Schema types (`StandardSchemaV1` strict spec type · `StandardSchemaLike` lax accept-type · `StandardSchemaResult`/`StandardSchemaIssue`; `StandardSchemaShape` is a deprecated alias), the bridge (`isStandardSchema`/`standardSchemaToValidator`/`wrapStandardSchema`), universal `InferSchema` (resolves `~standard.types.output` AND, when that phantom is omitted, the `validate` return), + adapters (Zod/Valibot/ArkType). **Zero pyreon deps**; `@pyreon/form`/`store`/`state-tree`/`feature`/`validate` consume it — `@pyreon/validate` + `@pyreon/state-tree` import the `~standard` types from here instead of re-declaring them (form re-exports the contract for back-compat). `@pyreon/zero`/`zero-content` keep inline `~standard` duck-typing (they sit above the fundamentals layer, can't depend on it) |
| `@pyreon/validate` | DX overlay on Standard Schema (`withField`/`parseReactive`/`formatErrors`) + own `s` validator runtime |
| `@pyreon/query` | TanStack Query adapter |
| `@pyreon/table` | TanStack Table adapter |
| `@pyreon/virtual` | TanStack Virtual adapter |
| `@pyreon/i18n` | Reactive i18n — async namespaces, plurals, interpolation, Intl formatters |
| `@pyreon/feature` | Schema-driven CRUD primitives (queries/forms/tables/stores) |
| `@pyreon/charts` | Reactive ECharts bridge, lazy-loaded |
| `@pyreon/storage` | Reactive client-side storage — local/session/cookie/IndexedDB/memory |
| `@pyreon/hooks` | 43 signal-based hooks |
| `@pyreon/hotkeys` | Keyboard shortcuts — reference-counted scopes, `mod` cross-platform alias, sequential combos (`g t`), shifted-symbol shortcuts (`?` fires on Shift+/), conflict detection (`getHotkeyConflicts`), SSR-safe (registration/scope no-op on server, no cross-request bleed) |
| `@pyreon/permissions` | Reactive permissions — RBAC/ABAC/flags/tiers |
| `@pyreon/machine` | Reactive state machines — constrained signals + typed transitions |
| `@pyreon/flow` | Reactive flow diagrams — signal-native nodes/edges, pan/zoom, elkjs layout |
| `@pyreon/code` | Reactive code editor — CodeMirror 6, minimap, diff, tabbed |
| `@pyreon/rich-text` | Reactive WYSIWYG — signal-backed TipTap/ProseMirror, lazy, a11y-labeled |
| `@pyreon/document` | Universal document rendering — 18 primitives, 20 output formats |
| `@pyreon/rx` | Signal-aware reactive transforms — 37 functions |
| `@pyreon/toast` | Toasts — `toast()` + variants, `<Toaster>`, a11y |
| `@pyreon/url-state` | URL-synced state — `useUrlState`, schema mode, type coercion, SSR-safe |
| `@pyreon/dnd` | Signal-driven DnD — wraps `@atlaskit/pragmatic-drag-and-drop` |
| `@pyreon/sync` | Local-first CRDT sync — a synced signal IS a signal; Yjs engine, IndexedDB, cross-tab + WebSocket, presence/live-cursors, relay server w/ authz |
| `@pyreon/a11y` | A11y primitives — `announce()` (zero-setup live regions), `<VisuallyHidden>`, `createA11yId` |

- **@pyreon/store**:
  - `defineStore(id, setup)` — singleton by ID; auto-classifies setup returns (signals → state, functions → actions). `StoreApi<T>`: `.store`/`.state`/`patch()`/`subscribe()`/`onAction()`/`reset()`/`dispose()`.
  - **`setup()` runs in a store-OWNED `effectScope`** (Pinia model): setup/plugin `computed`s+`effect`s belong to the STORE — not adopted by the component whose mount first created it (pre-fix, that component's unmount silently froze the singleton's computeds for every other consumer) — and `dispose()` stops the scope (full teardown; no zombie effects on external signals). Plugins may return a cleanup fn → runs on `dispose()`.
  - Patch hot-path skips per-key event allocation + uses a precomputed key Set when no subscriber; the batch apply-closure + functional-form signal map are per-store cached (zero per-call closure allocs). Prefer per-field `store.x.set()` over bulk `patch()` for the fast path. Dev warns on unknown patch keys and on same-id redefinition from a different setup (the HMR silent-stale shape).
  - **Persistence is composition, not middleware**: return `useStorage()` signals from setup — a StorageSignal IS a signal, so classification/patch/reset/subscribe/dehydrate all flow through it (cross-tab sync free). Store families = derived ids (`` defineStore(`doc:${id}`) ``); lifecycle manual by design.
  - **Schema-driven overload** `defineStore(id, { schema, initial, setup? })` (schema = a `@pyreon/validation` adapter OR any raw Standard Schema — a `zod`/`valibot`/`arktype` object passed DIRECTLY) — validates every write AND is **strictly typed from the schema** end-to-end: `SchemaStoreApi<TRaw, TStore>` infers field types via `InferSchema<S>` (which reads `_infer` for a Pyreon adapter, else `~standard.types.output` for a raw Standard Schema — the `types?`-optional form; a required-`types` match silently collapsed every raw schema to the loose fallback), so `state`/`set(next)`/`patch(partial)`/`deepPatch(DeepPartial)`/`update(key, current→next)` are all schema-typed with zero annotations (`update`'s key is constrained to field names; its transformer receives/returns `TRaw[K]`).
  - Escape hatches unvalidated by design: the functional `patch(fn)` form + direct `store.field.set(v)`. Async validators throw at definition-time.
- **@pyreon/state-tree**:
  - `model({ state })` or `model({ schema, initial? })` — chainable `.views()/.actions()/.volatile()/.lifecycle()` then `.create()` or `.asHook(id)`.
  - Schema mode is validation-driven AND strictly typed from the schema (pass `s.object()`/zod/valibot/arktype directly; installs bare-name `set/patch/deepPatch/update/reset` helpers that validate before writing).
  - `destroy()`/`isAlive()`, `clone()`/`getType()`, `getSnapshot()`/`applySnapshot()` (schema mode re-validates), `onPatch()`/`applyPatch()` (replace-only), `onSnapshot()` (microtask-coalesced), `onAction()`/`addMiddleware()`, tree traversal (`getParent`/`getRoot`/`getPath`), `identifier()`/`reference(Type)`/`resolveIdentifier()`.
  - Nested models compose in PLAIN mode; schema mode is flat.
- **@pyreon/form**:
  - `field()` + `useForm({ fields, onSubmit })` infers `FormState`. `useField('name')` (context), `<Form of={form}>`, `<Submit>` (auto-disables), `useFieldArray()` (stable `.key`, render with `<For by={i=>i.key}>`), `useWatch`/`useFormState`/`trigger`/`getValues`/`dirtyFields`/`touchedFields`/`getFieldState`.
  - **Auto-wired field a11y**: `register(field)` returns id + reactive `aria-invalid`/`aria-describedby` (+ `{ type: 'checkbox' }` → `checked`, `{ type: 'number' }` → `valueAsNumber`, `{ type: 'file' }` → value-less bag whose onInput writes the `FileList`); `errorProps`/`labelProps` give agreeing ids — zero hand-threaded ids, 0 re-renders.
  - **Focus-first-error**: a failed `handleSubmit` moves focus to the first errored + `register()`-bound field (`focusOnError`, default on — opt out `false`); `form.focusFirstError()` exposed for custom flows (SSR-safe).
  - `validateOn` default `'blur'`; async validators version-tracked; server errors via `setFieldError`/`setErrors` (don't touch `touched`).
  - `reset(values?, {keepErrors?/keepTouched?/keepDirty?/keepSubmitCount?})` (reset TO new values — named become the new baseline, rest revert to original) + `resetField(field, {keepError?/keepTouched?})`.
  - **`schema` accepts a plain `SchemaValidateFn`, a `@pyreon/validation` typed adapter (`zodSchema(...)`), OR a RAW Standard Schema (zod/valibot/arktype/`s`) directly — no adapter, no `as never` cast** (`resolveSchemaValidator` routes via `@pyreon/validation`'s `isStandardSchema`/`standardSchemaToValidator`; the `~standard` contract lives in validation — form depends on it).
  - **Schema-error routing (no silent drop)**: a whole-form schema error keyed by a nested dot-path (`address.city`, as the adapters flatten it) routes to its top-level ancestor field (`address`); a key matching NO field (typo / path-less `""` whole-form error) marks the form INVALID + sets `submitError` + dev-warns — never silently dropped (`matchSchemaErrorForField`/`orphanSchemaErrorKeys`).
  - Keystroke path has NO per-field `effect()` (auto-validation driven inline from `setValue` reading `submitCount.peek()`); `values()`/`getValues()` epoch-cached.
  - **Dynamic fields**: `registerField(name, initial, validator?)` / `unregisterField(name)` add/remove fields at runtime (data-driven forms) — fully first-class (reach `values()`/`onSubmit`/validity); explicit escape hatch, still no *silent* auto-register.
  - Known gap: nested/deep typed field paths (`user.address.city`) — flat model in v1 (a nested error surfaces on the ANCESTOR field, not a per-leaf field).
- **@pyreon/i18n**: `createI18n({ locale, messages, loader?, fallbackLocale?, ... })`. `t(key, values?)` — `{{name}}` interpolation, inline format specifiers (`{{amount, currency}}`), plurals (`_one`/`_other`/`_zero`), `context` (gender), `defaultValue`, `$t(key)` nesting (depth 4). Intl formatters on the instance: `n`/`d`/`rt` (read `locale()` reactively, memoized). Two entries: `@pyreon/i18n` (full + JSX `Trans`/`I18nProvider`/`useI18n`) and `@pyreon/i18n/core` (framework-agnostic). `<I18nProvider value={i18n}>` (prop is `value`); `<Trans i18nKey="…">` auto-reads `t` from context. `Intl.PluralRules` memoized per locale.
- **@pyreon/query**: full TanStack adapter — `useQuery`/`useMutation`/`useInfiniteQuery`/`useQueries`/`useSuspenseQuery` etc.; persist (`/persist` subpath) + devtools (`/devtools` subpath). **Options as a FUNCTION** (`useQuery(() => ({queryKey: [id()], ...}))`) so `queryKey` can read signals + refetch reactively; `useMutation` options are a plain object. `defineQueries({...})` named parallel queries. Fine-grained per-field signals, lazily materialized (slot-bag with property getters). Re-exports query-core (pinned tree-wide via `overrides`).
- **@pyreon/permissions**: `createPermissions(initial?)` callable as `can(key, ctx?)`; `can.not/all/any/assert/set/patch/clear`. **Wildcards (most-specific-first)**: `'posts.*'` = exactly one segment, `'posts.**'` = any depth below `posts`, `'*'` = everything; an exact/`**` deny overrides a broader grant (CASL `cannot`-over-`can` in flat-key idiom). Predicates `(ctx) => boolean` replace the MongoDB-condition DSL. `<PermissionsProvider value={can}>`.
- **@pyreon/machine**: `createMachine({ initial, states })` — `machine()` reads, `machine.send(event, payload?)` returns settled state, `matches`/`can`/`nextEvents`/`isFinal`. Guards `{ target, guard }` (throw-safe → denied); `can()` predicts `send()` exactly. Eventless `always` transitions (fire synchronously, cascade, self-loop throws after 1000). Final states + `onDone`; lifecycle `onEnter`/`onExit`/`onTransition`. Out of scope vs XState (offloaded to signals/effects): context, invoked actors, hierarchical/parallel states, delayed `after`.
- **@pyreon/flow**:
  - `createFlow<TData>({ nodes, edges })` / `useFlow<TData>()` (auto-disposes). Node/edge CRUD, selection, viewport. Components `<Flow nodeTypes>`, `<Background>`, `<MiniMap>`, `<Controls>`, `<Handle>`, `<Panel>`.
  - Configurable edge markers (`MarkerType.Arrow`/`ArrowClosed`, per-edge `markerStart`/`markerEnd`). Render virtualization (`onlyRenderVisibleElements`, default off); object-snapping opt-out (`snapToObjects`, default on — O(N)/frame).
  - Custom node/edge renderers get reactive accessors; each node mounts EXACTLY ONCE; drag writes the `nodes()` array → O(N)/frame via `nodeMap`/`edgeMap` computeds (NOT O(N²)).
  - Overlay child order (compiler ref-hoist — see anti-patterns): `<Controls>`/`<MiniMap>` order no longer matters on current compilers; apps pinned to older compilers still need `<MiniMap>` BEFORE `<Controls>`.
  - The package's vitest-browser tests use a JSX transform that does NOT match the real compiler and MASK template bugs — real-compiler e2e is the only reliable gate.
  - `dev` gate uses bare `process.env.NODE_ENV` (reference `layout.ts:warnIgnoredOptions`). Peer dep `@pyreon/runtime-dom`.
- **@pyreon/code**:
  - `createEditor({ value, language, theme, ... })` — `value` is writable `Signal<string>`; `cursor`/`selection`/`lineCount` computed; `<CodeEditor>`/`<DiffEditor>`/`<TabbedEditor>` (user-owned lifecycle — call `editor.dispose()`). `bindEditorToSignal({ editor, signal, serialize, parse, onParseError? })` two-way.
  - CodeMirror 6 (~250KB vs Monaco ~2.5MB). 19 lazy language grammars. `createTabbedEditor` is exported.
  - `onError` config surfaces mount failures (a throwing extension / failed grammar import) instead of an unhandled rejection; dispose-during-async-mount is leak-safe (`mountToken` guard); `<DiffEditor>` unmount-during-load is leak-safe (`unmounted` guard). Peer dep `@pyreon/runtime-dom`.
- **@pyreon/rich-text**:
  - `createRichTextEditor({ content, ariaLabel, starterKit?, extensions?, onChange?, onError? })` — `json` is a writable `Signal<JSONContent>` (`.set()` loop-safe); `html`/`text`/`isEmpty`/`characterCount`/`wordCount`/`canUndo`/`canRedo` computed; `editable` writable read-only toggle; `isActive(name)` reactive toolbar primitive; `chain()` escape hatch + `undo`/`redo`/`focus`/`blur`.
  - `<RichText instance={editor}>` lazy-loads TipTap (a11y-labeled `role="textbox"`). `bindRichTextToSignal({ editor, signal, format })` two-way (json/html).
  - `onError` surfaces mount failures; dispose-during-async-mount is leak-safe (`mountToken` guard); re-mount preserves the current document.
  - Collaboration composes with `@pyreon/sync` (opt-in `@tiptap/extension-collaboration` + `y-prosemirror` peers — not in the base bundle). MIT throughout (avoid TipTap Pro). User-owned lifecycle.
- **@pyreon/validate**:
  - Pyreon's `s` validator runtime + DX helpers on Standard Schema. `withField`/`getMeta`/`resolveMetaField`/`parseReactive`/`watchValid`/`formatErrors` (`parseReactiveAsync` supersedes stale in-flight results — an awaited stale frame resolves to the LATEST run's verdict). `s` runtime: primitives + object/array composition + modifiers + 20+ checks + object algebra (`.pick/.omit/.partial/.required/.extend/.merge/.keyof/.catchall`). ASYNC members (`.refine`/`.transform`/registered `.serverCheck`) work inside EVERY composition (union/DU/intersection/map/set/record/tuple + the JIT — a sync `parse()` of an async tree reports the ONE canonical "use parseAsync" issue at the root). `s.discriminatedUnion` accepts literal/enum/nativeEnum discriminants (dev-guarded: non-registrable field or duplicate tag throws at construction). **`.catch` runs against a PRIVATE child ctx** — a catch window can never eat a SIBLING field's issues (fuzz-found shared-ctx bug, both backends). `toJsonSchema(schema)` (subpath `@pyreon/validate/json-schema`) emits draft 2020-12 (input-shape contract; unrepresentable kinds throw or `{ unrepresentable: 'any' }`; cyclic lazy throws — no $defs in v1).
  - **Tree-shaking**: DX helpers tree-shake clean; the chainable `s.` API does NOT (prototype methods) — use `pyreon({ optimizeValidators: true })` to rewrite module-level `const X = s.<chain>` to the lean `@pyreon/validate/mini` form at build time (function chaining in, tree-shakeable output, parity-locked; ~−41% measured). `pyreon({ compileValidators: true })` inlines a monomorphic verdict for `.is()` (1.6–3.0× faster, nanoseconds — only matters in hot `.is()` loops). Both flags cover statically-analyzable chains within the emit slice (primitives + common checks + object/array/optional); out-of-slice chains gracefully stay full-runtime.
  - Perf vs Zod/Valibot/ArkType (process-isolated bench, pooled CI95 + tie detection, author-judge disclosed): wins error path every shape (33–44× Zod, 20–53× ArkType, 1.4–3.6× Valibot); valid path WINS arrays outright (1.9–2.3× vs ArkType), 🤝 tied on scalar-email + number-range + deep-nested, trails only flat-object (~1.2× — ArkType aliases the input, Pyreon returns an immutable stripped clone; semantic choice) — ahead of Zod+Valibot everywhere. The 2026-07 pass: JIT static-path elision (ctx.path untouched on valid paths) + async-aware JIT fallback deferral + a table-driven email scanner (~1.6× the Zod-parity regex, equivalence-locked).
- **@pyreon/storage**: `useStorage(key, default, opts?)` + `useSessionStorage`/`useCookie`/`useIndexedDB`/`useMemoryStorage`; `createStorage(backend)`. All return `StorageSignal<T>` (extends `Signal<T>` + `.remove()`). `writeDebounceMs` (opt-in, local/session) coalesces the sync `setItem` (flushed on `pagehide`/`beforeunload` via ONE shared listener). **`version` + `migrate`** (all backends, cross-tab-aware): a versioned value is stored in a JSON envelope (`__pyreonStorageV`/`__pyreonStorageD`); a read at a higher `version` runs `migrate(oldValue, fromVersion)` (a pre-versioning value = `from 0`); the registry entry carries `options` so the storage-event handler migrates cross-tab too. **`onError` fires on WRITE failures** (quota/blocked `setItem`) as a notification (return ignored; signal already updated), not just deserialize. **`setCookieSource(source)`** accepts `string | (() => string) | null` — the accessor form is the lazy per-request-context seam (a bare string is one shared module slot; NOT auto-isolated across concurrent SSR requests). **Wrapper-signal contract** (built on `wrapSignal`): a callable wrapping a base signal MUST forward `_v` via getter — the compiler's `_bindText` fast path reads `source._v` directly; missing it binds `''`. Enforced by `pyreon/storage-signal-v-forwarding`. Competitor bench: `bun run --filter '@pyreon/storage' bench:storage` (vs jotai `atomWithStorage` / zustand `persist` over a shared in-memory engine — dominates jotai on every op; wins read + ties create vs zustand, ~1.4× behind zustand on the reactive-layer write, a component dwarfed by the real `localStorage` syscall).
- **@pyreon/rx**: 37 signal-aware transforms (collections/aggregation/operators/timing/search), each overloaded (`Signal<T[]>` → `Computed`, `T[]` → plain). `pipe(source, op1, op2, ...)` composes — one computed.
- **@pyreon/toast**: `toast(message)` + `.success/.error/.warning/.info/.loading`; `.update`/`.dismiss`/`.remove`/`.promise`; `<Toaster>` (Portal, CSS transitions, pause-on-hover/focus, type-aware live-region role — `role="alert"` for error/warning, `role="status"` for info/success + `aria-atomic`; the role implies aria-live so the container carries none). **Two-phase removal**: `dismiss(id?)` is SOFT (flips `state:'exiting'`, plays the CSS leave animation — fade + collapse in place with sibling reflow — then hard-removes after `LEAVE_DURATION`=200ms; `onDismiss` fires immediately); `remove(id?)` is HARD/instant (no animation) — the exact react-hot-toast `dismiss`/`remove` split. Auto-dismiss + manual dismiss both go through the soft path. The store owns the leave timing (works headless); the render path is UNCHANGED (the `class` binding already reacts to `state==='exiting'`). **Reactive rows**: `<For by={id}>` keys on IDs; each row reads live fields via a `_toastMap` computed (same as flow's `nodeMap`). Portal'd buttons need scoped delegation (`setupDelegation(host)` on a per-instance host appended to body) — delegated events don't bubble through the mount root from a portal. **Deliberate non-goals** (documented scope, not gaps): swipe-to-dismiss, sonner-style collapsed-stacking, per-toast position.
- **@pyreon/sync**:
  - `syncedSignal({ doc, key, initial })` (scalar CRDT, create-if-missing), `syncedStore(initial, { doc })`.
  - **The update loop**: `.set(v)` writes ONLY the CRDT; the map `observe` is the ONE base-signal writer (local + remote); the network loop is prevented in the TRANSPORT (re-broadcasts `LOCAL_ORIGIN`, applies inbound as `REMOTE_ORIGIN`), NEVER by gating the observer. Engine seam (`CrdtAdapter`/`Doc`/`Map`) + `FakeCrdtAdapter` test double.
  - `@pyreon/sync/yjs`: `createYjsDoc`, `syncedText` (Y.Text char-merge), `syncedList` (Y.Array, keyed `<For>`), `syncedAwareness` (ephemeral presence/cursors — create BEFORE connecting; awareness lifecycle is DOC-owned, a view's `dispose()` detaches only its own listener), `persistViaIndexedDB`, `connectViaBroadcastChannel`, `connectViaWebSocket`.
  - `@pyreon/sync/server`: `createSyncServer({ authorize? })` (per-room authoritative Y.Doc; default allows everything — production MUST supply `authorize`).
  - **Honest limits**: CRDTs prevent lost UPDATES not semantic conflicts; a synced app ships ~60KB+ gz.

### @pyreon/zero — Key Features

- Client-safe main entry (`@pyreon/zero` = client-safe code; server-only at `@pyreon/zero/server` with clear stubs on misimport).
- Deployment adapters: Vercel/Cloudflare Pages/Netlify + Node/Bun/static. CSP (`cspMiddleware` + `useNonce`), env validation (`validateEnv`/`publicEnv`), `loggerMiddleware`, `aiPlugin` (llms.txt/JSON-LD), `useRequestLocals`.
- **Env vars — `@pyreon/zero/env`** (`str`/`num`/`bool`/`url`/`oneOf`/`schema`, type-inferred from defaults):
  - `validateEnv` is SERVER-only (reads live `process.env`, stubbed on the main entry).
  - **`publicEnv()` is ISOMORPHIC** — works in browser code: the vite-plugin's `config` hook `loadEnv(mode, root, 'ZERO_PUBLIC_')`s at build and inlines the (prefix-stripped) snapshot as a `__ZERO_PUBLIC_ENV__` `define` into BOTH client + SSR bundles (mirrors `__ZERO_BASE__`), so server-render and client-hydrate read the SAME value (no hydration mismatch). `publicEnv()` reads that define first, falling back to a `process.env` scan (server) / `{}` (client) when no zero build inlined it.
  - **Security boundary: ONLY `ZERO_PUBLIC_*` is inlined** — a secret without the prefix structurally cannot reach the client bundle (`loadPublicEnvVars` in `public-env.ts` strips + filters; secret-exclusion is the load-bearing property).
  - **Validation is zero-dependency**: `validateEnv`/`publicEnv` accept any **Standard Schema** (`~standard`) directly — zod / valibot / arktype / `@pyreon/validate`'s `s` — duck-typed (no hard dep on any lib); the raw env STRING is handed to the schema, so use a coercing schema (`z.coerce.number()`, `s.stringbool()`); async schemas rejected.
  - **Build-time inlining is irreversible per build** (change a public var → rebuild, not redeploy).
  - **`zero({ env: { API_URL: url() } })` build-time gate** (`ZeroConfig.env`): `assertPublicEnv` (public-env.ts) validates the loaded snapshot at the `config` hook — a missing/invalid declared var FAILS the build (`command==='build'`), WARNS in dev (`serve`); the safety net for "works in dev, undefined in prod".
  - Reference: `packages/zero/zero/src/{env.ts,public-env.ts,vite-plugin.ts}`; locked by `env.test.ts` + `public-env-plugin.test.ts` (security boundary + build-gate, bisect-verified) + `e2e/public-env.spec.ts` (real Chromium — value reaches the client, non-public var absent, bisect-verified via lib rebuild). Follow-ups: an `env-audit` doctor check + `no-private-env-in-client` lint rule (in progress), typed `virtual:zero/env` codegen.
- **Dev server honors Vite `server.proxy`** (zero's `configureServer` catch-alls land BEFORE Vite's internal proxy — they `next()` proxy-context URLs via `matchesProxyContext`, mirroring Vite's `doesProxyContextMatchUrl` on the full `req.url`). Precedence: fs api routes > `server.proxy` > SSR/404; unmatched `/api/*` always falls through zero's SSR/404 (page routes under `/api/` — `.tsx` only — still SSR). Boot log names honored contexts.
- **Per-route render modes / hybrid**: `export const renderMode = 'ssg'|'spa'|'isr'|'ssr'` on a route/layout (cascades) overrides the app `mode`. ONE resolver (`route-modes.ts:resolveRenderModeForPath`) drives build + runtime. Inside `mode:'ssr'|'isr'`: ssg routes prerender at build + serve static-first (manifest `_pyreon-ssg-paths.json`); spa routes get the CSR shell; isr routes route through a SWR cache. Inside `mode:'ssg'`: ssr/isr declarations are a BUILD ERROR.
- Image optimization — bi-modal `<Image src>` (`?optimize` descriptor OR runtime string URL with required `width`+`height`), `<OptimizedImage source>`, `<NoOptimize>`/`useNoOptimize()`, `createImageRegistry`, `createImage(Base)`. Placeholder strategies blur / `'color'` (dominant-color, deprecated alias `'dominant-color'`); `quality` per-codec. `?optimize`/`?component`/`?raw` ambients ship via `@pyreon/zero/image-types`.
- Fonts — `usePreloadFont`, `?font` import (`fontImportPlugin`), `fontPlugin` (`zero({ font })` auto-wires). `subsets` scopes self-hosted Google Font subsets (filters css2 output by per-subset comment labels, ReDoS-safe). `fallbackAdjust` (default ON) auto-computes size-adjusted fallback fonts (`next/font` technique via `@capsizecss/*`, build-time-only deps) to eliminate font-swap CLS — emits a `--pyreon-font-<slug>` CSS var (the single integration point for plain CSS via `applyTo` + the ui-system theme).
- Resource hints: `usePreconnect`/`useDnsPrefetch`/`usePreload`. Icons: `<Icon>`/`createIcon` (renders a full loaded SVG; `as` `?component` recommended), `iconsPlugin`/`createNamedIcon` (folder → strictly-typed set, inline mode emits per-icon `/*#__PURE__*/`-pure components for tree-shaking + an `<Icon name>` registry escape hatch). Favicons: `faviconPlugin` (per-locale, sharp-backed — missing-sharp is a hard build error), reactive light/dark switching (any browser-auto-preferred asset like an SVG favicon MUST carry the `data-favicon-theme` opt-in attribute). OG images: `ogImagePlugin`.
- SSG per-route `<link rel=modulepreload>` (islands-safe — STATIC `imports` only, never `dynamicImports`). Build-time perf advisor `zero({ perfAdvisor: true })` (advisory, `route-js-budget` + `cls-footgun`). SSG output format `ssg.format: 'file'|'directory'|'both'` (default `'directory'`; `'both'` avoids the slash-less-URL 301 on hosts that don't auto-rewrite). Adapter immutable-cache scoped to `<base><assetsDir>` (node/bun gate on path not extension).
- Typed routes — `zero({ typedRoutes: true })` (opt-in) scans PAGE routes (layouts/`_error`/`_loading`/`_404` skipped) at `buildStart` + on route add/remove (HMR) and writes `src/pyreon-routes.d.ts` (only on content change) augmenting `RegisteredRoutes`, so `<Link href>` autocompletes real paths + rejects typos. `RouteHref = RoutePath | (string & {})` (autocompletes known routes, still accepts any string → never breaks dynamic paths); `RouteParams<P>`; `generateRouteTypes`/`extractRouteParams` are the pure codegen, `collectRoutePaths`/`writeRouteTypes` the wiring (`route-types.ts` + `route-types-gen.ts`). Gitignore the generated file.
- `@pyreon/zero-content`: compile-time `.md` → Pyreon JSX, typed collections (zod), MDX components from `src/mdx/`.

## Key Architectural Patterns

### Workspace resolution (no build for dev)

Each `package.json` has `"bun": "./src/index.ts"`; root tsconfig has `customConditions: ["bun"]`. **Vite's config bundler hardcodes the `node` condition → `lib/`**, so a `postinstall` bootstrap (`scripts/bootstrap.ts`) builds all packages when any `lib/` is missing OR stale (mtime drift).

- You do NOT manually `bun run build` after clone/worktree/pull — `bun install` handles it.
- **If an example build fails with confusing errors (`MISSING_EXPORT`, missing files) after editing package source, run `bun scripts/bootstrap.ts`** — Vite is reading a stale `lib/`.
- Bootstrap fails loudly on partial state (content sanity: `lib/index.js` < 50 bytes = stale; single sequential retry of still-dirty packages; `PYREON_BOOTSTRAP_SOFT=1` swallows postinstall failure; `PYREON_BOOTSTRAP_SKIP=1` early-exits — CI's install step uses it).
- **Dev-server bisect trap**: a `@pyreon/vite-plugin` / `@pyreon/zero` source edit is INVISIBLE to a running dev server until `lib/` is rebuilt (Vite reads `lib/` via the node condition; user runtime code is read from `src/` via the bun condition) — see `.claude/rules/testing.md` "Dev-server bisect".

### Signal implementation

`signal<T>()` returns a callable with `.set()`/`.update()`/`.trigger()`.

- **`.trigger()`** is a force-notify escape hatch — signals gate on `Object.is`, so `set(sameReference)` is a no-op; when you deliberately hold a MUTABLE value (a `Map`, a class instance, an external store like a TanStack table) and mutate it in place, `.trigger()` re-runs subscribers without a value change (Vue's `triggerRef` semantic). Zero cost on the default path — it's a `SignalProto` method (no per-signal field/memory) and DUPLICATES `_set`'s batch-aware notify block rather than refactoring it, so the hot write path stays byte-identical; `wrapSignal` forwards it to the base. Prefer immutable `set(newObject)` when practical; reach for `.trigger()` only for owned-mutable-value adapters (the exact pattern `@pyreon/table`'s `useTable` version-counter works around).
- **Subscribers**: direct subscribers use a single-subscriber inline slot (`_d1`) promoting to a `Set` on the 2nd subscriber (the dominant `<For>`-row case allocates no Set); effect subscribers use a lazy `Set`; batch uses pointer swap.
- **Two-tier batch flush** (`batch.ts`) drains computed recomputes (tier 1, with within-pass dedup) before effects (tier 2, multi-pass for re-entrant writes, `MAX_PASSES=32`) — `computed.ts:_markRecompute` routes computeds to tier 1 so derived values settle before any effect runs. Re-entrant signal writes inside an effect re-fire correctly.
- **Per-primitive retained heap**: signal ~152 B, +effect ~930 B, +computed ~913 B (a computed ≈ 6× a signal — prefer plain signals), effectScope ~64 B (lazy-null arrays). Measure via `bun run measure-memory` (`NODE_ENV=production` mandatory — dev devtools dominates).

**Reactive Coverage** (`@pyreon/reactivity/coverage` subpath, dev/test only): "which reactive edges never fired?" — code coverage says a *line* ran; this says a *reactive update fired*. `startReactiveCoverage()` / `takeReactiveCoverage()` / `stopReactiveCoverage()` (reset baseline + strong-ref-pin session nodes so unmount doesn't GC-prune the denominator + activate reads); `computeReactiveCoverage(getReactiveGraph().nodes)` is the pure core, `formatReactiveCoverage(report)` the text renderer. Kind-aware: signals covered when they changed (`fires≥1`), effects/computeds only when they RE-ran past their mount run (`fires≥2`) — the `ran-once` reason flags a mounted effect/computed whose reactive re-run was never triggered (untested reactive path a line-coverage tool reports as 100%). Built on the always-on `__DEV__` reactive-devtools registry (LPIH foundation). Demo: `bun scripts/demo-reactive-coverage.ts`. Reference: `packages/core/reactivity/src/coverage.ts`.

**`describeReactiveGraph()`** (+ `formatGraphDescription`, from `@pyreon/reactivity`, dev/test only): auto-generated BEHAVIORAL (not API) description of the live reactive graph — per-node English ("changing `qty` re-derives 1 value and runs 1 effect"; "`total` recomputes when qty, price change") + health insights (`orphan-signal` = nothing depends on it, `high-fanout` = a change re-runs many effects, `deep-chain`). Pure over `getReactiveGraph()`. Complements `getUpdateCause` (one update) by describing the whole graph. Reference: `packages/core/reactivity/src/reactive-describe.ts`.

**"Why did this update?"** (`getUpdateCause(nodeId)` / `formatUpdateCause(cause)` from `@pyreon/reactivity`, also on `window.__PYREON_DEVTOOLS__.reactive`): source-anchored causal chain for a node's most recent fire — the thing React DevTools' whole-component "why did this render?" can't do. Purely READ-time over `getReactiveGraph()` + `getReactiveFires()` (zero hot-path cost). **The dependency GRAPH is the causal structure, NOT the fire timeline** — a lazy computed recomputes DURING its subscriber's read, so an effect's fire precedes the fire of the dep that caused it (temporal order ≠ causal order); reconstruction walks the graph from the target through deps that fired in the same synchronous cascade (clustered within ~one animation frame of the target's last fire). Returns `{ target, chain (root-first), rootReached }`, `CauseLink = { id, kind, name, loc, ts }`. Exact for a synchronous update; best-effort across interleaved interactions; `rootReached:false` = older fires aged out of the ring buffer. Dev/test only. Reference: `packages/core/reactivity/src/reactive-devtools.ts:getUpdateCause`.

### JSX & VNode

JSX via `jsxImportSource: "@pyreon/core"` (`jsx: "preserve"`); automatic runtime `@pyreon/core/jsx-runtime`. `h(type, props, ...children)`. Components are `(props: P) => VNodeChild` and merge children (`props.children = vnode.children.length === 1 ? vnode.children[0] : vnode.children`). `VNodeChild = accessor-first` so `{() => cond && <X/>}` typechecks; `boolean` is a valid atom so `&&` works without a ternary. `<For each={items} by={r => r.id}>` (prop is `by`, not `key` — JSX reserves `key`). `class` accepts string/array/object/nested (via `cx()`); `style` accepts string or object (compiled style binding emits `_setStyle(el, value)` = the runtime `applyStyleProp`, so object styles get number→px + kebab + stale-key removal identically in both backends). JSX index signature narrowed to `data-${string}`/`aria-${string}`. `AriaRole` exported (open union — typos warn via autocomplete, any string still assigns). New bubbling focus events `onFocusIn`/`onFocusOut`.

**Props utilities**: `splitProps`/`mergeProps`/`removeUndefinedProps` (preserve reactivity via descriptor-copy, use `Reflect.ownKeys` for symbol brands), `untrack`, `createUniqueId`. **Component JSX spread `<Comp {...rest}>` preserves reactivity** — compiler emits `<Comp {..._wrapSpread(rest)}>`, re-branding getter props as `_rp` thunks; `makeReactiveProps` converts back to getters consumer-side. **Manual prop-merging helpers must copy DESCRIPTORS, not values** (`result[key] = source[key]` fires getters at copy time, collapsing reactive props to static) — use the core helpers, or `Object.getOwnPropertyDescriptors` + `defineProperty` with `configurable: true`.

### Context

Two types: `createContext<T>(default)` (`useContext()` returns `T`) and `createReactiveContext<T>(default)` (returns `() => T` — call to read; use for mode/locale/theme). `provide(ctx, value)` provides for the current component's subtree; released on unmount.

- **Resolution is owner-based on the client**: each mounted component's `EffectScope` is a context owner — `provide()` writes onto `scope._contexts`, `useContext()` walks `scope._parent`, context dies with the scope.
- Deferred boundaries (`<Show>`/`<For>`) capture the owner (`getContextOwner()`) and restore it (`runWithContextOwner`) when mounting children. This REPLACED a global mutable stack.
- SSR keeps a request-scoped stack (`pushContext`/`popContext`); the `*-compat` layers run their own stack.

### Compiler

**Dual-backend**: Rust native (napi-rs, 3.7-8.9× faster) with automatic JS fallback (per-call try/catch so a Rust panic doesn't crash the dev server).

- **Tests**: 527+ incl. cross-backend equivalence (`native-equivalence.test.ts` is the byte-identical oracle) + a seeded differential-fuzz gate (`fuzz-equivalence.test.ts`, 300 grammar-generated seeds × client/SSR — locks the combinatoric space the hand corpus misses).
- **Template emission**: `shouldWrap` only wraps on a non-pure call / props access / signal var ref. Static JSX hoisted to module scope (`const _$h0`). ≥1 DOM element → `_tpl()` + per-text-node binding. Reactive text writes `TextNode.data`; sole-dynamic-text children bake a `' '` placeholder in the template HTML (no per-instance `createTextNode`).
- **Universal VNode[] child mounting**: a bare `{value}` child is POLYMORPHIC — a `VNode`/`VNode[]` value MOUNTS as real elements regardless of source (prop, param, const-from-call, literal, map), a primitive text-sets. Single-signal reactive text (`{sig()}` — and `{() => sig()}`, which `tryDirectSignalRef` unwraps to the same emit) stays on the `_bindText`/`_bindDirect` fast path, and `_bindText` is text-FIRST, not text-only: a signal whose VALUE is a VNode/NativeItem/VNode[] permanently upgrades the binding to a subtree mount at the text node's position (swap core shared with `bindPolymorphicText`; string updates before any VNode keep the raw `.data` writes — the VNode check runs only on the value-actually-changed branch); GENERAL reactive text (`{props.x}`, `{a()+b()}`) lowers to `bindPolymorphicText(() => expr, textNode, parent)`; STATIC sole text lowers to `_setChild(el, expr)`; STATIC mixed/placeholder text lowers to `_setChildAt(parent, placeholder, expr)` — each detects a VNode/VNode[] at runtime and mounts, else text-sets.
- **Signal auto-call**: tracked `const x = signal()`/`computed()` → bare JSX refs auto-called (`{x}` → `{() => x()}`); scope-aware (shadowed/params/destructured not called); cross-module via the Vite plugin's signal export registry + `knownSignals` option; both backends byte-identical.
- **Reactive props inlining**: `const`s derived from `props.*`/`splitProps` are inlined at JSX use sites (transitive, AST-based, cycle-safe; `let`/`var` not tracked).
- **`<For>`/render-callback item params are runtime values, NOT reactive props** — a bare property read (`row.id`) bakes to a static `_setChild(el, row.id)` (a one-time value set — NOT a per-row `_bind` renderEffect; the polymorphic helper text-sets the primitive, no VNode-mount for a scalar), signal CALLS like `row.label()` keep their reactive `_bindText` path.
- Component-child stable-reference carve-out emits bare (not `() =>`-wrapped) for stable refs not referencing a signal. Pure-static call detection (40+ funcs). Element-conditional/`.map` children keep the `_tpl` fast path via `_mountSlot` + `<!>` placeholder.
- **Two-phase template binds (ref-hoist)**: every pristine-clone node capture (`__eN` walks, `__tN` text captures, `__pN` placeholder consts) emits BEFORE any `_mountSlot`/`replaceChild` mutation, so a slot before static siblings can't corrupt their ref walks (see anti-patterns).
- **Template classification is TS-layer-transparent**: `as`/`satisfies`/`!`/parens unwrap at BOTH the child seam and the attr seam, so `{(() => x()) as never}` / `title={(expr) as string}` compile byte-identically to the bare forms.
- **In-file JSX-returning helper calls MOUNT**: `const cell = (v) => <b>{v}</b>` + `{cell(x)}` (or `{() => cell(x)}`) routes through `_mountSlot(() => (cell(x)))` — scope-aware, reactive args re-render the slot, client matches SSR; CROSS-FILE callees are out of scope (no type info) and keep the reactive-text path.

**Compile-time rocketstyle collapse — `pyreon({ collapse: true })`** (opt-in, BUILD-ONLY):

- a literal-prop rocketstyle call site collapses a 5-layer wrapper mount into ONE `_rsCollapse` cloneNode (measured 44× wall-clock, `styler.resolve` 22→0). A nested Vite-SSR resolver renders the REAL component twice (light/dark), captures the byte-identical class + rule text, and emits `_rsCollapse(html, lightClass, darkClass, isDark)` + an idempotent `injectRules`.
- Variants: full / `_rsCollapseH` (on*-handler) / `_rsCollapseDyn`+`_rsCollapseDynH` (ternary-of-2-literals dynamic prop, stride-2 class array) / element-child (reuses `_rsCollapse`, bakes a recursively-static subtree). Both backends emit. SSR→hydrate works via the `_tpl` `__isNative` swap (no remount, reactivity intact).
- **Build-only is correct, not a limitation** — dev keeps the normal (HMR-reactive) mount + announces the no-op once (gated `if (collapseEnabled && isBuild && !isSsr)`).
- **Coverage ceiling 86.0%** (measured via `collapse-bail-census`; the remainder is structurally impossible — component children / non-enumerable dynamic props / spread / boolean-attr — no further collapse warranted).

**Reactivity Lens** (additive — `reactivityLens: true` → byte-identical code + a `reactivityLens` span sidecar in BOTH backends):

- pipes the compiler's per-expression reactive/static ground truth back to the editor. `analyzeReactivity(code, file, { knownSignals? })` merges structural facts with the `detectPyreonPatterns` footgun detectors.
- Surfaced as LSP inlay hints via `@pyreon/lint --lsp` (`live`/`static`/`live·prop`/`live·attr`/`hoisted`) — the "see static-vs-live where you type" moat; the one to watch is `static` where you expected `live` (a captured-once value = the classic "UI doesn't update" bug, caught at author time).
- Docs: `docs/src/content/docs/reactivity-lens.md` (distinct from LPIH: the Lens is a COMPILE-TIME structural verdict; LPIH is the RUNTIME fire-count companion).
- **Live Program Inlay Hints (LPIH)**: signal/effect fire-counts + subscriber counts as ghost text at source lines (zero production cost — tree-shakes; ~2.2µs/signal in dev when active, deferred two-phase: cheap `new Error()` at capture, lazy `.stack` parse at devtools-read time).

### SSR

`renderToString(vnode)` + `renderToStream(vnode)` (Suspense streaming, 30s timeout).

- `renderToString` is a **maybe-sync renderer** — fully-sync subtrees concatenate with zero promise hops; only a real `async function Component()` promotes its subtree (measured +41–78% per scenario).
- Always `mergeChildrenIntoProps(vnode)` before `runWithHooks`; `runWithRequestContext(fn)` isolates context + store per request via ALS, and `renderToString`/`renderToStream` INHERIT an active request context (so request-level `provide()` frames are visible).
- `renderPage()` (`@pyreon/server`) is the ONE string-mode page pipeline (preload → render-with-head → CSS-in-JS collect → loader-data inline → 404 chain → SSG modulepreload), consumed by `createHandler` + SSG prerender + zero dev SSR.
- `For` SSR emits per-item key markers `<!--k:KEY-->` (URL-encoded, `-`→`%2D` so user keys can't form `-->`).
- **Streaming SSR + styler**: `renderToStream` calls `globalThis.__PYREON_STYLER_FLUSH__()` (delta-flush) after the shell + inside every Suspense boundary so boundary content arrives styled (no FOUC).
- **The SSR handler must pre-resolve lazy route components BEFORE rendering** (`router.preload(path, req)`, not loaders-only `prefetchLoaderData`) — `renderToString` is synchronous, so an unresolved `lazy()` route renders BLANK inside the layout.
- Boolean `aria-*` attributes render as the STRING `"true"`/`"false"` (NOT presence-only `""`) in both renderers.
- URL-attribute injection guard (`UNSAFE_URL_RE`, single-sourced in `@pyreon/core/url-guard.ts`, shared client + SSR): drops `javascript:`/`data:` URLs except `data:image/*` on image-context elements.

### Islands

`island(loader, { name, hydrate, prefetch? })` → `<pyreon-island>` element.

- **Import `island` from `@pyreon/server/client`, NOT the main `@pyreon/server` barrel** in any client/route code (the barrel pulls `node:*` + `registerSingleton` → duplicate-instance throw + dual-`@pyreon/core` context split).
- **In `@pyreon/zero`, `island()` self-hydrates** (client branch renders ONLY the marker, then `onMount` loads the chunk + mounts per `data-hydrate`, re-establishing the captured context owner via `runWithContextOwner`) — zero's route is a reactive child of RouterView so the SSR DOM is re-mounted, not hydrated in place.
- Strategies: load / idle / visible / interaction (replays click + form-submit post-hydration) / media / never (NO registry entry — defeats zero-JS). `prefetch: 'idle'|'visible'` warms the chunk before the trigger. Auto-registry (`pyreon({ islands: true })`, default-on) → `hydrateIslandsAuto(registry)`.
- **Auto-naming**: `name` is optional for const-bound declarations — the plugin derives `X$<fnv1a6(relPath)>` from `const X = island(…)` (collision-free by construction; explicit name wins; the SAME derivation runs in the transform, the prescan, AND the project scanner — single-sourced in `@pyreon/compiler` `island-naming.ts` (identity-locked) so marker + registry + reported context names can never disagree; runtime throws with guidance when no name reaches it, e.g. plugin-less builds or bindingless calls).
- **Dev doctor-lite**: `vite dev` runs the islands audit once on boot (deferred 1s) and prints findings as warnings. Project audit: `pyreon doctor --check-islands` (duplicate-name / never-with-registry-entry / registry-mismatch / nested-island / dead-island).

### Compat-mode native marker — `nativeCompat(Component)`

The `*-compat` jsx runtimes wrap every user component in `wrapCompatComponent` (to relocate the render frame for React/Preact/Vue/Solid-style components). That breaks Pyreon framework components using `provide()`/`onMount()`/`effect()` at body scope (their setup lands in the wrapper's accessor, not Pyreon's setup frame). `nativeCompat(Component)` (a `Symbol.for('pyreon:native-compat')` marker) routes a component through `h(type, props)` directly. 24 framework components ship marked (RouterView/PyreonUI/FormProvider/…). **Mark your own Pyreon-flavored helper components** (using `provide`/`onMount`) when used in a compat-mode app. Invisible in unit tests (sync mount preserves provide context even wrapped); the cpa-app-compat e2e is the regression catcher.

### Code splitting, HMR, devtools

`lazy(loader)` (Suspense-integrated), `Dynamic({ component, ...props })`.

- **Signal-preserving HMR**: top-level `signal()` → `__hmr_signal(...)`, values saved to `globalThis.__pyreon_hmr_registry__` on dispose, restored on reload.
- **Component-level fast-refresh** (zero/router): `injectHmr` emits `accept((m) => __pyreon_hmr_swap__(id, m) || invalidate())` — NEVER a bare `accept()` (which suppresses the reload fallback → silently-stale UI). `@pyreon/router._hmrSwap` walks the active matched chain for a lazy record whose `_hmrId` matches + re-renders that subtree in place.
- **Auto signal naming** (dev): `signal(0)` → `signal(0, { name })`.
- **Devtools** (`@pyreon/devtools` Chrome extension, private): `installDevTools()` attaches `window.__PYREON_DEVTOOLS__`; framework registers components POST-ORDER so `childIds` is empty — reconstruct the tree from `parentId`. Reactive devtools bridge (`reactive-devtools.ts` → `.reactive`): leak-free graph/fires introspection, always-on in `__DEV__` (zero prod cost via the `process.env.NODE_ENV` gate), deferred `.stack` parse (see Signal impl).
- **Zero-install reactive dev overlay** (`.reactive.showOverlay()`/`hideOverlay()`, toggle `Ctrl+Shift+R` or `$p.reactivity()`): a floating in-app panel (no Chrome extension, no vite-plugin injection — it rides the auto-installed `installDevTools()` and tree-shakes in prod), THREE tabs:
  - **Health** = `describeReactiveGraph`'s summary header + insights (`orphan-signal`/`high-fanout`/`deep-chain`).
  - **Activity** = recent reactive fires (`getReactiveFires`) + a **"why did X update?"** causal chain for the latest fire (`getUpdateCause`/`formatUpdateCause`) — the inverse of React DevTools' "why did this render?", reconstructing the exact signal→computed→effect chain.
  - **Inspect** = a **DOM→signal picker** (🎯 Pick / `$p.pick()`): click any element → the signals whose text it displays + each one's cause. The correlation is EXACT (not heuristic) — `_bindText`'s fast path tags `textNode → _rdNodeId(source)` in a dev-only `WeakMap` where both node + registered source are in scope; `nodesForElement(el)` (exported from `@pyreon/runtime-dom` + on the bridge) TreeWalks descendant tagged text nodes. Scope: text bindings only (attribute/class/multi-signal not correlated — owner element isn't in scope at bind time); `[]` in prod.
  - Reading graph/fires auto-activates tracking; the overlay reopens on Health.
- **`hydrateRoot` calls `installDevTools()` too** (dev-gated) — without it the whole overlay silently doesn't exist in SSR/hydrated apps (most real apps). Reference: `packages/core/runtime-dom/src/{devtools.ts,binding-registry.ts,template.ts:_bindText,hydrate.ts}`; locked by `binding-registry.test.ts` + `reactive-overlay.test.ts` (happy-dom) + `e2e/reactive-overlay.spec.ts` (real Chromium — picker correlates a compiled `{count()}` to `count`, bisect-verified incl. the hydrate fix).

**Dev throw-time fix printer** (`pyreon({ devErrorPrinter })`, default-on in dev): the vite-plugin injects `virtual:pyreon/dev-error-printer` (a `<script type=module src=…>` in `<head>`, DEV-ONLY via `transformIndexHtml`) that wires `@pyreon/core`'s `registerErrorHandler` → the browser-safe `@pyreon/compiler/diagnose` `diagnoseError` — so a component/effect error whose message matches a known foot-gun prints its cause + fix + fix-code to the console at throw time. **Decoupled like `__pyreon_count__`/HMR**: the RUNTIME never imports the compiler; only the injected dev bootstrap does (the diagnose catalog is a 0-`typescript` browser-safe module). Prod never injects the script → zero cost. **Two load-bearing injection gotchas** (both caught by the e2e — a dev-injection feature MUST have a browser e2e, don't defer it): **(1)** a `transformIndexHtml`-injected *inline* `<script type=module>import 'virtual:…'` is NOT import-analysed by Vite → the bare `virtual:` specifier reaches the browser and CORS/`ERR_FAILED`s (unsupported scheme), breaking every dev app; the script MUST use `src="/@id/<id-with-\0-as-__x00__>"` so the browser fetches the URL Vite serves with imports resolved (LPIH's inline script only works because it's self-contained — no ES imports). **(2)** the virtual module imports `@pyreon/compiler/diagnose`, but most apps do NOT declare `@pyreon/compiler` (a build-tool dep) → Vite 500s the module ("Failed to resolve @pyreon/compiler/diagnose") in those apps; the plugin's `resolveId` resolves it from the PLUGIN's own location (`this.resolve(id, fileURLToPath(import.meta.url), { skipSelf: true })`, scoped to `importer === DEV_ERROR_PRINTER_ID`) — `diagnoseError` is pure so instance identity is irrelevant, but `@pyreon/core` stays a BARE import (app-resolved + deduped → same instance the runtime uses). Locked by `e2e/dev-error-printer.spec.ts`, which runs against **fundamentals-playground** (5176) precisely BECAUSE it lacks the compiler dep (an app WITH it resolves natively and hides gotcha 2); asserts no scheme/CORS/500 on load + the fix prints on a fired known-pattern error; bisect-verified via the dev-server recipe (inline form → CORS fail). Reference: `packages/tools/vite-plugin/src/dev-error-printer.ts` + `index.ts:resolveId`.

### Mount pipeline + dev-mode

Optimized for zero unnecessary allocations: devtools gated on `__DEV__` (tree-shaken); lazy `LifecycleHooks`/`EffectScope` arrays (start `null`); `makeReactiveProps` scan-first (static-only components allocate nothing); lazy `mountCleanups`.

- **Dev-mode warnings** (`__DEV__`): null-container check, component-output validation, duplicate `<For>` keys, text-binding coercion (`_bindText` warns ONCE per node when the RESULT value is a raw function — the `as never`-cast shape — or when a VNode/NativeItem/array-of-VNodes lands on a DETACHED text node with nowhere to mount; the attached VNode case no longer warns — it UPGRADES to a subtree mount; compiler-emitted raw `__t0.data = expr` / `_bindDirect` updater assignments are NOT hookable at runtime), and a setup-throw diagnosis when `props.X()` throws `X is not a function` and `X` is a getter-backed (compiler-auto-unwrapped) reactive prop. (There is NO raw-signal-as-child warning.)
- **Mount-loop closure hazard**: any mount loop running inside an effect that takes `parent` as a setup arg must read `marker.parentNode ?? parent` at each re-run (`mountFor`'s frag-then-move makes a captured `parent` stale — the For-of-Show / For-of-keyed-array leak class, fixed in `mountReactive` + `mountKeyedList`).
- **Reactive-render entry points untrack child mounts** (`mountFor`/`mountKeyedList`/`KeepAlive`/`TransitionGroup` wrap child work in `runUntracked` — else a child's setup signal read leaks to the outer effect, disposing all inner effects on the next flip).

### Runtime-DOM specifics

SVG/MathML (67 tags) created via `createElementNS` + ALWAYS `setAttribute` (many SVG props are read-only getters). Custom elements (hyphen tag) set props as properties EXCEPT `data-*`/`aria-*` (always `setAttribute`). Transition 5s timeout fallback; duplicate-key production warning. Subpath exports `@pyreon/runtime-dom/transition` + `/keep-alive` (main entry re-exports all; `mount`-only import ~7.4 KB gz, kitchen-sink ~9.8 KB). For 10k-row lists virtualize via `@pyreon/virtual` (a 10k `<For>` = ~10k signals ~1.5 MB).

### Dev-mode perf counters (`@pyreon/perf-harness`)

Framework packages emit named counters via `globalThis.__pyreon_count__?.('name')` — NO import of `@pyreon/perf-harness` (zero coupling, zero cost until a consumer installs the sink). Browser packages gate on `import.meta.env.DEV`; server packages on `process.env.NODE_ENV !== 'production'`. 66 counters across styler/unistyle/rocketstyle/runtime/runtime-server/reactivity/router/store/rx/query/island/i18n/ssg. Names live ONCE in `COUNTERS.md` (drift-tested both directions). Tree-shake-tested per layer. Consumer: `perfHarness.snapshot()/reset()/record()/diff()/overlay()`. Automation: `examples/perf-dashboard` + `bun run perf:record/perf:diff` + `.github/workflows/perf.yml` (advisory).

### exactOptionalPropertyTypes

Enabled — optional properties need explicit `| undefined` when assigned from functions that may return undefined.

### Manifest-driven docs pipeline

One source per package — `packages/<cat>/<pkg>/src/manifest.ts` — feeds every generated surface.

- `bun run gen-docs` regenerates `llms.txt`, `llms-full.txt`, and `packages/tools/mcp/src/api-reference.ts` (opt-in region markers `// <gen-docs:api-reference:start @pyreon/X>`); `bun docs/scripts/gen-all.ts` regenerates the docs-site `reference/<pkg>.md` + troubleshooting (from `anti-patterns.md`) + examples gallery. CI gates `Docs Sync` (gen-docs --check) + `Docs Generated Fresh` (check-generated-fresh).
- **Coverage: 51 of 65 published packages have a manifest** (the final real-API backlog migrated: sized-map, dnd, attrs, rocketstyle, coolgrid, kinetic, kinetic-presets, connector-document). The remaining 14 are EXPLICITLY EXEMPT tooling/scaffolding with no consumable runtime API (cli, zero-cli, create-zero, create-multiplatform, meta, typescript, storybook, vite-plugin, and the 5 `*-compat` shims) PLUS `@pyreon/testing` (a real-API package pending its own manifest migration) — do NOT give the exempt tooling filler manifests; before "enrich package X's docs", `ls packages/<cat>/X/src/manifest.ts`; absent = a migration (add manifest + `@pyreon/manifest` devDep + marker pair + `gen-docs` + a `manifest-snapshot.test.ts`).
- **MCP `validate`** runs `detectReactPatterns` ("from React" mistakes) + `detectPyreonPatterns`, which catches "using Pyreon wrong" mistakes — 16 detector codes today. MCP also serves `get_pattern` (16 `docs/patterns/*.md`), `get_anti_patterns` (token-frugal compact index by default), `get_changelog`, `get_api`, `audit_islands`, `audit_test_environment`.

## Reactive vs Static — The Core Rule

Components run ONCE. What's reactive depends on WHERE you read a signal:

- **Component props with signal reads** = reactive (compiler wraps with `_rp()` → getter on props; read in an effect/accessor to track).
- **DOM text children with signals** = reactive (compiler wraps in accessor). Explicit accessor `{() => …}` is always reactive.
- **Context reads**: `createReactiveContext` returns `() => T` (read in a reactive scope); plain `createContext` returns `T`.
- **Destructuring props** = captured once (static) — use `props.x` for reactivity.
- **`const` from props in JSX** = reactive (compiler inlines `props.x` at use sites). **`let`/`var` from props** = static.
- **JSX spread on a component** `<Wrapper {...rest}>` = reactive (compiler `_wrapSpread`). DOM-element spread `<div {...rest}>` = reactive (template `_applyProps`). Manual `Object.assign`/`{...source}` in plain JS is NOT covered — use `mergeProps`/`splitProps`.

## Memory Leak Classes

Seven classes seen in framework code, catalogued in `.claude/rules/anti-patterns.md` "Memory Leak Classes" with bug shape + fix + static-analysis coverage. Read it before adding a module-level cache/stack/registry.

| Class | Shape | Fix |
| --- | --- | --- |
| **A** | Position-based cleanup of a shared module-level stack (`pop()`) — out-of-LIFO removal pops the wrong frame | Capture the frame at push; cleanup removes by IDENTITY (`splice(lastIndexOf(frame), 1)`) |
| **C** | Unbounded module-level cache | LRU bound / subscriber-aware sweep / lifecycle-event invalidation |
| **D** | Event-listener pile-up (shared/global listener, no refcount) | Refcount idempotency or re-push the cached cleanup |
| **F** | Promise queue stale resolution (slow-old clobbers fast-new) | Version counter; discard captured≠current. Also clear `Map<key, Promise>` caches on BOTH settle paths |
| **H** | Closure-captured snapshot retained for the effect's lifetime | Capture the minimal subset (an id/key), not the full snapshot |
| **I** | Orphaned `Promise.race + setTimeout` (no `clearTimeout` on success) | Capture the timer id outside the constructor; `clearTimeout` in `finally` |
| **B/E** | Subscriber retention after dispose (no real instances in shipped code) | — |

Before a new module-level cache/stack/registry, answer: (1) what's the eviction trigger? (2) what's the cleanup contract — strict-LIFO / identity / refcount / none? (3) is the cleanup path exercised by a test? "The GC will handle it" = treat as a leak source. Two preventative lint rules ship in `recommended`: `pyreon/init-fn-needs-idempotency` (D) + `pyreon/promise-race-needs-cleartimeout` (I).

## Common Issues & Fixes

Quick reference (full bug-class detail + reproducers in `.claude/rules/anti-patterns.md`):

- `ComponentFn<{name:string}>` not assignable → generic `h()` solves it. Missing `@pyreon/reactivity` dep → add + `bun install`.
- SSR empty render → forgot `mergeChildrenIntoProps`. DOM tests need happy-dom. Vite resolves `dist/` not `src/` → add `resolve.conditions: ["bun"]`.
- `signal(5)` doesn't write → use `signal.set(5)`. `onClick={undefined}` → runtime bails on non-functions but guard it.
- Context destructuring loses reactivity → access properties lazily. Theme mode switching → PyreonUI uses getter properties.
- `mergeProps` "Cannot redefine property" → set `configurable: true` on your `defineProperty`. Symbol-keyed props preserved (`Reflect.ownKeys`).
- `<Show when={signal}>` / `<Match when={signal}>` accept value OR accessor (the auto-call rewrites bare `when={sig}` to a value) — reactive cases still need `when={() => sig()}`.
- Storage signals (`useStorage` etc.) must forward `_v` via getter (the `_bindText` fast path) — enforced by `pyreon/storage-signal-v-forwarding`. Built on `wrapSignal(base, { set })` (the canonical writable-side-effect facade — forwards `_v`/`.direct`/`.peek`/`.subscribe` by construction).
- `<select value>` works across all paths (PZ-09): the compiler never bakes it (dead content attribute — the parser ignores `value` on `<select>`) and defers the property bind past the children lines; mount/hydrate apply it AFTER children (`applySelectValueProp`); SSR marks the matching `<option selected>` instead of serializing the attribute. Known gaps: spread `value` on the template path with DYNAMIC options; array values on `multiple` (unsupported both sides). See anti-patterns "Applying `select.value` before the option children exist".
- `<Element tag="hr"/>` (void tags) no longer trip the children warning. `<RouterLink to={signalRead}>` renders correctly (SSR + hydrate now run `makeReactiveProps`; `RouterLink` merges user `class` with `activeClass` via `cx`).
- Passing `layout` to `startClient`/`createApp` while fs-router emits `_layout.tsx` double-mounts → don't (createApp detects + warns). `@pyreon/charts` needs the `tslib` alias in Vite apps (`chartsViteAlias()`) + browser tests (`tslibBrowserAlias`).
- Styler `insertRule` failures, dev gates, and ALL library dev warnings use **bare `process.env.NODE_ENV !== 'production'`** — NOT `typeof process` (dead in Vite browser bundles) and NOT `import.meta.env.DEV` (Vite/Rolldown-only). Enforced by `pyreon/no-process-dev-gate`. Server-only packages (zero/runtime-server/server/vite-plugin) are exempt. Never assign that gate to a local `__DEV__` const (Bun.build doesn't fold through the alias → ships dev strings) — write it inline.
- `@pyreon/head` external scripts default to `defer`. `HeadProvider` inherits an outer `HeadContext` (was silently shadowing it → empty `<head>` in zero SSG — a Googlebot-invisible SEO bug). `@pyreon/zero` ships `@pyreon/zero/image-types` ambients; `node:*` modules must NOT be statically importable from a client-safe entry (a lazy `await import()` only downgrades the build error to a warning + a dead chunk — move the import SITE into a server-only module).

**`@pyreon/zero` modes (SSG/SSR/ISR) — durable contract** (the `mode:` API was typed-but-unimplemented; `verify-modes` + `audit-types` gate against recurrence):

- **SSG** (`ssgPlugin`):
  - per-route HTML at build via a nested Vite SSR sub-build (env-flag-gated to avoid re-trigger; concurrency-pooled via `runWithConcurrency`, `ssg.onProgress`).
  - `getStaticPaths` enumerates dynamic routes (`[id].tsx`); `_404.tsx`/`_not-found.tsx` → `dist/404.html` (router-driven so it renders INSIDE layout chrome — `findNotFoundFallback` synthesizes the chain; loaders skipped via `router.preload(path, _, { skipLoaders: true })`; noindex auto-injected).
  - Loader-thrown `redirect()` → `dist/_redirects` (Netlify/CF) + `_redirects.json` (Vercel) + optional meta-refresh HTML. Sitemap auto-emit (`seoPlugin({ sitemap: { useSsgPaths, hreflang } })`). Per-route `<link rel=modulepreload>` (static closure only). Path-collision detection (loud build error).
  - `ssg.format` / `ssg.onPathError` / `ssg.errorArtifact` (`dist/_pyreon-ssg-errors.json`).
  - i18n route duplication (`expandRoutesForLocales`, `prefix` / `prefix-except-default`; root layouts NOT duplicated under prefix-except-default — they wrap via hierarchical match; per-locale `dist/{locale}/404.html` + hreflang clusters).
- **SSR/ISR**:
  - `ssrPlugin` auto-builds `dist/server/entry-server.js` + invokes `adapter.build({ kind: 'ssr' })` (the `AdapterBuildOptions` is a `kind: 'ssr'|'ssg'` discriminated union).
  - Deploy staging uses `materialize(src, dest)` (handles same-dir / dest-inside-src — never `cp` into itself, the EINVAL that made the artifact unrunnable).
  - Production template = the BUILT client `index.html` (hashed `<script>`/CSS) copied to `dist/server/template.html` + read via `readBuiltTemplate()` (`clientEntry: false` suppresses the dev entry) — else the page server-renders but ships the dev `/src/entry-client.ts` and never hydrates.
  - **Cloudflare/workerd**: no fs + `undefined` `import.meta.url` — the adapter inlines the template into `globalThis.__PYREON_SSR_TEMPLATE__` then dynamic-imports the handler; `normalizeLocation` guards `undefined`; needs `nodejs_compat`.
  - ISR: `createISRHandler` keys by `pathname + search` by default (cookies/Authorization need an explicit `cacheKey` — auth-unsafe otherwise; warns at init + a BUILD-time warning names any isr-mode route whose loader source reads cookie/authorization headers without a cacheKey function (`fs-router.ts:detectIsrAuthRisk`)), pluggable `ISRStore` (default `createMemoryStore`), build-time per-route `export const revalidate` → `dist/_pyreon-revalidate.json` + `Adapter.revalidate(path)` (`vercelRevalidateHandler` scaffold validates path against the manifest).
- **Mode visibility + zero-config adapter (Tier-1 DX)**:
  - every build prints a per-route mode table (`○ ssg · λ ssr · ⟳ isr · ⚡ spa`, `(declared)` marks overrides; >40 routes collapse to counts) — ssr-plugin prints it for server builds, ssg-plugin for `mode:'ssg'` (gated so hybrid builds print ONCE); `zero dev` banner shows the app mode + hybrid overrides and TRUTHFUL per-route modes (`collectFileRouteModes` — file-level twin of `collectRouteModes`: leaf > nearest layout > app mode).
  - `adapter` unset → auto-detected from platform env (VERCEL/NETLIFY/CF_PAGES; local = node, explicit always wins). SSG build WARNS loudly on a dynamic route with no `getStaticPaths` (exempt: declared non-static renderMode, api routes).
  - **`mode: 'auto'` (EXPERIMENTAL, Tier-4)**: per-route inference — `revalidate`→isr, `getStaticPaths`→ssg (even with loader), loader/serverLoader/guard/middleware→ssr, else ssg; explicit exports + routeRules win. Implemented as inference-as-declaration (`applyModeInference` injects `renderModeLiteral` before generation → runtime/build need zero auto-awareness); app pipeline via `resolveAutoModeSync` at zeroPlugin factory time (cwd-based routes dir; announced once); table/banner show 'auto' + per-route inferred modes (`collectFileRouteModes('auto')`). `ZeroUserConfig` widens only zero()'s param — internal `ZeroConfig.mode` stays narrow; `_autoMode` internal marker.
  - **routeRules (Tier-4)**: `zero({ routeRules: { '/blog/**': { renderMode: 'isr' } } })` — central glob overrides (`*` one segment, `**` any depth, most-specific wins); precedence file export > routeRules > app mode, applied uniformly in `resolveRenderModeForPath`/`collectRouteModes`/`collectFileRouteModes` (runtime dispatch, build filtering, mode table, SSG completeness warning) with `via: 'file'|'rule'` provenance in entries + rule-aware error lines.
  - **Tier-2 silent-failure kills**: computed (non-literal) `renderMode` → build warning (still works at runtime via namespace import, but invisible to file-level mode surfaces); mode build errors carry per-route pasteable fix lines; explicit `ssg.paths` REPLACES auto-detection and now warns when route `getStaticPaths` exports get ignored (documented precedence); route `export const revalidate` (build-time platform manifest) vs `isr.revalidate` (runtime SWR TTL) are different layers — both JSDoc'd; ISR `cacheKey: 'path-only'` shorthand (strips query params; does NOT count as custom key for auth-refusal) + `expireOnTimeout` (drop stale entry on revalidation timeout, default keep-stale); `ssg.format: 'both'` auto-injects a root-relative canonical to the clean URL into both copies (skips pages with existing canonical + meta-refresh stubs).
- Gates: `pyreon doctor --check-ssg` + lint `ssg` category (`revalidate-not-pure-literal` / `missing-get-static-paths` (skips api routes + non-default-export files) / `invalid-loader-export`). `verify-modes` (build artifacts) + the `ssr-node`/`isr-node`/`ssg-*` e2e (directory-rewriting `scripts/serve-ssg.ts` — NOT `vite preview`, whose SPA fallback masks per-route prerendered HTML).

## Monorepo Structure

65 published packages across 5 categories under `packages/`, plus 7 private support packages:
- `packages/core/` (10): reactivity, core, compiler, runtime-dom, runtime-server, router, head, server, primitives, sized-map
- `packages/fundamentals/` (26): a11y, store, state-tree, form, validation, validate, query, table, virtual, i18n, feature, charts, storage, hooks, hotkeys, permissions, machine, flow, code, rich-text, document, rx, toast, url-state, dnd, sync
- `packages/tools/` (11 published): cli, lint, mcp, vite-plugin, typescript, storybook, react-compat, preact-compat, vue-compat, solid-compat, svelte-compat; + `devtools` (private)
- `packages/ui-system/` (11): ui-core, styler, unistyle, elements, attrs, rocketstyle, coolgrid, kinetic, kinetic-presets, connector-document, document-primitives
- `packages/zero/` (6): zero, zero-cli, create-zero, create-multiplatform, meta, zero-content
- `packages/internals/` (3 private): test-utils, manifest, perf-harness; + vitest-config, playwright-config
- `packages/ui/` (3 private): ui-theme, ui-components, ui-primitives

Plus `docs/` (Pyreon-native docs site on @pyreon/zero + @pyreon/zero-content — 188 doc pages covering all packages, `<Example>` live-mount primitive, dogfoods the framework) and `examples/`.

Layer order (deps): reactivity → core → {compiler, runtime-dom, runtime-server, router, head} → server → vite-plugin → compat. UI: ui-core → styler → unistyle → elements → attrs → rocketstyle → coolgrid/kinetic.

## Testing, CI & Gates

**Tests**: `bun run test` (all), `bun run test:browser` (real Chromium via `@vitest/browser` + Playwright — files `*.browser.test.{ts,tsx}`, opt-in per-package). DOM packages use `environment: "happy-dom"`. Every vitest config MUST use `defineNodeConfig`/`defineBrowserConfig` from `@pyreon/vitest-config` (enforces merge order + 90% coverage thresholds by construction; locked by `pyreon/vitest-config-uses-shared`). Root playwright configs use `definePlaywrightConfig` from `@pyreon/playwright-config`.

**Test-environment parity** (`.claude/rules/test-environment-parity.md` — read before adding tests): happy-dom is NOT a real browser. Browser-running packages MUST have a Playwright smoke (enforced by `pyreon/require-browser-smoke-test`). Mock-vnode tests MUST have a parallel real-`h()` test (the silent-metadata-drop class — `pyreon doctor --audit-tests` scans for it). Multi-render-cycle contracts (compat markers, async-mount lifecycle) need e2e, not just unit. **Bisect-verify every regression test**: revert the fix → assert it FAILS with the right error → restore → assert it passes → record it in the PR ("reverted to broken, test failed with `<error>`, restored, passed"). A test that passes against the broken state is not load-bearing.

**CI** PR wall-clock ~8.3 min. Job-DAG: `Install` (bun install, bootstrap SKIPPED) → lib-free jobs start immediately (typecheck/lint/audit-types/coverage-floor/docs-sync/…) AND `Bootstrap` (builds `lib/`) → lib-needing jobs (test matrix / browser tests / build / verify-modes / e2e). **Lib-free vs lib-needing**: typecheck/lint/vitest resolve `@pyreon/*` to `src` via the bun condition, so they don't need `lib/`; EXCEPTION = tests that assert on `lib/` bytes or boot a nested Vite SSR build. When adding a CI job, ask "does it read `packages/*/lib/`?" — yes → `needs: bootstrap`; no → `needs: install` + `restore-bootstrap: 'false'`. Matrix shards (`typecheck-cell`/`test-cell`, 8-cell by category) aggregate into the stable `Typecheck`/`Test` check names. `scripts/affected.ts` computes the per-PR filter (root-file change → `--filter=*`). E2E is a flake-resilient parallel matrix (`retries: 2` in CI). `scripts/bootstrap.ts` env: `PYREON_BOOTSTRAP_SKIP` / `_SKIP_NATIVE` / `_SOFT` / `_FORCE_FAIL`.

**Pre-push hook** (`.githooks/pre-push`): runs `bun run validate-fast` (lint + ~13 cheap gates, ~2-5s) + affected typecheck + affected test. Bypass `PYREON_SKIP_PRE_PUSH=1` or `--no-verify`. **Run `bun run validate-fast` before every push** — it catches the gates that historically bounce PRs: changeset (`bun changeset` for any published-package source change), gen-docs --check, check-doc-claims, check-bundle-budgets, check-import-budgets, check-distribution (published pkgs MUST ship `lib/**/*.map`), check-release-readiness, check-manifest-depth, check-client-bundle-node-imports, check-mcp-docs, lint-ratchet (oxlint warn-counts can only shrink) + pyreon-lint-ratchet.

**Lint/format**: `bun run lint` (oxlint, curated plugin set — only `correctness` category on, valuable rules cherry-picked; never enable `pedantic`/`jsdoc`/`suspicious` wholesale). Three-state model: `error` (gated at 0), `warn` (ratcheted burn-down — `lint-baseline.json`, can only shrink, NEVER raise a count to absorb a finding), `off` (rationale documented). Backlog is at ZERO. `oxfmt` for formatting. `bun run lint:pyreon` (`pyreon doctor --only lint --ci`) is the separate `Pyreon Lint Gate` (NOT in validate-fast) — run before pushing browser-API code.

**Key gates** (one-liners; details in each `## ...` was here historically — now in `scripts/`):
- **audit-types** (`bun run audit-types --all --strict`, CI required): flags public-interface fields with zero non-type refs (typed-but-unimplemented). New HIGH findings block; triage = fix the runtime or add to `EXEMPT_FIELDS` with rationale.
- **verify-modes** (`bun run verify-modes`, CI required): `vite build` every example × mode cell, asserts rendered CONTENT (not just a green build). Add cells that verify content, not build success.
- **check-bundle-budgets** / **check-import-budgets**: gzipped main-entry + canonical-minimal-import size vs locked budgets (`scripts/{bundle,import}-budgets.json`; measured against built `lib/` with `NODE_ENV=production` define + AST-collected externals). Growth intentional → `--update` + review diff.
- **check-distribution**: every published pkg declares `sideEffects` + ships source maps (live `npm pack --dry-run` probe).
- **check-doc-claims**: numeric claims in docs match source (hook count 36, lint rules 92, categories 18, detector codes 16, doc pages 179). Write exact numbers, not "33+".
- **check-manifest-depth**: ratchet on migrated-package MCP `get_api` density (LOCKED packages can't erode below their floor).
- **Diagnose Catalog**: a source change in `packages/core/{runtime-dom,runtime-server,core,compiler,router}/src/` needs an `ERROR_PATTERNS` entry (in `compiler/src/diagnose.ts`) so `pyreon doctor diagnose` teaches the fix (or `skip-diagnose-catalog` label). **`diagnoseError` + `ERROR_PATTERNS` live in the browser-safe `@pyreon/compiler/diagnose` subpath** (pure regex + strings, ZERO `typescript` import — extracted out of `react-intercept.ts`, which pulls the TS compiler API) so the dev throw-time fix printer can load them client-side without dragging `typescript` into the browser bundle; `react-intercept.ts` re-exports `diagnoseError` for back-compat. Locked by `compiler/src/tests/diagnose.test.ts` (bundles the subpath for the browser, asserts no TS-API markers — bisect-verified).
- **Leak Sweep** (`.github/workflows/leak-sweep.yml`, advisory): least-squares heap-slope over the perf-dashboard journeys (dev mode mandatory — counters tree-shake in prod). `bun run perf:leak-sweep`.
- **Docs Freshness Guard** (`.github/workflows/docs-freshness-guard.yml`, main-push self-heal, NOT a PR check): re-runs gen-docs + gen-all on every main push; drift (concurrent-merge staleness — two PRs touching generator inputs merged without seeing each other under non-strict protection) → red run on the offending commit + auto-opened/updated `auto/docs-regen` fix PR (auto-changeset when mcp `api-reference.ts` drifted; automerge armed when `RELEASE_PAT` is configured).
- **Release**: changesets fixed-group (synced version trajectory). check-release-readiness (publishConfig.access + fixed-group coverage), check-published-state (repo vs npm dist-tag). First-publish of a new package needs a one-time manual OIDC trusted-publisher bootstrap (`scripts/publish.ts` is hardened to non-block on the 404).

**pyreon CLI / doctor**:
- `pyreon check [paths]` — fast, file-scoped COMPILER-detector scan (`detectPyreonPatterns` + `detectReactPatterns`) with inline fixes; no paths → git-changed `.ts/.tsx`; `--fix` applies `migratePyreonCode`+`migrateReactCode`; `--json`; exits non-zero on findings — the terminal-native twin of MCP `validate`, distinct from `doctor`'s whole-project gates and `lint`'s rule set.
- `pyreon add <pkg…>` — install one or more `@pyreon/*` packages with the project's PM auto-detected from the lockfile (bun/pnpm/yarn/npm, walking up from cwd), then print a tailored, verified setup recipe per package: root provider to add + a usage snippet + docs link; bare names normalized `query`→`@pyreon/query`; recipes are CLI-LOCAL in `add-recipes.ts` — NOT generated from manifests, since manifests aren't shipped in published packages; `--dry-run`/`--json`; an `@pyreon/*` pkg without a curated recipe still installs with a generic docs pointer.
- `pyreon new [name] [--native]` — scaffold a new project; a thin dependency-free delegator that `npx`-runs `@pyreon/create-zero@latest`, or `@pyreon/create-multiplatform@latest` with `--native`; all other args pass through to the scaffolder's interactive flow; `--dry-run` prints the npx command; `@latest` so a new project always starts on the freshest templates regardless of the installed cli version.
- `pyreon mcp [args]` — launch the Pyreon MCP server; a thin dependency-free delegator that `npx`-runs `@pyreon/mcp` (the stdio server serving API reference / patterns / `validate` / `diagnose` to AI assistants); deliberately WITHOUT `@latest` so it prefers the PROJECT-LOCAL `@pyreon/mcp` — the served API reference then matches your installed Pyreon version — fetching on demand only when absent; extra args + `--dry-run` pass through; inherits stdio so the spawning AI client talks to it directly.
- `pyreon lint` (forwards every `pyreon-lint` flag via `runCli`), `pyreon info` (env + `@pyreon/*` version-skew), `pyreon upgrade` (align versions).
- `pyreon doctor` — 14 gates (react-patterns/pyreon-patterns/lint/distribution/doc-claims/islands-audit/ssg-audit/content-audit/native-audit/audit-tests/check-dedup/audit-leak-classes + slow audit-types/bundle-budgets); 0-100 score; `--full`/`--fix`/`--json`/`--gha`/`--ci`/`--only`/`--skip`; advisory `best-practices` category excluded from grade + `--ci`.

**E2E** (`bun run test:e2e` + per-suite scripts, real Chromium): playground / ssr-showcase / ui-showcase regression / fundamentals / compat-layers / app-showcase (flow + dnd + charts) / ssg-subpath / ssg-i18n / ssg-i18n-prefix / ssr-node / isr-node / cssvars / zero-hmr / zero-islands / sync-*. Each suite is its own parallel CI job (flake-isolated). The ui-showcase regression gate covers the 5 packages (runtime-dom/styler/rocketstyle/elements/unistyle) that produced 24% of `fix:` commits — add a spec when a real-app regression surfaces (bisect-verified). Coverage thresholds: `@pyreon/zero` + `@pyreon/lint` ship large `coverageExclude` lists (integration-tier surface gated by e2e/verify-modes instead) — check the exclude list before "fixing low coverage".

## Workflow

- **Senior-engineer bar**: fundamentally-correct over locally-correct; verify the bug (reproduce → bisect-verify the fix); test end-to-end against the real shape; fix issues found along the way (or open the follow-up PR now); disclose unknowns + caveats proactively.
- **Continuous learning** (same PR, not a follow-up): new anti-pattern → `anti-patterns.md`; new pattern → `workflow.md`/`code-style.md`; API change → CLAUDE.md + docs + README + llms + MCP; quirk/workaround → the relevant rule file + a code comment with the WHY.
- **Git**: NEVER push to main — feature branches + PRs. Branch via worktree off `origin/main` (`git worktree add /tmp/wt-X origin/main -b <branch>`); never checkout+pull in the primary tree; edits use the worktree-prefixed absolute path. Stage specific files (never `git add .`). `package.json` change → `bun install` + commit `bun.lock` (revert lockfile drift from a fresh-worktree install). Commit messages end with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`; backticks in `-m` execute → use `-F`.
- **NEVER merge PRs** — open them and stop; report the URL. Only `gh pr merge` when the user explicitly says "merge it" for that PR.
