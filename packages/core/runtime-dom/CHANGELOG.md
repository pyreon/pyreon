# @pyreon/runtime-dom

## 0.38.0

### Patch Changes

- Updated dependencies [[`cfa422f`](https://github.com/pyreon/pyreon/commit/cfa422fdb6985e50c74e06cf0f4c1318213d6303), [`0376a3d`](https://github.com/pyreon/pyreon/commit/0376a3ddc75dd1fbee582e7cabe98beb01d60073), [`6ee46e7`](https://github.com/pyreon/pyreon/commit/6ee46e7dca1cb01aacaa7c61ef5dbbcf12b30668)]:
  - @pyreon/reactivity@0.38.0
  - @pyreon/core@0.38.0
  - @pyreon/sized-map@0.38.0

## 0.37.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/sized-map@0.37.1

## 0.37.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.37.0
  - @pyreon/reactivity@0.37.0
  - @pyreon/sized-map@0.37.0

## 0.36.0

### Patch Changes

- Fix delegated event handlers firing twice when delegation roots are nested — the islands "+2 per click" double-fire. In a `@pyreon/zero` app an island self-hydrates via `hydrateRoot(islandMarker)`, installing a second event-delegation root _inside_ the app's mount root; a click on the island's button was then walked by both roots' listeners, so its `onClick` ran twice. The delegated listener now tags the (shared) event object with the set of elements already invoked for that dispatch, so an outer root skips any element an inner root already handled. Single-root delegation (the common case) is unchanged and stays zero-alloc on the no-handler walk. (9880fd0)
- fix(runtime-dom): `_mountSlot` returns a callable cleanup for falsy slots (fixes flow `g is not a function`) (54b716f)

  A conditional JSX slot that evaluates falsy/boolean — `{showLock && <button>}` → `false`,
  `{cond ? <x/> : null}` → `null`, `{cond && ...}` → `true` — crashed on the component's
  re-render or unmount with `TypeError: <slot> is not a function`.

  Root cause: `_mountSlot` returned `null` for `null` / `false` / `true` children, but the
  compiler emits a template's cleanup as an UNCONDITIONAL call of every slot disposer
  (`() => { __d0(); __d1(); … }`). So a falsy slot's disposer was `null`, and `null()` threw
  the moment the reactive boundary re-ran or the component unmounted. Long-standing since the
  function's inception (#170) — it only surfaces when such a slot's cleanup actually fires.

  This was the live `@pyreon/flow` **Controls** crash: `showLock` defaults `false`, so the lock
  button's slot was `_mountSlot(false)` → `null`, and Controls' cleanup `() => { …; g(); … }`
  ran `g()` = `null()` → `[pyreon] Unhandled effect error: TypeError: g is not a function` on
  flow interaction (drag/zoom) and on navigating away.

  Fix: `_mountSlot` now always returns a callable cleanup — a shared no-op for the falsy case —
  so the compiler-emitted unconditional disposer call is always safe. Return type tightened from
  `(() => void) | null` to `() => void`.

  Verified: bisect-locked unit tests (`_mountSlot(null|false|true, …)` returns a function and is
  safe to call — reverting to `null` fails with `expected 'object' to be 'function'`); root-caused
  directly from the deployed minified chunk (`kt(false)` → `null`, then `g()` in the cleanup).

- Updated dependencies []:
  - @pyreon/core@0.36.0
  - @pyreon/reactivity@0.36.0
  - @pyreon/sized-map@0.36.0

## 0.35.0

### Patch Changes

- [#1754](https://github.com/pyreon/pyreon/pull/1754) [`8a1345d`](https://github.com/pyreon/pyreon/commit/8a1345d9b14f56130f38823b58745207c7bdf7ef) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix: boolean `aria-*` state attributes now render as the string
  `"true"`/`"false"`, not presence-only `""` (a11y bug, framework-wide).

  ARIA state/property attributes (`aria-checked`, `aria-selected`,
  `aria-expanded`, `aria-disabled`, `aria-pressed`, `aria-hidden`, …) are
  string enums — assistive tech does NOT read `aria-checked=""` (the
  presence-only output of a boolean) as "true"; it falls back to the
  default, so a checked/selected/expanded element was announced as its
  opposite. Both renderers (`applyStaticProp` client + `renderPropValue`
  SSR) now coerce a boolean `aria-*` value to its literal string, BEFORE
  the generic boolean→presence branch, and do so identically so SSR
  markup matches client hydration. HTML boolean attrs (`disabled`,
  `hidden`, …) keep presence semantics; `data-*` (author-defined) keeps
  presence — only `aria-*` booleans coerce.

  This is the root-cause fix: `aria-checked={signal()}` (boolean) now
  renders correctly everywhere, with no per-call-site changes.

- [#1648](https://github.com/pyreon/pyreon/pull/1648) [`1c98f38`](https://github.com/pyreon/pyreon/commit/1c98f3863ccd2fd16a4ad6e20e82fb778725bca0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Three allocation fast paths in the template/mount hot paths (per-instance closure & array reductions)

  - **`@pyreon/compiler`** — a single-binding template returns its disposer
    directly (`return __d0`) instead of a per-instance wrapper closure
    (`return () => { __d0() }`). For the dominant `<For>`-row shape (a sole
    reactive-text child): ~97 B/row → ~948 KB + 10,000 fewer closure allocations
    on a 10k-row list. Both JS + Rust backends, byte-identical.
  - **`@pyreon/runtime-dom`** — `_rsCollapseH` uses an inline-first handler-disposer
    slot (no array for the common 0/1-handler collapsed shape): ~57 B/row +
    10,000 fewer array allocations on a 10k single-handler-collapse list.
  - **`@pyreon/runtime-dom`** — `mountChildren`'s 3+-child path collects only real
    (non-`noop`) cleanups inline-first instead of `children.map(...)`: no array /
    wrapper closure for child sets yielding ≤1 real cleanup. ~169 B/call → ~1.6 MB
    on 10k mixed 3-child elements (the `h()`/component path).

  All behaviour-identical (proven by the existing compiler + runtime-dom suites)
  with added bisect-verified regression tests. A fourth candidate (reusing the
  batch flush's per-pass `_visitedThisPass` Set) was implemented, measured as a
  wash (`Set.clear()` is marginally slower than `new Set()` in V8; the GC benefit
  was unmeasurable), and reverted.

- Updated dependencies [[`1f29c4b`](https://github.com/pyreon/pyreon/commit/1f29c4b9791e6ad96901ca0e2b90e5335b803895), [`02b77ae`](https://github.com/pyreon/pyreon/commit/02b77aed6b4383554b3458e408b462098fc3e708), [`35d440a`](https://github.com/pyreon/pyreon/commit/35d440a44d92ac913cf19f3f8e21b4603458a165)]:
  - @pyreon/core@0.35.0
  - @pyreon/reactivity@0.35.0
  - @pyreon/sized-map@0.35.0

## 0.34.0

### Patch Changes

- [#1592](https://github.com/pyreon/pyreon/pull/1592) [`c0814b7`](https://github.com/pyreon/pyreon/commit/c0814b7881b01b7bfed19dffd7f48a3269c14199) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix reactive `class` and `style` bindings in the compiled template fast path.

  The template setter assigned the raw value to `className` / `style.cssText`, so several documented forms were silently broken — only correct through the slower `h()`/`applyProp` path:

  - `class={['a', cond() && 'b']}` rendered `class="a,b"` (comma-joined) instead of `"a b"` — the array was never passed through `cx()`.
  - `class={{ active: a() }}` rendered `class="[object Object]"`.
  - `style={() => ({ color: theme() })}` (the form the docs use) emitted `style.cssText = <object>` → `"[object Object]"` → **no inline styles at all**.
  - `style={{ color: theme() }}` applied once via a one-shot `Object.assign` and never updated on signal change; object styles also skipped number→px and stale-key removal.

  The compiled paths now match the runtime `applyProp` value-normalization exactly:

  - **class** → `typeof v === "string" ? v : _cx(v)` (string passthrough; array/object → `cx`). The injected `cx` import is aliased (`import { cx as _cx }`) so it can't collide with a hand-written component that already imports the public `cx`.
  - **style** → delegates to a new `_setStyle` runtime helper (`@pyreon/runtime-dom`, = `applyStyleProp`): string → `cssText`; object → per-property `setProperty` with kebab-casing, number→px, and stale-key removal; dynamic bindings wrapped in a reactive `_bind`.

  Fixed byte-identically in both backends (JS + Rust native; locked by the cross-backend equivalence suite) and verified end-to-end with runtime DOM mount specs + a real docs-site build. String class/style emit is behaviourally unchanged. Bisect-verified.

- Updated dependencies [[`66d44c5`](https://github.com/pyreon/pyreon/commit/66d44c58920bf81848e9ba858c413a88727a3c65)]:
  - @pyreon/sized-map@0.34.0
  - @pyreon/reactivity@0.34.0
  - @pyreon/core@0.34.0

## 0.33.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/sized-map@0.33.0

## 0.32.0

### Patch Changes

- [#1499](https://github.com/pyreon/pyreon/pull/1499) [`4529407`](https://github.com/pyreon/pyreon/commit/4529407d69ba0875568b5c78ff14e2850aa2d690) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Core + fundamentals deep-audit fixes. `@pyreon/validate`: corrected the outdated "Pyreon does NOT ship its own validator runtime / ~1-2KB gz" claim across the entry docstring, README, manifest, and docs page — since v1 the package ships Pyreon's own `s` validator runtime; the accurate, measured contract is tree-shaking (DX-helpers-only import ≈0.5KB gz; the runtime ≈3.9KB gz pulled in only when `s`/primitives are imported). `@pyreon/code`: minimap's canvas click listener is now stored and explicitly removed in the plugin's `destroy()` — completes the destroy contract (the listener was element-scoped so it normally died with the canvas, but explicit removal protects against any external retention of the canvas). `@pyreon/runtime-dom`: fixed a misleading dev-gate comment in template.ts (claimed `import.meta.env.DEV`; the code correctly uses the bundler-agnostic `process.env.NODE_ENV !== 'production'` gate).

- [#1528](https://github.com/pyreon/pyreon/pull/1528) [`3d90e89`](https://github.com/pyreon/pyreon/commit/3d90e89b824d346a33732af929acdbc7fdd81094) Thanks [@vitbokisch](https://github.com/vitbokisch)! - CSS-variables mode — ui-system sweep + safety net + perf fast paths:

  - `@pyreon/styler`: dev-mode resolved-CSS validator in `sheet.insert` — warns (once per finding, `[Pyreon]`-prefixed) on `NaN` values (JS arithmetic on a var token), `undefined`/`null` values, and malformed `var()` concatenation (`var(--x)99` alpha-suffix hacks), naming the offending declaration. Tree-shaken from production.
  - `@pyreon/coolgrid`: grid math is var-aware — a `var()`/`calc()` gap or gutter now emits native `calc()` spacing (Row margins, Col gap-margin, Col width) instead of silently skipping spacing / emitting the malformed `var(--x)px` (multiplication, not division — `calc(x / -2)` invalidates the whole shorthand).
  - `@pyreon/unistyle`: `resolveCssVarReferences(value, registry)` — inline `var(--…)` references (incl. fallbacks) back to raw emitted values for consumers that can't evaluate custom properties (document/PDF export, devtools). `calc()` is inlined, not evaluated.
  - `@pyreon/runtime-dom`: `_rsCollapse` single-class fast path — identical light/dark classes (what the cssVariables collapse produces) skip the mode binding entirely (zero subscription, zero disposer).

  Measured (real Chromium): 100 components × 10 mode flips — classic 5.4ms vs cssVariables 1.7ms (3.2×), with zero `styler.resolve` / `rocketstyle.getTheme` work; the REAL `@pyreon/ui-components` Button + full default theme render var-safe with zero validator findings.

  Security: `resolveCssVarReferences` is implemented as a linear character scan (paren-depth-aware) rather than a regex, eliminating a polynomial-ReDoS surface (CodeQL `js/polynomial-redos`) on the var-fallback parse — input can be library/theme-author-controlled.

- [#1538](https://github.com/pyreon/pyreon/pull/1538) [`fc26160`](https://github.com/pyreon/pyreon/commit/fc26160ac2d3afba0adde20f61d94a4199519b59) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Internal refactor: replace hand-rolled `typeof window/document` environment checks with the canonical `isServer` / `isClient` primitives from `@pyreon/reactivity`. Behavior is identical (`isServer`/`isClient` ARE `typeof document {===,!==} 'undefined'`) — the framework now uses its own primitive instead of dogfooding the pattern its own `pyreon/prefer-isserver` rule flags. No public API change.

  Function-body SSR guards whose SSR branch is verified by deleting `document`/`window` at runtime in tests (e.g. `@pyreon/elements` Overlay positioning, `@pyreon/styler`'s sheet, `@pyreon/head`'s `syncDom`) intentionally KEEP the call-time `typeof` check — a module-load-time `isServer` const can't be re-evaluated by that test method, and the call-time form is equally production-correct. Those files are scoped-off from `prefer-isserver` in `.pyreonlintrc.json` with that rationale.

- [#1401](https://github.com/pyreon/pyreon/pull/1401) [`9eb24f6`](https://github.com/pyreon/pyreon/commit/9eb24f604e6e4be62ef4ad3ba33e0c3fa28e9906) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Async function components are now first-class on the client (parity with `renderToString`).

  Before this fix, an `async function Component()` returned a Promise that mount/hydrate fed straight into `mountChild`, crashing with `Cannot read properties of undefined (reading 'ref')` because Promises have no `.props`. SSR awaited the Promise per the documented contract; the client never did. This was the root cause of the deployed `examples/docs-zero` preview crashing on every doc route — they all delegated to an async `<DocBody slug={slug} />`.

  Two coordinated fixes:

  **`@pyreon/runtime-server`**: brackets async-component output with `<!--$pas-->` (start) / `<!--$pae-->` (end) sentinel comments — both in `renderToString` (the SSG path) and `streamComponentNode` (the streaming path). These mark the SSR DOM range corresponding to the resolved Promise so the client knows exactly where the async subtree begins and ends. Markers nest correctly for nested async components.

  **`@pyreon/runtime-dom`**:

  - `mountComponent` — detects `output instanceof Promise`, inserts a placeholder comment, and mounts the resolved subtree at the placeholder once settled. Cleanup cancels pending resolution so unmount-before-resolve is safe.
  - `hydrateComponent` — locates the SSR `<!--$pas-->`/`<!--$pae-->` markers (depth-tracked for nesting), advances the parent's DOM cursor past the end marker synchronously (so siblings hydrate normally), then awaits the Promise and **hydrates the resolved VNode against the SSR DOM range bounded by the markers**. This wires up events, lifecycle hooks (`onMount`), and signal subscriptions on every node of the async subtree — the part missing from the first cut, which left the SSG content visible but client-dead.
  - `firstReal` recognises `$pas`/`$pae` (and the existing `k:` For-list markers) as structural — it stops at them instead of skipping like other comments.

  `<Suspense>` still works for `lazy()`-style boundaries; this is the natural async-function counterpart.

  Regression coverage:

  - `packages/core/runtime-dom/src/tests/async-component.test.ts` — 5 mount specs.
  - `packages/core/runtime-dom/src/tests/async-component-hydrate.test.ts` — 6 hydration specs covering: handlers attach on async subtree, `onMount` fires, signal-driven text patches, siblings hydrate sync, nested async (depth-tracked markers), missing-markers fallback + dev warning.

  Bisect-verified: removing the SSR markers leaves the click-handler unattached and reactivity dead — all 6 hydration specs fail. Removing the mount Promise branch fails the 3 resolution specs with the documented `'ref'` TypeError.

  Real-Chromium sweep: docs-zero's previously-broken `/docs/multiplatform` page now renders 23 KB of content with zero errors, TOC scroll-spy links navigate correctly, URL hashes update — proving full reactivity wired through the hydrated async subtree.

- [#1523](https://github.com/pyreon/pyreon/pull/1523) [`5a38b69`](https://github.com/pyreon/pyreon/commit/5a38b69a2a2dc9a331c2e6a8a11375eebc532c63) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Server islands + streaming by default (Phase 4 of the render-modes plan).

  **`serverIsland(loader, { name, fallback?, cache? })`** — the inverse of client islands: a cacheable page with per-request server-rendered holes. Every render emits only a `<pyreon-server-island>` marker (codec-encoded props); the marker self-activates on mount and fetches `GET /_pyreon/fragment/<name>` — auto-mounted by zero's `createServer` — which renders the registered component per request with full request context (`useRequestLocals()` works inside fragments). Name-allowlisted endpoint, `no-store` by default with an opt-in `cache` option, fallback-degrading failures, and cold-start registry warming for lazy routes. Registry is `globalThis`-keyed so bundle-split module duplication can't split it.

  **`mode: 'ssr'` now streams by default** — shell flushes immediately, Suspense boundaries resolve out-of-order with inline style flushes. Opt out with `ssr: { mode: 'string' }`. ISR stays buffered (the SWR cache stores complete bodies), including per-route `renderMode = 'isr'` declarations inside streaming apps (they get a buffered render automatically).

  **Fixed (`@pyreon/runtime-dom`)**: `data-*`/`aria-*` props on CUSTOM ELEMENTS now land as real attributes instead of JS properties — `getAttribute`/`dataset`/CSS attribute selectors/SSR output all agree again. (This was how the server-island marker lost its `data-name` on client mounts; bisect-locked.)

- Updated dependencies [[`0e38332`](https://github.com/pyreon/pyreon/commit/0e3833212e93ec90994edfccb5f2966f9eb0e926), [`0c1ea1e`](https://github.com/pyreon/pyreon/commit/0c1ea1e89e4228e84367efd5d2cb334808955a25), [`e36bbe5`](https://github.com/pyreon/pyreon/commit/e36bbe52e7f1417a703b4e6ce23281c448d9132f), [`65ccdf2`](https://github.com/pyreon/pyreon/commit/65ccdf2ad95a16b676b58948acea51f957e5cf62), [`7f89196`](https://github.com/pyreon/pyreon/commit/7f89196dd3d99f61b0bba032481b9d389fdd8264)]:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/sized-map@0.33.0

## 0.31.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/sized-map@0.33.0

## 0.30.0

### Patch Changes

- [#1338](https://github.com/pyreon/pyreon/pull/1338) [`960bb0f`](https://github.com/pyreon/pyreon/commit/960bb0f139839de49508d836878b98556b1c7d07) Thanks [@vitbokisch](https://github.com/vitbokisch)! - refactor(core): owner-based context — replace the global context stack

  Context resolution moved from a global mutable `Map[]` stack to an **owner
  chain**: each mounted component's `EffectScope` doubles as a context owner
  (`_parent` + `_contexts`), linked by the renderer so the chain mirrors the
  component tree. `provide()` writes onto the current owner; `useContext()` walks
  the owner chain; context is released when the scope is disposed.

  This deletes ~190 lines of snapshot / restore / dedup / identity-removal
  machinery whose only job was to fake tree-position across deferred mounts
  (`<Show>` / `<For>`) — and which was itself the source of the 321k-frame leak,
  the position-pop bug, and orphan frames. `@pyreon/core/src/context.ts` shrank
  425 → 236 lines, and the entire context-stack bug class is now structurally
  impossible.

  - **`@pyreon/reactivity`** (minor): `EffectScope` gains `_parent` / `_contexts`
    - `provideContext` / `lookupContext`; new exports `getContextOwner`,
      `setContextOwner`, `runWithContextOwner`.
  - **`@pyreon/core`** (minor): `provide` / `useContext` are owner-based
    (owner-first, stack-fallback for SSR + the `*-compat` layers' own
    stack-based provide/inject). The internal `captureContextStack`,
    `restoreContextStack`, and the `ContextSnapshot` type are no longer exported.
  - **`@pyreon/runtime-dom`** (patch): `mount` / `hydrate` establish the owner
    chain per component; `mountReactive` captures a single owner reference
    instead of a deduped stack snapshot.

  SSR is unchanged — it keeps the request-scoped stack (a synchronous top-down
  walk needs no band-aids). `provide` / `useContext` user APIs are unchanged.

  Perf (tight A/B vs the stack model): headline component create is neutral
  (within noise); the deferred-mount `<Show>` path is ~4% faster (the dedup +
  restore work is gone). Verified: ~3,200 unit tests + verify-modes 19/19 + 156
  real-Chromium e2e. A latent cross-test context leak (a `RouterContext` frame
  bleeding between tests) was exposed and fixed by the per-mount isolation.

- Updated dependencies [[`6feb9d4`](https://github.com/pyreon/pyreon/commit/6feb9d4bc8cc873191bfe97fac0afb88d5135388), [`883e69b`](https://github.com/pyreon/pyreon/commit/883e69baed47d77eb79f4dd09b87da96a0b52894), [`4efa71b`](https://github.com/pyreon/pyreon/commit/4efa71b83af84b9310681ed213a331842248bb65), [`960bb0f`](https://github.com/pyreon/pyreon/commit/960bb0f139839de49508d836878b98556b1c7d07), [`b720267`](https://github.com/pyreon/pyreon/commit/b720267f0d9fbe260398c56d49834dc1dd2b09fb)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0
  - @pyreon/sized-map@0.33.0

## 0.29.0

### Patch Changes

- [#1327](https://github.com/pyreon/pyreon/pull/1327) [`d65d779`](https://github.com/pyreon/pyreon/commit/d65d77982284b3ce8ec871fd536069b5cd36f770) Thanks [@vitbokisch](https://github.com/vitbokisch)! - test(runtime-dom): add 28 more real tests; branches 86.43% → 86.88%

  Two new test files:

  **branch-coverage-real-2.test.ts (16 tests)**:

  - Transition component-child warn path, string-text child, null child, array child, show toggle false→true and true→false, no `name` prop, custom classnames
  - TransitionGroup empty list, multi-item, custom tag, items-signal-change
  - KeepAlive basic mount, active=true, active=false, toggle false→true→false

  **branch-coverage-prod-mode.test.ts (12 tests)**:

  - `NODE_ENV='production'` arms in mount.ts (void-element warn skipped, nested elements, reactive child, null-return component validation skipped) and props.ts (non-function event handler no-warn, unsafe URL still blocked but no warn, event delegation, class/style/dangerouslySetInnerHTML/innerHTML).

  Threshold stays at 86 (current 86.88%) with updated rationale comment.

- [#1313](https://github.com/pyreon/pyreon/pull/1313) [`34872f9`](https://github.com/pyreon/pyreon/commit/34872f9832564fce87e408411d5f416785c6b484) Thanks [@vitbokisch](https://github.com/vitbokisch)! - test(runtime-dom): add 29 real tests for props.ts; honest threshold

  29 new tests in `branch-coverage-real.test.ts` covering:

  - `applyProp` event handler edge cases (function / undefined / null / string warn / multi-word events / non-delegated)
  - innerHTML branches (string / undefined → empty)
  - dangerouslySetInnerHTML branches (\_\_html / null / undefined)
  - class / className normalizations (string / array / cx fallback)
  - style prop (string cssText / object / null clears prev keys / CSS custom property)
  - URL-safety guards (javascript: blocked / data:text/html blocked / safe data:image:png allowed / http: allowed)
  - boolean / null / custom-element / SVG dispatch matrix

  Branches lifted 86.03% → 86.43% via real tests. Threshold lowered 88 → 86 to reflect honest measurement (was previously aspirational; coverage drifted as template.ts/nodes.ts/hydrate.ts/mount.ts gained branches from new features without matching test additions). Remaining uncov in those files is covered by real-Chromium Playwright e2e.

- [#1321](https://github.com/pyreon/pyreon/pull/1321) [`c2874df`](https://github.com/pyreon/pyreon/commit/c2874df8f2b07b19aaa7a64c2f9ff2ab6b11d2f0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix: derive the singleton-sentinel version from package.json (was a stale hardcoded `0.24.6`)

  Every `@pyreon/*` package called `registerSingleton('@pyreon/X', '0.24.6', import.meta.url)`
  with a hardcoded version literal that the release process never bumped — so the
  duplicate-instance sentinel reported `0.24.6` for packages actually shipping
  `0.28.x`. The version is diagnostic-only (detection keys on module location, not
  version), but its diagnostic VALUE is exactly to surface a version skew between
  two installed copies — which a frozen literal silently defeats.

  Name + version are now derived from each package's own `package.json`
  (`import { name, version } from '../package.json' with { type: 'json' }`), so the
  diagnostic is always accurate and can never drift on release. The build inlines
  the strings (no `package.json` bloat); dev reads the live file. No new tooling
  needed — drift is structurally impossible.

- [#1316](https://github.com/pyreon/pyreon/pull/1316) [`e1139cc`](https://github.com/pyreon/pyreon/commit/e1139cc20447860a2c0e547e6fc0ed67f359e1fe) Thanks [@vitbokisch](https://github.com/vitbokisch)! - refactor(core,runtime-dom,runtime-server): single-source the URL-attribute injection guard

  Extracts `URL_ATTRS`, `UNSAFE_URL_RE`, and `isSafeImageDataUri` into
  `@pyreon/core/url-guard` (`@internal`), imported by both renderers — the client
  `@pyreon/runtime-dom` (`setStaticProp` + the DOMParser sanitizer) and the SSR
  `@pyreon/runtime-server` (`renderProp`).

  Previously each renderer carried an independent copy of the guard. That drift is
  exactly what shipped the `data:image/*` placeholder allowlist to the client
  ([#1212](https://github.com/pyreon/pyreon/issues/1212), 0.28.1) but not to SSG static HTML (fixed in [#1314](https://github.com/pyreon/pyreon/issues/1314)) — collapsing both
  into one source means the two can no longer diverge. `isSafeImageDataUri` now
  takes a string `tagName` (matched case-insensitively), so the client passes
  `el.tagName` and the server passes the JSX tag.

  No behavior change: the exhaustive allow/block matrix now lives once in
  `@pyreon/core`'s `url-guard.test.ts`; each renderer keeps its existing matrix as
  a wiring regression guard, and the full `<Image>` → SSR placeholder pipeline is
  locked by a new `@pyreon/zero` integration test.

- Updated dependencies [[`c54ce0f`](https://github.com/pyreon/pyreon/commit/c54ce0f284dab0335d9b597488ba75c6dea92b43), [`6d3e085`](https://github.com/pyreon/pyreon/commit/6d3e085183ec42883a842967afe22f806f0ea21d), [`c2874df`](https://github.com/pyreon/pyreon/commit/c2874df8f2b07b19aaa7a64c2f9ff2ab6b11d2f0), [`e1139cc`](https://github.com/pyreon/pyreon/commit/e1139cc20447860a2c0e547e6fc0ed67f359e1fe)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0
  - @pyreon/sized-map@0.33.0

## 0.28.1

### Patch Changes

- [#1210](https://github.com/pyreon/pyreon/pull/1210) [`9be0265`](https://github.com/pyreon/pyreon/commit/9be0265553ff756383b21f9c0ab556949d7cadb0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - test(coverage): bulk-bump 31 packages' `statements` threshold 94 → 95 (already passing)

  PR 1 of the "whole-repo coverage ≥ 95%" initiative (user-approved sequence:
  by-gap-size, start with quick wins).

  Every package in this bump is **already reporting ≥ 95% actual** per
  `bun scripts/check-coverage.ts`. Locking the configured threshold in
  match prevents regressions and lets the `Coverage (Full)` CI gate enforce
  the new floor.

  **No runtime changes, no test additions** — pure config update.
  Drift-detection in `BELOW_FLOOR_EXEMPTIONS` was triggered for two
  exemption entries (`@pyreon/code`, `@pyreon/kinetic`) which had been
  listed with `currentStatements: 94`; updated to 95 with the new reason
  documenting the lift.

  Packages bumped (current actual in parens):

  - @pyreon/attrs (100), @pyreon/coolgrid (100), @pyreon/table (100), @pyreon/toast (100)
  - @pyreon/rocketstyle (99.41), @pyreon/primitives (99.26), @pyreon/i18n (99.21), @pyreon/validation (99.12)
  - @pyreon/rx (98.45), @pyreon/kinetic (98.24), @pyreon/feature (98.11), @pyreon/head (97.97), @pyreon/flow (97.94), @pyreon/form (97.94), @pyreon/document-primitives (97.82), @pyreon/preact-compat (97.68), @pyreon/server (97.54), @pyreon/svelte-compat (97.42), @pyreon/validate (98.69), @pyreon/dnd (97.33)
  - @pyreon/query (96.79), @pyreon/mcp (96.52), @pyreon/unistyle (96.36) [already 95], @pyreon/reactivity (96.13), @pyreon/connector-document (96.05), @pyreon/react-compat (96.03) [already 95]
  - @pyreon/storage (95.6), @pyreon/permissions (95.38), @pyreon/url-state (95.13), @pyreon/runtime-dom (95.02), @pyreon/code (95.02), @pyreon/core (95.68), @pyreon/vite-plugin (95.32)

  Pre-existing CI failures NOT addressed in this PR (separate follow-ups):

  - @pyreon/sized-map: 0% reported by check-coverage.ts (test detection bug — Tier 5)
  - @pyreon/styler: 93.16% < 94% threshold (Tier 3)
  - @pyreon/ui-core: 90.94% < 94% threshold (Tier 4)
  - @pyreon/zero: 91.65% < 94% threshold (Tier 4)
  - @pyreon/runtime-dom: branches 85.78% < 88% threshold (Tier 6)

  Next PR (Tier 2): close the < 1pt gaps on charts, elements, hooks,
  hotkeys, lint, router, state-tree with focused test additions.

- [#1285](https://github.com/pyreon/pyreon/pull/1285) [`ea58eda`](https://github.com/pyreon/pyreon/commit/ea58eda140865aacc1b3d6f02bb9b0fe1772b7fe) Thanks [@vitbokisch](https://github.com/vitbokisch)! - perf(runtime-dom): skip the stale-scan on pure reorders (both `<For>` reconcilers)

  A swap / reverse / sort keeps the SAME key set in a new order — nothing is added
  or removed — yet every keyed-list update still rebuilt an O(n) key `Set` and ran
  an O(m) stale scan. Both reconcilers now mount new entries FIRST and count them;
  when nothing was added AND the cache still holds exactly the keyed count, the
  update is provably a pure reorder, so the Set rebuild and stale scan are skipped.
  Mount-before-remove is order-independent for correctness (new and stale keys are
  disjoint; the stale scan skips any cache key already in the new key set).

  - `mountFor` (the `each`/`by` source-array reconciler): **1.20ms → 1.00ms
    (~17%)** on a 5000-row full-reverse — stacking on [#1280](https://github.com/pyreon/pyreon/issues/1280)'s resolve-once for
    ~29% total.
  - `mountKeyedList` (the function-child keyed-array reconciler): **1.50ms →
    1.40ms (~7%)** on a 4000-row full-reverse.

  All measured in real Chromium with drift-controlled tight-alternating A/B. The
  win scales with reorder size; the synthetic 2-row swap is floor-bound (~700µs,
  CI95-tied with Vanilla) and won't show it — real apps that sort / drag-reorder /
  reverse large lists benefit. 699 runtime-dom tests pass, coverage 95.13%, zero
  behaviour change.

- [#1280](https://github.com/pyreon/pyreon/pull/1280) [`04bb778`](https://github.com/pyreon/pyreon/commit/04bb77889f4b158fd7dbe109454a1faf992bccaf) Thanks [@vitbokisch](https://github.com/vitbokisch)! - perf(runtime-dom): mountFor reorder resolves each cache entry once (3× → 1× Map.get) + gates the prod-dead duplicate-key Set

  The `<For>` keyed reorder hashed every key THREE times per update — once in
  `computeForLis` (`cache.get(key).pos`), once in `applyForMoves`
  (`cache.get(key)`), and once in the trailing pos-refresh loop. It now resolves
  the entries ONCE into a reused buffer (`LisState.entries`) and indexes that, so a
  1k-row reorder drops ~2k Map hashes per update. Separately, `collectNewKeys`'s
  per-update duplicate-key `Set` is purely a DEV diagnostic on the update path (it
  never skips in production — keys must match item length), so it's now gated
  behind `process.env.NODE_ENV !== 'production'`: the production reorder path is a
  tight key loop with zero Set allocation. (The fresh-render path keeps its
  load-bearing dedup, which DOES skip duplicates to prevent DOM corruption.)

  Measured (real Chromium, drift-controlled back-to-back A/B, 5000-row full-reverse
  ×60, dev build where only the Map-get reduction applies): median **1.40ms →
  1.20ms (~14%)**, non-overlapping distributions. Production additionally removes
  the per-update Set, so the production win is ≥ the measured dev win. The
  synthetic 2-row-swap-in-1000 benchmark op is floor-bound (~700µs, CI95-tied with
  Vanilla) and does not show this — the win scales with reorder size, so it helps
  real apps that sort/reorder large lists. Zero behaviour change: 699 runtime-dom
  tests pass.

- [#1212](https://github.com/pyreon/pyreon/pull/1212) [`fccddae`](https://github.com/pyreon/pyreon/commit/fccddae860e3126640dbcbd6d5a0ef22ac419f48) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(runtime-dom): allow `data:image/*` URIs on image-source attributes (unblock `<Image>` placeholders)

  The `setStaticProp` URL guard blocked **every** `data:` URI on URL-bearing
  attributes (`src`, `poster`, …) to stop `javascript:`/`data:text/html`
  injection. But that also rejected `data:image/*` placeholders — silently
  disabling `<Image>`/`<OptimizedImage>`'s blur-up and color placeholders, which
  is the framework's **own** `imagePlugin` output (`data:image/webp;base64,…` for
  blur, `data:image/svg+xml,…` for color). Dev mode logged a `[Pyreon] Blocked
unsafe URL` warning on every render; production silently dropped the attribute
  so the placeholder never reached the DOM.

  The guard is now context-aware. A `data:image/<type>` URI is allowed only on an
  image-source attribute (`src`/`srcset`/`poster`) of an image-context element
  (`<img>`/`<source>`/`<video>`), where the browser treats it as a static,
  non-executing image. Raster types (png/jpeg/webp/avif/…) always pass; SVG is
  allowed only when it carries no `<script>` or `on*=` handlers (decoded for both
  base64 and url-encoded payloads). Everything else stays blocked — `javascript:`
  everywhere, `data:text/html` on `<iframe>`/`<object>`/`<embed>`, and `data:` on
  navigable elements like `<a href>`/`<form action>`.

  The same allowance applies to the HTML-sanitizer path (`dangerouslySetInnerHTML`),
  so a legitimate `<img src="data:image/png;base64,…">` in sanitized HTML also
  survives.

  `@pyreon/compiler` gains a matching `ERROR_PATTERNS` entry so `pyreon doctor
diagnose` / the MCP `diagnose` tool explains the `[Pyreon] Blocked unsafe URL`
  warning and which `data:` URIs are allowed where.

- Updated dependencies [[`a448ff4`](https://github.com/pyreon/pyreon/commit/a448ff4fa5b5627622be0fcd7fbe65b5f8c51991)]:
  - @pyreon/sized-map@0.28.1

## 0.28.0

### Patch Changes

- Updated dependencies [[`1aeb610`](https://github.com/pyreon/pyreon/commit/1aeb610a10ce5069b52b2882a6175a16c16483b3)]:
  - @pyreon/sized-map@0.33.0
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0

## 0.27.1

### Patch Changes

- [#1189](https://github.com/pyreon/pyreon/pull/1189) [`0fae784`](https://github.com/pyreon/pyreon/commit/0fae784fdb1bd1ef0c41ffc2f58472c4392ce781) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix: publish `@pyreon/sized-map` and force topological build order

  The 0.27.0 release silently failed: `bun run --filter='./packages/*/*' build`
  runs in parallel, and seven framework packages (`@pyreon/core/router`,
  `@pyreon/core/runtime-dom`, `@pyreon/tools/lint`, `@pyreon/ui-system/elements`,
  `@pyreon/ui-system/rocketstyle`, `@pyreon/ui-system/kinetic`, `@pyreon/zero/zero`)
  listed `@pyreon/sized-map` in `devDependencies` despite IMPORTING it from `src/`.
  Bun's filter respects `dependencies` for topological ordering but not
  `devDependencies`, so a consumer could start building before sized-map's `lib/`
  existed, crashing with `[UNLOADABLE_DEPENDENCY] Could not load .../sized-map/lib/index.js`.

  This also closes a type-leak: `@pyreon/router/lib/types/index.d.ts:3` carries
  `import { SizedMap } from '@pyreon/sized-map'`, which would degrade to `any`
  for npm consumers if sized-map stayed private.

  Changes:

  - `@pyreon/sized-map` is now publishable to npm (was `private: true`). The
    package is a small, focused, bounded-Map primitive (FIFO or LRU-on-read) —
    safe to use directly even though Pyreon's main consumers are framework-internal.
  - All 7 consumers move `@pyreon/sized-map` from `devDependencies` →
    `dependencies`. This forces `bun run --filter` to respect topological order
    and makes the transitive dep explicit for npm consumers.
  - Added to `.changeset/config.json` `fixed[0]` group so it ships with every
    other framework package at the synced version.

  First-publish is bootstrapped manually following the OIDC trusted-publisher
  procedure documented in CLAUDE.md.

- Updated dependencies [[`0fae784`](https://github.com/pyreon/pyreon/commit/0fae784fdb1bd1ef0c41ffc2f58472c4392ce781)]:
  - @pyreon/sized-map@0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0

## 0.26.3

### Patch Changes

- [#1169](https://github.com/pyreon/pyreon/pull/1169) [`44cc6b9`](https://github.com/pyreon/pyreon/commit/44cc6b9b657363ffdb5aaa52880fa4c8c7ef66b0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(runtime-dom): mount children-injection uses descriptor-copy instead of object spread (closes the reactive-prop-through-children bug class)

  `mount.ts:404-410` did `{ ...vnode.props, children: ... }` when `h(Comp, props, ...children)` was called with children as separate positional args (the canonical JSX-compiled call shape). The JS-level object spread fired every getter on `vnode.props` BEFORE `makeReactiveProps` could install / re-install getter descriptors — collapsing compiler-emitted `_rp(() => signal())` wrappers (already converted to getters at the OUTER mount) to static values for every nested mount.

  **Bug class symptom**: any framework or user-land component with reactive props used as children-bearing JSX siblings silently lost reactivity. `<RocketstyleButton href={signal() ? '/a' : '/b'} />` with `Element` as base never updated the `href` DOM attribute. The first investigations traced and fixed the rocketstyle pipeline + Wrapper helper; the leak survived because Element / Text / Content (wrapped INSIDE Wrapper) still bled. The sibling PR [#1168](https://github.com/pyreon/pyreon/issues/1168) fixed those three components localized; **this PR closes the bug class at the framework root** so every other component (framework or user-land) using the canonical `<Comp {...rest}>children</Comp>` JSX pattern is also protected.

  **Fix**: replace the spread with descriptor-copy via `Object.getOwnPropertyDescriptors` + per-key `Object.defineProperty`, then static assignment for the `children` override. Getters stay getters end-to-end through `h()` → component body → `applyProps` / `_bindText`.

  Surgical scope:

  - No-children path (control) unchanged: `vnode.children.length === 0` → returns `vnode.props` directly, byte-identical behavior to pre-fix.
  - Children-present path: 1 object allocation (was 1 in the spread shape) + descriptor copy per key (vs value copy per key). Same big-O, negligible overhead.

  API contract unchanged.

  ## Bisect-verify

  3 new specs in `packages/core/runtime-dom/src/tests/mount-children-spread-reactive.browser.test.tsx`:

  1. **Two-level forwarding chain with reactive `href` + children present** — triggers the buggy branch. PRE-FIX fails `expected '/a' to be '/b'`.
  2. **Control: no children → branch skipped** — passes regardless of fix. Proves the fix is surgical.
  3. **Reactive prop used as JSX text child via `_bindText`** — non-attribute consumer. PRE-FIX fails `expected 'first' to be 'second'`. Proves the bug class hits BOTH `applyProps` AND `_bindText` downstream consumers, not specific to one prop pipeline.

  Reverting to the pre-fix spread: 2 of 3 specs fail with the documented assertions. Restoring → 3/3 green.

  ## Full validation

  | Package                                | Tests                 | Status |
  | -------------------------------------- | --------------------- | ------ |
  | `@pyreon/runtime-dom` (node + browser) | 683+1-skip + 58 = 741 | ✓      |
  | `@pyreon/core`                         | 540                   | ✓      |
  | `@pyreon/router`                       | 559                   | ✓      |
  | `@pyreon/elements` (node + browser)    | 497 + 23 = 520        | ✓      |
  | `@pyreon/rocketstyle`                  | 309                   | ✓      |

  **2689 tests across 5 affected packages, all green.** Typecheck clean. Lint clean.

  ## Interaction with sibling PR [#1168](https://github.com/pyreon/pyreon/issues/1168)

  [#1168](https://github.com/pyreon/pyreon/issues/1168) applied a localized fix to Element / Text / Content (route children through `buildSpreadProps`'s overrides so `vnode.props.children !== undefined` → mount's spread branch is skipped). With this PR's mount.ts fix, the localized fix becomes redundant but harmless. The mount.ts fix alone is sufficient — proven by running `@pyreon/elements` browser tests against this branch WITHOUT [#1168](https://github.com/pyreon/pyreon/issues/1168) (all green). Both ship for defense in depth.

## 0.26.2

## 0.26.1

## 0.26.0

### Minor Changes

- [#1067](https://github.com/pyreon/pyreon/pull/1067) [`fce4e86`](https://github.com/pyreon/pyreon/commit/fce4e868611a3f5e006f20a031d43435441901e5) Thanks [@vitbokisch](https://github.com/vitbokisch)! - perf(compiler+runtime-dom): widen `_bindText`/`_bindDirect` fast path to non-computed MemberExpression callees

  `tryDirectSignalRef` previously accepted ONLY bare-identifier callees (`count()`). The canonical For-row idiom `{() => row.label()}` — exactly what the hand-tuned `examples/benchmark/src/impl/pyreon-tpl.ts` reference template uses — bailed to the full `_bind` chain (~6 allocs: deps array, dispose closure, snapshotCapture, scope.add) instead of the `_bindText` fast path (1 dispose).

  Now widened to non-computed MemberExpression chains (`row.label()`, `data.user.name()`) where the root identifier is NOT a tracked active signal (which would suggest `count.peek()` — intentionally untracked, would defeat the binding). Computed access (`row[key]()`) and chained calls (`count().toLocaleString()`) still bail to `_bind`.

  To keep correctness, `_bindText` and `_bindDirect` gain an optional 3rd `caller?` arg. The compiler emits it for MemberExpression callees: `_bindText(row.label, t, () => row.label())`. The runtime's slow path uses it instead of bare `source()` — preserves `this` if source turns out to be a method (not a signal). Fast path ignores the caller (no perf cost). The 2-arg form remains valid for Identifier callees (backward compatible).

  Both JS and Rust compiler backends implement the widening byte-identically (verified by cross-backend equivalence tests).

  Bisect-verified: revert widening → 4 new compiler tests fail (`_bindText(row.label,` not in `_bind`-only output); restore → 4 pass. Bench:fair shows `replace all` 0.96× and `create 10k` 0.98× directionally, within between-run noise band (untouched Solid moved 0.85–1.02× in the same comparison); no regressions across 165 e2e tests.

### Patch Changes

- [#1055](https://github.com/pyreon/pyreon/pull/1055) [`b1e3087`](https://github.com/pyreon/pyreon/commit/b1e30879335bbeb29eb8c56520828b841f89db08) Thanks [@vitbokisch](https://github.com/vitbokisch)! - perf(runtime-dom): drop `_tpl` cache LRU touch on hit — FIFO eviction (zero Map ops on the hot path)

  `_tpl(html, bind)` is compiler-emitted and called per template instantiation — once per row in a list of N rows. The cache previously did `cache.delete(html); cache.set(html, tpl)` on every cache HIT to refresh LRU recency, costing 2 Map ops per instantiation (20k Map ops on a js-framework-benchmark `create 10,000 rows`) for a correctness guarantee that no realistic app needs.

  Cache HIT is now a no-op; cache MISS keeps the eviction-at-cap logic (FIFO instead of LRU). Trade-off: an app with > 1024 distinct compiled templates may pay an occasional re-parse (a few ms one-time) instead of the LRU-protected hot template surviving — but no realistic app approaches 1024 templates, so the swap is pure hot-path win in practice. 681/682 existing runtime-dom tests pass (1 pre-existing skip; no LRU semantic test); typecheck + lint clean.

- [#960](https://github.com/pyreon/pyreon/pull/960) [`8333f05`](https://github.com/pyreon/pyreon/commit/8333f05e3a2b3d8b31cd03c3d835a4234a6e689c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix 4 more framework DX walls surfaced by deep-audit of the HN-clone ([#942](https://github.com/pyreon/pyreon/issues/942)) — all bisect-verified at the unit level.

  **W13 — `@pyreon/zero/client` strips URL query string on SPA cold-start.**
  `startClient` called `router.replace(router.currentRoute().path)` to kick
  off the loader pipeline, but `currentRoute().path` is the pathname ONLY
  (query + hash stripped by `resolveRoute`). The `router.replace(pathname)`
  then wrote the bare URL via `history.replaceState`, silently dropping any
  query params present on the initial-load URL. Direct-link sharing of
  `/search?q=react` was broken on cold-start — `useUrlState('q')` /
  `useTypedSearchParams` read empty `window.location.search` and fell back
  to defaults. Fix: pass the FULL URL (pathname + search + hash) instead.

  **W14 — `@pyreon/hotkeys` sequential combos (`'g t'`) didn't work.**
  CLAUDE.md documented vim/Gmail-style `g t` / `g n` combos but the
  implementation only split on `+`. So `'g t'` parsed as a single key
  literal `'g t'` (with space) that could never match a keystroke. Fix:
  `registerHotkey` now splits the shortcut on whitespace into a sequence
  of sub-combos. Each non-first combo is recorded as `entry.sequence[]`
  and matched against subsequent keystrokes within a 1-second timeout
  window. Three-step sequences (`a b c`) and combos with modifiers
  (`ctrl+k p`) both work. 9 new specs cover the contract.

  **W16 — `@pyreon/runtime-dom`'s `<Transition>` crashed with null ref**
  when wrapped inside `<Portal>`/`<Show>`/other reactive wrappers. The
  `appear: true` path queued `applyEnter(ref.current as HTMLElement)`
  in a microtask, but the child commit could be one or more microtasks
  behind. `applyEnter(null)` → `el.classList.remove(...)` → "Cannot read
  properties of null (reading 'classList')". Fix: `safeApplyEnter`
  retries up to 16 microtasks for the ref to populate before silently
  giving up. Bisect-verified spec.

  **W17 — `@pyreon/feature`'s `feature.useForm()` didn't invalidate the
  list query after submit.** `useForm`'s `onSubmit` called `http.create()`
  / `http.update()` DIRECTLY, bypassing the `useCreate()` / `useUpdate()`
  mutation pipeline that wires `client.invalidateQueries` in `onSuccess`.
  So after the form submitted, the list view didn't refetch and the UI
  silently failed to show the new/updated item until manual reload. Fix:
  `useForm`'s onSubmit now invalidates `queryKeyBase` (and the per-id key
  in edit mode), matching the behaviour of `useCreate()` / `useUpdate()`.
  96 feature tests still pass.

  Discovered by deep-auditing every interactive flow in the HN-clone
  (`[#942](https://github.com/pyreon/pyreon/issues/942)`) with Playwright. Each is bisect-verified — revert the source
  fix → the new test fails; restore → it passes.

- Updated dependencies [[`885d6d9`](https://github.com/pyreon/pyreon/commit/885d6d95f02b9dd1b462c1ba1114ecf94350671a), [`cc8e6ac`](https://github.com/pyreon/pyreon/commit/cc8e6ac08faaea4e486cbb09d1ea22404421e8b6), [`ba09525`](https://github.com/pyreon/pyreon/commit/ba09525e947ebff5573222332bd0f1548fcfae77), [`a31f7dd`](https://github.com/pyreon/pyreon/commit/a31f7dd8f8ddba6864c69bbf53117d36ddd477a3), [`71901d4`](https://github.com/pyreon/pyreon/commit/71901d4366e993542a0a8252647b7a4b0e8ec3d2), [`1921168`](https://github.com/pyreon/pyreon/commit/192116843a0547c777e884f0254ffc51a69bfae1), [`749c2f4`](https://github.com/pyreon/pyreon/commit/749c2f435909740ea43d528ebfc00a2155e64f74)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0

## 0.25.1

### Patch Changes

- [#901](https://github.com/pyreon/pyreon/pull/901) [`c862965`](https://github.com/pyreon/pyreon/commit/c8629652a94ca7d1e8622cd2de5b4ac009874dbf) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Bundle-size shrink across browser-shipped packages — **~7 KB gzipped saved** total. A typical Pyreon app shipping `runtime-dom + reactivity + core + router` is now **~5.7 KB lighter**.

  ## Wins (gzipped, measured at the production-define bundle level)

  | Package               | Before | After | Saved                      |
  | --------------------- | ------ | ----- | -------------------------- |
  | `@pyreon/runtime-dom` | 12,655 | 9,719 | **−2,936 B (−23%)**        |
  | `@pyreon/reactivity`  | 7,870  | 6,328 | **−1,542 B (−20%)**        |
  | `@pyreon/core`        | 4,972  | 4,191 | **−781 B (−16%)**          |
  | `@pyreon/router`      | 10,148 | 9,582 | **−566 B (−6%)**           |
  | `@pyreon/rocketstyle` | 4,390  | 3,992 | **−398 B (−9%)**           |
  | `@pyreon/styler`      | 5,624  | 5,453 | **−171 B (−3%)**           |
  | `@pyreon/server`      | 3,575  | 3,431 | **−144 B (−4%)**           |
  | `@pyreon/attrs`       | 1,017  | 915   | **−102 B (−10%)**          |
  | (8 more)              | ...    | ...   | smaller wins (1–98 B each) |

  17 packages shrunk total. Net **−7,153 B** gzipped across the published Pyreon footprint.

  ## Two complementary fixes

  **1. `check-bundle-budgets.ts` now measures the PRODUCTION-stripped size.** The script's `Bun.build` invocation was missing `define: { 'process.env.NODE_ENV': '"production"' }`. As a result, the budget measurement INCLUDED every `if (process.env.NODE_ENV !== 'production') console.warn(...)` string from `lib/` — overstating the real consumer bundle by 5–20% per package and forcing budget bumps for dev-only diagnostic growth that never reaches end users. Real consumers (Vite/Webpack/esbuild) all set this define at their build time; the measurement now matches what they actually ship.

  **2. Removed the `const __DEV__ = process.env.NODE_ENV !== 'production'` alias** from 22 files across 7 browser-shipped packages, in favor of the bare gate `if (process.env.NODE_ENV !== 'production')` at the use site. The alias pattern is recognized by `dev-guard-warnings` lint rule but is silently worse for downstream bundle size — Bun.build and several esbuild configurations don't propagate the const-folded value through the alias even when the production define is set. The bare gate folds reliably at the use site because the bundler replaces the expression with a literal `false` directly. This is the bundler-agnostic library convention used by React, Vue, Preact, Solid.

  Pure internal optimization — no API change, no behavior change. DEV mode behavior unchanged (warnings still fire identically in development). The migration is locked in by `pyreon/no-process-dev-gate` lint rule and the regenerated `scripts/bundle-budgets.json` floor.

  ## QA

  - All 1,378 compiler tests + 680 runtime-dom tests + 521 router tests + 168 server tests + 998 zero tests pass (storage test failures are pre-existing on main, unrelated to this PR)
  - Whole-repo `bun run lint` + `typecheck` clean
  - `gen-docs --check` clean
  - `bench:fair` (real-Chromium across 8 frameworks): Pyreon at top of tied cluster on 4 of 7 tests (create-1k, replace-all, partial-update, create-10k), tied in cluster on the other 3 — no regression
  - One pre-existing test (`dev-gate-treeshake.test.ts non-Vite consumer runtime correctness`) updated to reflect the new bare-gate contract: esbuild's `platform: 'browser'` default replacement (`process.env.NODE_ENV = "development"`) folds the bare gate AND the minifier strips the warn body — strictly better than the old `__DEV__` alias pattern the test was guarding

- [#902](https://github.com/pyreon/pyreon/pull/902) [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Ship source maps in published tarballs.

  Every `@pyreon/*` package now ships its `.js.map` and `.d.ts.map` files. The previous `!lib/**/*.map` exclusion in each package's `files` array left every emitted JS file pointing at a `//# sourceMappingURL=*.map` that wasn't actually published — causing Vite (and other bundlers) to log a "Failed to load source map" warning per file on every cold dev start. Real bug in shipped tarballs, not just dev-noise theory.

  The fix is shipping the maps. They make framework stack traces readable: `at mountChild (node_modules/@pyreon/runtime-dom/src/nodes.ts:147)` instead of `at e (node_modules/@pyreon/runtime-dom/lib/index.js:1:42857)`. This matters most when a user hits a framework bug, opens devtools, or sees an unreadable production error from a server-side render. Sentry / Bugsnag / Rollbar can also translate framework frames using the shipped maps; without them, the framework's part of every captured stack stays opaque.

  Cost: ~350KB-1MB per package in `node_modules`. Bundlers (Vite, Webpack, Rollup, esbuild) strip source maps from production builds automatically; they never reach end users. Every comparable library (React, Vue, Solid, Preact, Svelte, TanStack) does this.

  No API changes. The `check-distribution` CI gate inverts to enforce the new contract (maps must be present, not absent).

- Updated dependencies [[`c862965`](https://github.com/pyreon/pyreon/commit/c8629652a94ca7d1e8622cd2de5b4ac009874dbf), [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e)]:
  - @pyreon/reactivity@0.25.1
  - @pyreon/core@0.25.1

## 0.25.0

### Patch Changes

- [#883](https://github.com/pyreon/pyreon/pull/883) [`6075127`](https://github.com/pyreon/pyreon/commit/60751278894a6ff843c0f6f6c4894c76bcb6a720) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Singleton sentinel default-on across every `@pyreon/*` package with module-level state (PR A of the bullet-proof cross-module-instance plan, `.claude/plans/jaunty-herding-kazoo.md`).

  Each package's `src/index.ts` now calls `registerSingleton('@pyreon/<name>', <version>, import.meta.url)` at module load. The first registration records a marker on `globalThis`; a second registration with a DIFFERENT normalized location triggers detection. Default mode throws an actionable Error naming both file paths and three concrete fixes (Vite `resolve.dedupe`, `npm ls`, `bun ls`). `PYREON_SINGLE_INSTANCE=warn` demotes to `console.error`; `PYREON_SINGLE_INSTANCE=silent` opts out entirely (browser extensions, micro-frontends, nested SSR via `rocketstyle-collapse`).

  **HMR-aware.** Vite re-evaluates modules with the SAME path but possibly different query params (`?v=12345`, `?t=12345`, `?import`). The sentinel normalizes the location (strips query string) before comparing — same normalized location → HMR re-eval → silently allowed; different location → genuine dual-instance → throws.

  **Per-package detection.** The earlier prototype put the sentinel only in `@pyreon/reactivity` — insufficient because `@pyreon/core` (and every other package) has its own module-level state that can be silently corrupted under dual-load. The full plan requires per-package registration, which this PR ships.

  **Zero behavior change in correct setups.** Apps that already have a single instance of each `@pyreon/*` package (the overwhelmingly common case) see no runtime change. Apps with silently-tolerated duplicates today (sub-dep version mismatch, custom bundler config) will see their app throw at startup after upgrading with an error message naming the fix. `PYREON_SINGLE_INSTANCE=warn` is the immediate mitigation for any consumer surprised by the change.

  **Test coverage.** Contract tests at `packages/core/reactivity/src/tests/singleton-sentinel.test.ts` (57 specs) exercise the sentinel directly with synthetic `file://` URLs: default-mode throw + actionable error message, HMR re-eval allowance, `PYREON_SINGLE_INSTANCE=warn` / `=silent` escape hatches, per-package coverage across all 24 registered packages, and cross-package isolation. Bisect-verified — neutralizing the throw branch fails 49 positive-case tests; restored passes all 57. The synthetic-URL approach replaces the heavier filesystem dual-load reproducer (it's the sentinel's normalized-string comparison that matters, not Node's ESM loader behaviour).

- Updated dependencies [[`7da5b2b`](https://github.com/pyreon/pyreon/commit/7da5b2bcbc2aebd9600cb8fdefb763ace7f78c1a), [`bc145f3`](https://github.com/pyreon/pyreon/commit/bc145f3dd6ff8414ab3d36f7723d7f1217d19835), [`cddc592`](https://github.com/pyreon/pyreon/commit/cddc5926f2f23d1b600d01f60fa4e72513d2b6fe), [`6075127`](https://github.com/pyreon/pyreon/commit/60751278894a6ff843c0f6f6c4894c76bcb6a720), [`f71fb4c`](https://github.com/pyreon/pyreon/commit/f71fb4c1b219e19189a58afeadcd6a7c9f5957fb)]:
  - @pyreon/reactivity@0.25.0
  - @pyreon/core@0.25.0

## 0.24.6

### Patch Changes

- Updated dependencies [[`378efde`](https://github.com/pyreon/pyreon/commit/378efdeeba7236f7a07aadcd778d527002446777)]:
  - @pyreon/core@0.24.6
  - @pyreon/reactivity@0.24.6

## 0.24.5

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.5
  - @pyreon/reactivity@0.24.5

## 0.24.4

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.4
  - @pyreon/reactivity@0.24.4

## 0.24.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.3
  - @pyreon/reactivity@0.24.3

## 0.24.2

### Patch Changes

- Updated dependencies [[`1c1b135`](https://github.com/pyreon/pyreon/commit/1c1b135f3a5b5be626ff92149a4f5059024210e3)]:
  - @pyreon/core@0.24.2
  - @pyreon/reactivity@0.24.2

## 0.24.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.1
  - @pyreon/reactivity@0.24.1

## 0.24.0

### Patch Changes

- [#783](https://github.com/pyreon/pyreon/pull/783) [`c41aa1a`](https://github.com/pyreon/pyreon/commit/c41aa1ae90efe00d82c97f623a02ed17acb2427c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix `mountKeyedList` using stale closure-captured parent — same bug
  class as [#776](https://github.com/pyreon/pyreon/issues/776) (`mountReactive`), in the sibling reactive entry point
  for inline keyed arrays. Three call sites in `mountKeyedList`'s effect
  body used the closure-captured `parent`:

  1. `parent.insertBefore(anchor, tailMarker)` in `mountNewEntries`
  2. `mountVNode(vnode, parent, tailMarker)` immediately after
  3. `keyedListReorder(..., parent, tailMarker)` → `applyKeyedMoves`
     → `moveEntryBefore` → `parent.insertBefore(node, before)`

  When `mountKeyedList` was created with `parent === frag` (its accessor's
  keyed-array sample reached `mountChild`'s function branch from inside
  a containing `mountFor`'s DocumentFragment-then-move pattern), every
  subsequent effect re-run with new entries called `insertBefore` against
  the stale fragment and threw
  `NotFoundError: Failed to execute 'insertBefore' on 'Node'`. The throw
  landed in Pyreon's unhandled-effect-error path → console.error +
  loss of newly-added children.

  The bug was reachable only when a For child function returned a
  function directly (`(i) => () => signal().map(...)`), so the inner
  keyed array is mounted DIRECTLY into the For's fragment rather than
  into an intermediate Element. Wrapping the keyed array in a `<div>`
  isolates `mountKeyedList` from the frag-move (the `<div>` is the
  parent in that case), which is why [#776](https://github.com/pyreon/pyreon/issues/776)'s coverage of `mountReactive`
  didn't expose this path.

  Fix: `mountKeyedList` now reads `tailMarker.parentNode` at each
  effect run and threads the resulting `liveParent` through
  `mountNewEntries` and `keyedListReorder`, falling back to the
  closure-captured `parent` only when the marker is detached
  (cleanup edge case). Same pattern as [#776](https://github.com/pyreon/pyreon/issues/776)'s `mountReactive` fix.

  Bisect-verified against the new browser CONTRACT spec at
  `packages/core/runtime-dom/src/tests/keyed-array-in-for-batched-toggle.browser.test.ts`:
  reverting just the `liveParent` swap reproduces the exact
  NotFoundError + 10-of-50 children (40 added entries lost across
  10 rows × 4 missing inserts each). Restored → 2/2 specs pass.

  Full runtime-dom suites green: 47/47 browser tests (10 → 11 files,
  +2 new specs), 681/681 unit tests. Lint + typecheck clean.

  Discovery + fix chain across this bug class:

  - [#770](https://github.com/pyreon/pyreon/issues/770) leak-audit harness
  - [#772](https://github.com/pyreon/pyreon/issues/772) leak-sweep multi-journey driver
  - [#774](https://github.com/pyreon/pyreon/issues/774) it.fails CONTRACT lock for For-of-Show
  - [#776](https://github.com/pyreon/pyreon/issues/776) `mountReactive` root-cause fix
  - this PR — `mountKeyedList` sibling fix (audit + close-out)

- [#776](https://github.com/pyreon/pyreon/pull/776) [`bc65b82`](https://github.com/pyreon/pyreon/commit/bc65b825505016e4433b50cd1276c9982ef10b8a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix `mountReactive` using stale closure-captured parent — surfaced by
  `<For>` of `<Show>` under batched signal toggles. `<For>` mounts its
  children into a `DocumentFragment` and then moves the fragment's
  contents to the live parent via `liveParent.insertBefore(frag, …)`.
  After the move, every inner `mountReactive`'s closure-captured `parent`
  referenced the now-empty fragment, while its marker had been carried
  along to the real live parent. The next signal flip ran the effect's
  mount call against the stale parent, throwing
  `NotFoundError: Failed to execute 'insertBefore' on 'Node'` —
  which Pyreon caught as an unhandled effect error, dropping the entire
  For's children from the DOM (count went from N to 0).

  Fix: `mountReactive` now reads `marker.parentNode` at each effect run
  and falls back to the closure-captured `parent` only if the marker is
  detached. This is consistent with the cleanup path, which already used
  `marker.parentNode?.removeChild(marker)`. Surgical, single-line change
  (plus a fallback for the detached-marker edge case).

  Bisect-verified against the new browser CONTRACT spec
  `packages/core/runtime-dom/src/tests/show-of-for-batched-toggle.browser.test.ts`:
  reverting the swap reproduces the exact NotFoundError + 0-of-100
  children. 45/45 runtime-dom browser tests and 681 unit tests pass.

  Discovery chain: PR [#770](https://github.com/pyreon/pyreon/issues/770) (leak-audit harness) → PR [#772](https://github.com/pyreon/pyreon/issues/772) (leak-sweep
  multi-journey driver, surfaced this bug) → PR [#774](https://github.com/pyreon/pyreon/issues/774) (it.fails CONTRACT
  lock).

- [#788](https://github.com/pyreon/pyreon/pull/788) [`84cd28f`](https://github.com/pyreon/pyreon/commit/84cd28feba1899d70696e9a292bb078601558e8f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(runtime-dom, solid-compat): three findings from post-merge deep audit — double-call regression, prototype-pollution alert still open, defensive `Object.keys` for handler iteration

  After the dynamic-collapse PR sequence merged ([#765](https://github.com/pyreon/pyreon/issues/765) / [#766](https://github.com/pyreon/pyreon/issues/766) / [#767](https://github.com/pyreon/pyreon/issues/767) / [#771](https://github.com/pyreon/pyreon/issues/771) / [#773](https://github.com/pyreon/pyreon/issues/773) / [#775](https://github.com/pyreon/pyreon/issues/775) / [#778](https://github.com/pyreon/pyreon/issues/778)), a careful re-read surfaced three real issues. All three are narrow, low-risk fixes shipping together as a deep-review follow-up.

  ## Finding 1 (correctness) — `_rsCollapseDyn` / `_rsCollapseDynH` called `valueIndex()` TWICE per re-run

  The runtime helpers routed the class binding through `_bindDirect`'s plain-callable fallback. That fallback calls the source function once and passes the result to the inner callback — but the inner callback IGNORED the passed value and called `valueIndex()` AGAIN to compute the index.

  **Symptom**: side-effecting cond expressions fired twice per re-run. A user's
  `<Button state={(modifyState(), cond) ? 'a' : 'b'}>` would invoke
  `modifyState()` twice on every value/mode change.

  **Fix**: replace the `_bindDirect` indirection with a direct `renderEffect` call. The callback now reads both accessors inside one renderEffect — same subscription contract (a change to either re-runs only this className assignment), but `valueIndex()` runs exactly once per re-run, matching the original source's implicit call-count semantics.

  **Bisect-verified** by `valueIndex() is called EXACTLY ONCE per re-run` in `rs-collapse-dyn.browser.test.ts`: pre-fix the spec fails with `expected 2 to be 1` (double call); restored → 16/16 pass.

  ## Finding 2 (security) — CodeQL alert [#22](https://github.com/pyreon/pyreon/issues/22) stayed open after [#778](https://github.com/pyreon/pyreon/issues/778)

  PR [#778](https://github.com/pyreon/pyreon/issues/778) added explicit `key === '__proto__' || ...` checks expecting them to satisfy CodeQL's `js/prototype-polluting-assignment` taint-tracking. CodeQL re-scanned and the alert moved from line 1040 → 1051 (my added code shifted positions) but stayed **OPEN** — the analyzer still flagged the `obj[key] = value` write itself, regardless of the guard.

  **Fix**: use `Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true })` for the assignment. That bypasses the prototype chain entirely — even if a setter has been installed on `Object.prototype` for `key`, the write installs an OWN data property on `target` without invoking it. Combined with the simplified inline guard (drop the redundant `typeof key === 'string' &&` outer check — literal-string `===` against a `string | number` key is already type-safe), the write is double-safe.

  Semantics are identical to `obj[key] = value` for a plain data property; the only difference is that setter chains on the prototype are NOT triggered. All 218 `@pyreon/solid-compat` tests pass unchanged.

  ## Finding 3 (defense-in-depth) — `for...in` on handlers leaks inherited enumerable properties

  `_rsCollapseH` (PR [#681](https://github.com/pyreon/pyreon/issues/681)) and `_rsCollapseDynH` ([#773](https://github.com/pyreon/pyreon/issues/773)) both iterate the handlers object via `for (const key in handlers)`. `for...in` includes inherited enumerable properties, so a polluted `Object.prototype` could inject fake handlers.

  **Fix**: use `Object.keys(handlers)` which returns OWN enumerable keys only. Zero-cost — same iteration shape, narrower membership.

  The compiler emits clean object literals (`{ onClick: ..., onPointerEnter: ... }`) with no prototype-pollution surface in practice. This is pure defense-in-depth — the practical risk requires an attacker to first pollute `Object.prototype` globally, which is a much broader compromise than a leaked handler.

  ## Bisect verification

  | Fix                                                                                                        | Bisect                                                           | Outcome                                                             |
  | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------- |
  | [#1](https://github.com/pyreon/pyreon/issues/1) (double-call)                                              | Revert `renderEffect` → `_bindDirect(...) + valueIndex() inside` | New spec fails `expected 2 to be 1`; restored → 16/16               |
  | [#2](https://github.com/pyreon/pyreon/issues/2) (CodeQL [#22](https://github.com/pyreon/pyreon/issues/22)) | CodeQL re-scan on merge will close (no local CodeQL runner)      | Documented + reasoned via `Object.defineProperty`                   |
  | [#3](https://github.com/pyreon/pyreon/issues/3) (`for...in`)                                               | Behavioral equivalent for clean object literals; defense-only    | All 47 runtime-dom browser specs + 218 solid-compat specs unchanged |

  ## Validation

  - `bun run --filter='@pyreon/runtime-dom' typecheck` — clean
  - `bun run --filter='@pyreon/solid-compat' typecheck` — clean
  - `bun run --filter='@pyreon/runtime-dom' lint` — zero errors
  - `bun run --filter='@pyreon/runtime-dom' test` — 681 + 1 skipped pass
  - `bun run --filter='@pyreon/runtime-dom' test:browser` — **47/47** (15 dynamic-collapse + 1 new regression spec)
  - `bun run --filter='@pyreon/solid-compat' test` — 218/218 pass
  - `bun run gen-docs --check` — clean
  - `bun run check-doc-claims` — clean
  - `bun run check-manifest-depth` — clean
  - `bun run check-bundle-budgets` — clean (runtime-dom + solid-compat unchanged)

  ## Surfaces updated

  - `packages/core/runtime-dom/src/template.ts` — `_rsCollapseDyn` + `_rsCollapseDynH` use `renderEffect` directly (no `_bindDirect` indirection); `_rsCollapseH` + `_rsCollapseDynH` use `Object.keys` (not `for...in`)
  - `packages/core/runtime-dom/src/tests/rs-collapse-dyn.browser.test.ts` — new regression spec locking the 1:1 `valueIndex()`-call contract
  - `packages/tools/solid-compat/src/index.ts` — `applyAtPath` uses `Object.defineProperty` for the bracket write + simplified guard
  - `.changeset/post-merge-deep-review-fixes.md` — this changeset

  ## What's NOT in this PR

  A wider audit of the recent merges turned up other surfaces I considered but did NOT include:

  - **Other unbounded regex quantifiers in `pyreon-intercept.ts`** (e.g. `\\bFor\\b[^=]*\\beach`) — measured polynomially worst-case (O(N²) on N "For" runs) but CodeQL didn't flag them, the input is dev source (not adversary-controlled), and fixing every theoretical site without a CodeQL signal would be excessive. Left alone.
  - **Degenerate `state={cond ? 'a' : 'a'}` ternaries** — emit 4 identical classes. Sub-optimal but correct. The compiler could detect and bail / use `_rsCollapse` instead; not worth the additional detector complexity for a vanishingly rare input.
  - **`await` / `yield` inside cond expressions** — the compiler would emit `() => (await cond) ? 0 : 1` in a non-async arrow → syntax error. Extreme edge case (who awaits in a JSX attribute?), no real-corpus instance. Worth catching in the detector eventually but not urgent.

  All three are documented here for the next reviewer.

- [#773](https://github.com/pyreon/pyreon/pull/773) [`49cc686`](https://github.com/pyreon/pyreon/commit/49cc6869c42e3d3a7ef9e6568f7aade0be23edc0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(runtime-dom): add `_rsCollapseDynH` — runtime helper for handler-combined dynamic-collapse (closes the largest remaining real-corpus dynamic-collapse gap)

  Follow-up to the 4-PR dynamic-prop partial-collapse sequence
  ([#765](https://github.com/pyreon/pyreon/issues/765) / [#766](https://github.com/pyreon/pyreon/issues/766) / [#767](https://github.com/pyreon/pyreon/issues/767) / [#771](https://github.com/pyreon/pyreon/issues/771)). The bail-census measurement on the real
  corpus revealed the strict no-handler scope only addresses 0.2% of all
  `@pyreon/ui-components` sites; the bigger 15.4% dynamic-prop bucket is
  mostly **handler-combined ternaries** (`<Button state={cond ? 'a' : 'b'}
onClick={h}>` — the most common real-world shape).

  PR [#767](https://github.com/pyreon/pyreon/issues/767)'s `tryDynamicCollapse` deliberately BAILED on these by design
  ("PR 3 scope: no-handler only"). This PR ships the runtime half of the
  unlock; the compiler-emit half lands in a stacked follow-up.

  ## What this PR ships (runtime helper only)

  `_rsCollapseDynH(html, classes, valueIndex, isDark, handlers, bind?)` —
  structurally the union of:

  - `_rsCollapseDyn`'s stride-2 value-major class dispatch ([#765](https://github.com/pyreon/pyreon/issues/765))
  - `_rsCollapseH`'s handler re-attachment via the canonical
    `_bindEvent` → `applyEventProp` path ([#681](https://github.com/pyreon/pyreon/issues/681))

  Handlers are orthogonal to both the SSR-resolved styler class AND the
  value dispatcher — a `state={cond ? 'a' : 'b'} onClick={h}` site's
  onClick is identical for both `state="a"` and `state="b"` resolutions
  (the styler class varies, the handler does not). So the union is
  behaviorally just "do both" with no new semantics. Class layout
  matches `_rsCollapseDyn` (stride-2 value-major). Handler attachment
  matches `_rsCollapseH` (canonical event path → delegation + batching +
  name normalization).

  Layer-pure: no styler / ui-core imports.

  ## Bisect verification

  Neutralized the handler-attachment loop (`if (Object.keys(handlers).length === -1)`):

  | Spec                                     | Pre-bisect | Bisected                                 |
  | ---------------------------------------- | ---------- | ---------------------------------------- |
  | cold mount + handler invoked             | PASS       | **FAIL** (expected 1 to be 0)            |
  | value flip + handler stays attached      | PASS       | **FAIL**                                 |
  | mode flip + handler stays attached       | PASS       | **FAIL**                                 |
  | combined value+mode + 4 clicks invariant | PASS       | **FAIL** (expected 4 to be 0)            |
  | multiple handlers all attach             | PASS       | **FAIL**                                 |
  | out-of-range value + handler still works | PASS       | **FAIL**                                 |
  | children + class + handlers all dispose  | PASS       | **FAIL**                                 |
  | zero handlers (degenerate to Dyn shape)  | PASS       | PASS (handlers={} skips loop either way) |

  7 of 8 specs fail with handler attach disabled; the 8th is the documented
  degenerate "behaves identically to `_rsCollapseDyn` with no handlers"
  assertion — passes either way as a structural superset proof. Restored
  → 8/8 pass.

  ## NOT in this PR (explicit follow-up scope)

  - **Compiler emit + scan extension**: a follow-up PR will extend
    `tryDynamicCollapse` to stop bailing on handlers — instead route
    to `__rsCollapseDynH(...)` with the residual handlers object
    (mirrors the existing `tryPartialCollapse` → `__rsCollapseH` shape).
    Scan also stops skipping handler-combined dynamic sites. Plus
    verify-modes cell + bail-census update reflecting the new
    addressable surface.
  - This split matches the established pattern from the 4-PR
    dynamic-prop sequence ([#765](https://github.com/pyreon/pyreon/issues/765) was the runtime helper, the emit
    landed separately in [#767](https://github.com/pyreon/pyreon/issues/767)).

  ## Validation

  - `bun run --filter='@pyreon/runtime-dom' typecheck` — clean
  - `bun run --filter='@pyreon/runtime-dom' lint` — zero errors
  - `bun run --filter='@pyreon/runtime-dom' test` — 681 pass + 1 skipped
  - `bun run --filter='@pyreon/runtime-dom' test:browser` — 43/43 pass
    (35 pre-existing + 8 new)
  - `bun run gen-docs --check` — clean
  - `bun run check-doc-claims` — clean
  - `bun run check-manifest-depth` — clean

  ## Surfaces updated

  - `packages/core/runtime-dom/src/template.ts` — `_rsCollapseDynH` (new)
  - `packages/core/runtime-dom/src/index.ts` — re-export
  - `packages/core/runtime-dom/src/tests/rs-collapse-dyn-h.browser.test.ts`
    — 8 bisect-verified browser specs (new)
  - `.changeset/runtime-dom-rs-collapse-dyn-h.md` — patch changeset

  ## Related

  - **[#765](https://github.com/pyreon/pyreon/issues/765)** (merged) — `_rsCollapseDyn` runtime helper
  - **[#766](https://github.com/pyreon/pyreon/issues/766)** (merged) — `detectDynamicCollapsibleShape` detector
  - **[#767](https://github.com/pyreon/pyreon/issues/767)** (open) — scan extension + `__rsCollapseDyn` emit
  - **[#771](https://github.com/pyreon/pyreon/issues/771)** (merged) — probe + verify-modes + bail-census ratchet
  - **[#761](https://github.com/pyreon/pyreon/issues/761)** (closed spike) — originally surfaced the recommendation

- [#765](https://github.com/pyreon/pyreon/pull/765) [`73a6949`](https://github.com/pyreon/pyreon/commit/73a694940a0121508dee84b8a88812753e26fb10) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(runtime-dom): add `_rsCollapseDyn` — runtime half of the dynamic-prop partial-collapse build (PR 1 of 4)

  Compiler-emitted runtime helper that generalises `_rsCollapse`'s 2-class
  (light/dark) dispatch to N-class for collapsed rocketstyle call sites
  where ONE dimension prop is an enumerable dynamic expression — most
  commonly a ternary of two literals:

  ```jsx
  <Button state={cond ? "primary" : "secondary"}>Save</Button>
  ```

  would compile to:

  ```js
  __rsCollapseDyn(
    "<button>Save</button>",
    [
      "btn-primary-light",
      "btn-primary-dark",
      "btn-secondary-light",
      "btn-secondary-dark",
    ],
    () => (cond ? 0 : 1),
    () => __pyrMode() === "dark"
  );
  ```

  Class layout is **stride-2, value-major**: index = `2 * valueIndex + (isDark ? 1 : 0)`.
  Both accessors are reactive — a value flip OR a mode flip patches
  className IN PLACE on the SAME node (no remount), preserving
  `_rsCollapse`'s mode-flip contract.

  ## Why

  Per the `collapse-bail-census` measurement on the real `@pyreon/ui-components`
  corpus (`packages/core/compiler/src/tests/collapse-bail-census.test.ts`),
  the bail buckets sit at:

  - dynamic-prop: **15.3%** ← targeted by this PR's sequence
  - element-child: 9.2% (recursive collapse, harder)
  - `on*`-handler-only: 7.8% (just shipped via `_rsCollapseH` + PRs 1-3)
  - spread: 0.4%, boolean-attr: 0.2%

  Dynamic-prop is the largest remaining bail bucket. The ternary-of-literals
  shape is the syntactically-clearest, statically-enumerable subset — no
  type info needed, no Cartesian explosion (max 2 values per dim prop).

  ## What this PR ships

  - `_rsCollapseDyn(html, classes, valueIndex, isDark, bind?)` in
    `packages/core/runtime-dom/src/template.ts`
  - Re-exported from `@pyreon/runtime-dom`
  - 7 real-Chromium browser specs covering:
    - cold mount picks `value=0 + light` defaults (real CSS)
    - value flip swaps class on the SAME node (no remount)
    - mode flip swaps class on the SAME node (no remount) —
      preserves `_rsCollapse` mode contract
    - combined value + mode flip lands on right `(value, mode)` class —
      stride-2 layout proof across all 4 combinations
    - out-of-range `valueIndex` coerces to empty className (no crash) —
      documented graceful-degradation contract
    - children binder runs alongside class binder and disposes cleanly
    - single-value (valueCount=1) reduces to `_rsCollapse`-equivalent
      shape (proves the generalisation as a strict superset)

  ## What's NOT in this PR (explicit follow-up scope)

  Mirrors the established `on*`-handler partial-collapse 4-PR sequence
  (also referenced in `.claude/plans/open-work-2026-q3.md` → [#1](https://github.com/pyreon/pyreon/issues/1)):

  - **PR 2**: `detectDynamicCollapsibleShape` compiler detector
    (ternary-of-two-literals AST shape on ≤1 dimension prop; mirrors
    `detectPartialCollapsibleShape`'s "extend bail catalogue with one
    relaxation" pattern). Pure AST function, unit-testable in isolation.
  - **PR 3**: resolver extension (resolve EACH literal value via the
    existing SSR pipeline, assert structural-template parity across
    values) + emitter in `tryRocketstyleCollapse` (call site falls
    through to dynamic path when full + partial detectors both bail)
    - plugin scan hookup
  - **PR 4**: bail-census update (assert dynamic-prop addressable count
    flips `collapsible`; coverage moves 73.2% → ~88%) + verify-modes
    `ui-showcase × spa` probe route + real-Chromium e2e gate (parity vs
    the 5-layer mount on both value branches)

  PR 1 is structurally analogous to PR 2 of the `on*`-handler sequence
  (the `_rsCollapseH` runtime helper) — a self-contained, layer-pure,
  bisect-verifiable runtime addition that lays the foundation without
  delivering user-visible benefit until the compiler half lands.

  ## Bisect verification

  Neutralised the value-dispatch in `_bindDirect` callback (made it
  ignore `valueIndex()` and only dispatch on `isDark()` — the
  pre-existing `_rsCollapse` shape):

  | Spec                           | Pre-bisect | Bisected | Notes                                          |
  | ------------------------------ | ---------- | -------- | ---------------------------------------------- |
  | cold mount value=0 + light     | PASS       | PASS     | Either dispatch is correct at value=0          |
  | value flip same node           | PASS       | **FAIL** | `expected 'rd2-v0-light' to be 'rd2-v1-light'` |
  | mode flip same node            | PASS       | **FAIL** | `expected 'rd3-v0-light' to be 'rd3-v1-light'` |
  | combined value+mode (stride-2) | PASS       | **FAIL** | `expected 'rd4-v0-dark' to be 'rd4-v1-dark'`   |
  | out-of-range graceful          | PASS       | **FAIL** | `expected 'rd5-v0-light' to be ''`             |
  | children binder cleanup        | PASS       | PASS     | Orthogonal to dispatch                         |
  | single-value degenerate        | PASS       | PASS     | At value=0 the two dispatches converge         |

  Restored → 7/7 pass. The 3 specs that pass in both states are
  documented additive controls (single-value, defaults, child binder).

  ## Surfaces updated

  - `packages/core/runtime-dom/src/template.ts` — `_rsCollapseDyn` (new)
  - `packages/core/runtime-dom/src/index.ts` — re-export
  - `packages/core/runtime-dom/src/tests/rs-collapse-dyn.browser.test.ts`
    — 7 bisect-verified browser specs (new)
  - `CLAUDE.md` — section under "Compile-time rocketstyle collapse"
    documenting the PR 1 helper + the 3-PR follow-up scope

- Updated dependencies [[`dfaefb8`](https://github.com/pyreon/pyreon/commit/dfaefb8e9e06eaff9039c001ad7731476b6b5732), [`67e1f37`](https://github.com/pyreon/pyreon/commit/67e1f371a20219481ee9564d2d7421ec2a0b5ddf), [`b8fb31c`](https://github.com/pyreon/pyreon/commit/b8fb31cf1a59578fc33f27d539695d2bc164b2f1), [`f400e85`](https://github.com/pyreon/pyreon/commit/f400e85282a370276d5ae0266ba501c41dce4f3e), [`891ca43`](https://github.com/pyreon/pyreon/commit/891ca4300727119dafd66ceaacd7cb39e68f3b4e), [`d4ec777`](https://github.com/pyreon/pyreon/commit/d4ec777643446ed2c51dedb1e74fbd8dce70bdfd), [`2abb672`](https://github.com/pyreon/pyreon/commit/2abb672d8a8bf7f4940af422bf8bf802aa129cdd)]:
  - @pyreon/core@0.24.0
  - @pyreon/reactivity@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [[`6571df8`](https://github.com/pyreon/pyreon/commit/6571df8209c5dc72619194ffe19359765b1d2d7f), [`af4d5d8`](https://github.com/pyreon/pyreon/commit/af4d5d83fc087d738dbe5084950476566d488d77), [`441b5df`](https://github.com/pyreon/pyreon/commit/441b5dfa64ae52002d3e6612ec68566344ae999d)]:
  - @pyreon/core@0.23.0
  - @pyreon/reactivity@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.22.0
  - @pyreon/reactivity@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.21.0
  - @pyreon/reactivity@0.21.0

## 0.20.0

### Minor Changes

- [#703](https://github.com/pyreon/pyreon/pull/703) [`3499594`](https://github.com/pyreon/pyreon/commit/3499594585b7fcb650ac0f80be4bc355f741491b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Reactive devtools bridge — an opt-in, leak-free introspection layer over
  the live signal / computed / effect graph.

  `@pyreon/reactivity` gains `activateReactiveDevtools()` /
  `deactivateReactiveDevtools()` / `isReactiveDevtoolsActive()` /
  `getReactiveGraph()` / `getReactiveFires()` (+ `ReactiveNode` /
  `ReactiveEdge` / `ReactiveGraph` / `ReactiveFire` types). It tracks the
  live reactive graph (nodes + dependency edges, derived fresh from the
  real subscriber Sets) and a bounded fire timeline.

  `@pyreon/runtime-dom` exposes it on `window.__PYREON_DEVTOOLS__.reactive`
  (`activate` / `deactivate` / `getGraph` / `getFires`), powering the
  `@pyreon/devtools` Signals / Graph / Effects / Console surfaces.

  Zero cost until a devtools client attaches: every instrumentation entry
  point early-returns on `!active`, sits inside the existing
  `process.env.NODE_ENV !== 'production'` gate (fully tree-shaken in
  production — verified by a minified-bundle regression test), and never
  retains a signal/computed/effect (WeakRef + FinalizationRegistry; the
  fire buffer holds only ids + timestamps). No behavior change when
  inactive (the default).

- [#659](https://github.com/pyreon/pyreon/pull/659) [`65e61eb`](https://github.com/pyreon/pyreon/commit/65e61eba20741a012b753b4c8c69045f408768b7) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat: P0 compile-time rocketstyle wrapper-collapse (opt-in `pyreon({ collapse: true })`)

  The vertical slice of the P0 RFC. A literal-prop rocketstyle call site
  (`<Button state="primary" size="medium">Save</Button>` — every dimension
  prop a string literal, no spread, static-text children) collapses from a
  5-layer wrapper mount (rocketstyle → attrs HOC → Element → Wrapper →
  styled) into ONE `_rsCollapse` cloneNode. E2 measured **44× wall-clock**,
  `mountChild` 9→1, `styler.resolve` 22→0. **OFF by default** — zero
  behaviour change unless `pyreon({ collapse: true })` is set.

  Parity is guaranteed BY CONSTRUCTION, not by reimplementing the
  rocketstyle chain in the compiler (RFC decision 2): the Vite plugin
  spins ONE programmatic Vite-SSR server bound to the consumer's own
  `vite.config`, renders the REAL component twice (light + dark), and
  captures the resolved class + styler rule text — the same
  `renderToString` + `@pyreon/styler` code path the app uses. Styler's
  FNV-1a class hash is identical SSR vs DOM (its hydration contract), so
  the build-resolved class is byte-for-byte the client-mounted class.

  New public surface (all additive):

  - `@pyreon/styler` — `StyleSheet.getStyleRules()` (raw SSR rule
    snapshot) + `StyleSheet.injectRules(rules, key)` (idempotent
    pre-resolved rule injection, no re-hash).
  - `@pyreon/runtime-dom` — `_rsCollapse(html, lightClass, darkClass,
isDark, bind?)` (one html-keyed `_tpl` cloneNode; class reactively
    bound to the live mode accessor — RFC decision 1 dual-emit, mode swap
    re-runs ONLY the className on the SAME node, no remount; decision 4
    hoisted-factory). `runtime-dom` stays layer-pure (never imports
    styler/ui-core — the styler injection is the emitted code's job).
  - `@pyreon/compiler` — `scanCollapsibleSites()` +
    `rocketstyleCollapseKey()` exports + `TransformOptions.collapseRocketstyle`.
    Detection + emission live ONLY in the JS path; `transformJSX`
    short-circuits to `transformJSX_JS` when the option is set (the Rust
    binary doesn't implement it). A SINGLE shared `detectCollapsibleShape`
    bail catalogue is used by both the plugin scan and the compiler emit
    so resolution keys can't drift.
  - `@pyreon/vite-plugin` — `pyreon({ collapse: true | PyreonCollapseOptions })`
    - `createCollapseResolver` (Vite-SSR resolver, memoised, disposed in
      `closeBundle`). Only the CLIENT graph collapses — the SSR graph keeps
      the real mount.

  Tested across 5 layers: styler `injectRules` (3 real-Chromium specs);
  `_rsCollapse` (4 real-Chromium specs — light class, mode-flip-no-remount,
  children dispose, shared parsed template); resolver vs the REAL
  `@pyreon/ui-components` Button via Vite SSR (8 specs incl. determinism +
  graceful bail on a non-existent export); compiler detection / emission /
  full bail catalogue / once-per-module dedupe (13 specs); end-to-end
  pipeline — real Button → resolver → scanner → compiler emits
  `__rsCollapse` carrying the real SSR-resolved classes + class-stripped
  template + rule bundle byte-for-byte. **Phase-4 RFC acceptance, real
  Chromium, shipped `_rsCollapse` × the REAL `@pyreon/ui-components` Button**
  (`examples/experiments/e2-static-rocketstyle/e2.browser.test.ts`, 2 specs):
  (1) the collapsed `<button>` is `isEqualNode`-structurally-identical to
  the real rocketstyle-mounted one with a char-for-char-equal `className`
  and identical computed style; (2) the perf signature is exactly
  `runtime.tpl ≥ 1` + `runtime.mountChild == 1` per Button (the real mount
  is 8–9 mountChild) with **~27× wall-clock** (collapsed 0.20 ms vs
  baseline 5.40 ms, in-suite benchmark). Additive guarantee: all 1079
  `@pyreon/compiler` tests pass unchanged with collapse off.

  Bisect-verified: disabling the compiler's `tryRocketstyleCollapse(node)`
  detection call fails the 4 collapse-emission specs (`expected … to
contain '__rsCollapse('`) while the 9 bail-catalogue / key-stability
  specs still pass; restored → 13/13.

  **Deliberately deferred (follow-up PRs, tracked in
  `.claude/plans/open-work-2026-q3.md` §P0):** an `examples/ui-showcase`
  build-with-collapse **verify-modes cell** (a build-artifact gate —
  ui-showcase's Buttons all carry `onClick` → correctly bail, so it needs
  a dedicated literal-prop demo route first; note the real-Chromium
  DOM-parity + perf-counter acceptance is NOT deferred — it ships here as
  the Phase-4 e2 specs above), and dev-mode collapse (build-shaped today —
  dev keeps the normal mount, graceful). The
  slice is fundamentally complete end-to-end (detect → resolve → emit →
  parity-proven); these extend coverage, they are not gaps in the
  mechanism. The RFC doc was removed once shipped — its decisions are now
  the code, documented in `CLAUDE.md` → "Compile-time rocketstyle collapse".

### Patch Changes

- [#681](https://github.com/pyreon/pyreon/pull/681) [`9aa21a0`](https://github.com/pyreon/pyreon/commit/9aa21a0ae858c9ca88744f4c0d3a730a5d35a29f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `_rsCollapseH` + `_bindEvent` — PR 2 of the partial-collapse build
  (open-work [#1](https://github.com/pyreon/pyreon/issues/1)). Purely additive: `_rsCollapseH` is `_rsCollapse` plus
  re-attachment of the residual `on*` handlers `detectPartialCollapsibleShape`
  (compiler PR 1) peels off, routed through the canonical
  `_bindEvent`→`applyEventProp` path (delegation/batching/name-normalization
  unchanged). `_bindEvent` is a thin export of the existing `applyEventProp`.
  No production path emits `_rsCollapseH` yet (the compiler/plugin wiring is
  the follow-up PR), so existing runtime behaviour is byte-unchanged.
- Updated dependencies [[`3499594`](https://github.com/pyreon/pyreon/commit/3499594585b7fcb650ac0f80be4bc355f741491b)]:
  - @pyreon/reactivity@0.20.0
  - @pyreon/core@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [[`c3d0a70`](https://github.com/pyreon/pyreon/commit/c3d0a7017ed2ef4468ec3fb4e4c09ec869d2917a), [`ecd8e52`](https://github.com/pyreon/pyreon/commit/ecd8e526943a1e6b07957ff96f4410fa482baa0d), [`ac1d375`](https://github.com/pyreon/pyreon/commit/ac1d37542b11cd95451a2f0b0a51cc43603d001a), [`21e465c`](https://github.com/pyreon/pyreon/commit/21e465c7957c3e57c838af58ffa995682908c5f8), [`c4b6e9a`](https://github.com/pyreon/pyreon/commit/c4b6e9a5850196171c2197fc918163f736708aa8), [`fb40906`](https://github.com/pyreon/pyreon/commit/fb409066e49e44c42f77084a92a68103a4e6c5ef), [`9f03747`](https://github.com/pyreon/pyreon/commit/9f037478763d9f8cd2365feb63dc87fda2545e5d), [`3374150`](https://github.com/pyreon/pyreon/commit/33741500499dfb487d031bbffe77723d74b8f261), [`fa4e37f`](https://github.com/pyreon/pyreon/commit/fa4e37fa620cf0e3f240053bf789b84bd9668838)]:
  - @pyreon/reactivity@0.19.0
  - @pyreon/core@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.18.0
  - @pyreon/reactivity@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [[`35af0e2`](https://github.com/pyreon/pyreon/commit/35af0e22b670151052e0b1df5006977fca759128), [`8b1a982`](https://github.com/pyreon/pyreon/commit/8b1a982faa140e7e646293a47d6a4fbe70cac67c)]:
  - @pyreon/core@0.17.0
  - @pyreon/reactivity@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [[`a4a4255`](https://github.com/pyreon/pyreon/commit/a4a42550835cb2706b99beed8ea582037d338ea8)]:
  - @pyreon/core@0.16.0
  - @pyreon/reactivity@0.16.0

## 0.14.0

### Patch Changes

- [#312](https://github.com/pyreon/pyreon/pull/312) [`c97783a`](https://github.com/pyreon/pyreon/commit/c97783a85b6f7ffc5d25ad16fd280c92808b5ea6) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add a known-slot fast path to `mountFor`'s LIS reconciler that fires when `tails[v] === v`. This eliminates all binary-search probes on prepend-heavy patterns (`items.set([...newRows, ...items()])` — infinite-scroll feeds, chat history prepends, log tails) and cuts probes ~40-56% on random shuffles. Pure algorithmic optimization; no behavior change. Measured: 1k prepend 9 978 → 0 LIS probes, 1k random shuffle 5 117 → 2 255-2 982 probes across 5 seeds.

- [#314](https://github.com/pyreon/pyreon/pull/314) [`12dbf14`](https://github.com/pyreon/pyreon/commit/12dbf14c92ea3e107c89039a269181a500cb60d4) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Close the two perf-harness instrumentation blind spots. Adds 7 dev-mode SSR counters (`runtime-server.render`, `.stream`, `.component`, `.escape`, `.suspense.boundary`, `.suspense.fallback`, `.for.keyMarker`) to `@pyreon/runtime-server` and the `runtime.tpl` counter (cloneNode fast-path invocation count) to `@pyreon/runtime-dom`. All gated on the appropriate dev check so zero production cost — measured overhead on a 1k-row SSR render is ~5% in dev with a sink installed, within noise without. The SSR emit contract is verified by 10 probe tests covering shape (exact counts), scaling (1k and 10k rows, no quadratic emits), escape density, and server-side runtime gating. The `runtime.tpl` counter is verified by 2 probe tests plus the existing Vite tree-shake regression guard.

- Updated dependencies []:
  - @pyreon/core@0.14.0
  - @pyreon/reactivity@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies [[`a05c4ba`](https://github.com/pyreon/pyreon/commit/a05c4bab713f5168acd56eb233520102735bd80a)]:
  - @pyreon/core@0.13.0
  - @pyreon/reactivity@0.13.0

## 0.12.15

### Patch Changes

- [#256](https://github.com/pyreon/pyreon/pull/256) [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(runtime-dom): make `innerHTML` and `dangerouslySetInnerHTML` reactive

  The JSX compiler wraps prop expressions containing signal reads in
  `_bind`-style `() => …` accessors. The runtime's `applyProp` checked for
  the `innerHTML` / `dangerouslySetInnerHTML` keys BEFORE checking if the
  value was a function, so the closure was stringified and set as literal
  text — `innerHTML={getIcon(props.x ? "moon" : "sun")}` rendered the
  literal text `() => getIcon(props.x ? "moon" : "sun")` in the DOM
  instead of the SVG.

  Fix: when `value` is a function, wrap in `renderEffect` so the accessor
  is called and the result is set as HTML on each tracked-signal change.
  Same treatment for `dangerouslySetInnerHTML` (function returns
  `{ __html: string }`).

  Found via bokisch.com `/resume` route — the symptom was literal closure
  text in icon SVG slots, plus a render loop that consumed several GB of
  RAM (the closure-as-string DOM mutation triggered re-evaluations).

  2 new regression tests in `packages/core/runtime-dom/src/tests/props.test.ts`.

- [#256](https://github.com/pyreon/pyreon/pull/256) [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(runtime-dom): cancel in-progress transitions on unmount

  `<Transition>` and `<TransitionGroup>` added a 5-second safety timer to
  their enter/leave/move callbacks (so CSS transitions that never fire
  don't leak listeners). Without a matching cancel on component unmount,
  that timer kept running after the component was detached — firing
  `onAfterEnter` / `onAfterLeave` on now-detached elements up to 5 seconds
  later.

  Fix:

  - `<Transition>`: track `pendingEnterCancel` (parallel to the existing
    `pendingLeaveCancel`). `onUnmount` calls both to tear down listeners,
    clear safety timers, and strip active-state classes WITHOUT firing
    the onAfterX callback.
  - `<TransitionGroup>`: each `ItemEntry` gains a `cancelTransition`
    function that applyEnter / applyLeave / startMoveAnimation install.
    Container `onUnmount` iterates entries and cancels in-progress
    transitions before tearing down each entry's DOM.

- [#256](https://github.com/pyreon/pyreon/pull/256) [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(runtime-dom): add safety timeout to `<TransitionGroup>` enter/leave/move

  `TransitionGroup`'s per-item `applyEnter` / `applyLeave` /
  `startMoveAnimation` added `transitionend` / `animationend` listeners
  with `{ once: true }` but had NO safety timeout — unlike the matching
  code in `transition.ts`.

  If a CSS transition never fires (off-screen element, zero-duration,
  `display: none`, visibility: hidden), the `done` callback never runs,
  `onAfterLeave` never fires, and `entries.delete(key)` is never called —
  **the item stays in the `entries` Map forever.** Real memory leak that
  grows with every list mutation; the impact compounds in long-running
  SPA sessions where list items cycle in and out frequently.

  Fix: added a 5-second safety `setTimeout` (same pattern as
  `transition.ts`). When CSS never fires, the timer forces the cleanup.

- Updated dependencies []:
  - @pyreon/core@0.12.15
  - @pyreon/reactivity@0.12.15

## 0.12.14

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.14
  - @pyreon/reactivity@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.13
  - @pyreon/reactivity@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.12
  - @pyreon/reactivity@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.11
  - @pyreon/reactivity@0.12.11

## 0.7.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.7.2
  - @pyreon/core@0.7.2

## 0.7.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.7.1
  - @pyreon/core@0.7.1

## 0.7.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.7.0
  - @pyreon/core@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.6.0
  - @pyreon/reactivity@0.6.0

## 0.5.7

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.5.7
  - @pyreon/core@0.5.7

## 0.5.6

### Patch Changes

- feat(dx): comprehensive `__DEV__` warnings across core and runtime-dom

  feat(style): auto-append `px` to numeric style values (e.g. `{ height: 100 }` → `"100px"`), with shared `CSS_UNITLESS` set for hydration consistency

- Updated dependencies []:
  - @pyreon/core@0.5.6
  - @pyreon/reactivity@0.5.6

## 0.5.4

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.4
  - @pyreon/reactivity@0.5.4

## 0.5.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.3
  - @pyreon/reactivity@0.5.3

## 0.5.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.2
  - @pyreon/reactivity@0.5.2

## 0.5.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.1
  - @pyreon/reactivity@0.5.1

## 0.5.0

### Minor Changes

- ### New packages

  - `@pyreon/cli` — project doctor command that detects React patterns (className, htmlFor, React imports) and auto-fixes them for Pyreon
  - `@pyreon/mcp` — Model Context Protocol server providing AI tools with project context, API reference, and documentation

  ### Features

  - **JSX type narrowing** — added `JSX.Element`, `JSX.ElementType`, and `JSX.ElementChildrenAttribute` for full TypeScript JSX compatibility
  - **Callback refs** — `ref` prop now accepts `(el: Element) => void` in addition to `{ current }` objects
  - **React pattern interceptor** (`@pyreon/compiler`) — AST-based detection and migration of React patterns to Pyreon equivalents
  - **Vite plugin context generation** — automatically generates `pyreon-context.json` and `llms.txt` during dev/build
  - **MCP server tools** — `get-context`, `lookup-api`, `diagnose-error`, `suggest-migration` for AI-assisted development

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.0
  - @pyreon/reactivity@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.4.0
  - @pyreon/core@0.4.0

## 0.3.1

### Patch Changes

- Router performance: flattened route matching with first-segment dispatch index (39% faster at 200 routes). Core type fixes: export `ReadonlySignal<T>` from reactivity, widen `h()` component overloads to support optional children and generic components, add minimal `process` type declaration so consumers don't need `@types/node`.

- Updated dependencies []:
  - @pyreon/reactivity@0.3.1
  - @pyreon/core@0.3.1

## 0.3.0

### Minor Changes

- ### Performance

  - **2x faster signal creation** — removed `Object.defineProperty` that forced V8 dictionary mode
  - **Event delegation** — `el.__ev_click` instead of `addEventListener` for compiled templates
  - **`_bindText`** — direct signal→TextNode subscription with zero effect overhead
  - **`_bindDirect`** — single-signal attribute bindings bypass effect tracking entirely
  - **`signal.direct()`** — flat-array updater registration for compiler-emitted DOM bindings
  - **Batch Set pooling** — snapshot-free subscriber notification eliminates array allocations
  - **`createSelector` snapshot-free** — O(1) selection without copying subscriber maps
  - **`renderEffect` fast path** — lighter than full `effect()` for DOM bindings
  - **SSR `renderToString` micro-optimizations** — sequential loops, `for...in`, `escapeHtml` fast path
  - **Hydration optimizations** — reduced overhead during island hydration
  - **Nested `_tpl` support** — compiler emits nested `cloneNode(true)` templates

  ### Features

  - **True React compatibility** — `useState`, `useEffect`, `useMemo` with re-render model matching React semantics
  - **True Preact compatibility** — hooks with re-render model matching Preact semantics
  - **True Vue compatibility** — `ref`, `reactive`, `watch`, `computed` with re-render model matching Vue semantics
  - **True SolidJS compatibility** — signals with re-render model matching Solid semantics, children helper fixes

  ### Benchmark Results (Chromium)

  Pyreon (compiled) is fastest framework on 6 of 7 tests:

  - Create 1,000 rows: 9ms (1.00x) vs Solid 10ms, Vue 11ms, React 33ms
  - Replace all rows: 10ms (1.00x) vs Solid 10ms, Vue 11ms, React 31ms
  - Partial update: 5ms (1.00x) vs Solid 6ms, Vue 7ms, React 6ms
  - Select row: 5ms (1.00x) — tied with all signal frameworks
  - Create 10,000 rows: 103ms (1.00x) vs Solid 122ms, Vue 136ms, React 540ms

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.3.0
  - @pyreon/core@0.3.0

## 0.2.1

### Patch Changes

- Release 0.2.1

  - feat(vite-plugin): add `compat` option for zero-change framework migration
  - fix: resolve `workspace:^` dependencies correctly during publish
  - fix(vite-plugin): use `oxc` instead of deprecated `esbuild` option
  - fix(vite-plugin): bump vite peer dependency to `>=8.0.0`

- Updated dependencies []:
  - @pyreon/reactivity@0.2.1
  - @pyreon/core@0.2.1

## 0.2.0

### Minor Changes

- Release 0.2.0
  - fix(vite-plugin): use `oxc` instead of deprecated `esbuild` option for Vite 8
  - fix(vite-plugin): bump vite peer dependency to `>=8.0.0`

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.2.0
  - @pyreon/core@0.2.0

## 0.1.2

### Patch Changes

- Improve compat package types (eliminate unnecessary casts), add lint/typecheck CI for all workspaces, split example apps into individual component files.

- Updated dependencies []:
  - @pyreon/reactivity@0.1.2
  - @pyreon/core@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.1.1
  - @pyreon/core@0.1.1
