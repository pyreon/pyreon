# @pyreon/runtime-server

## 0.36.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.36.0
  - @pyreon/reactivity@0.36.0

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

- [#1650](https://github.com/pyreon/pyreon/pull/1650) [`368a609`](https://github.com/pyreon/pyreon/commit/368a6090c867e2dd6c37413e0656fe57a7e1e63c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Custom-Property Style Extraction (CPSE) — engine + opt-in `cpseStyled` integration

  The fundamental fix for the rocketstyle styling-runtime cost: **decouple a style
  prop's CSS-rule identity from its value identity** so styling cost is flat in
  style-value cardinality (and dynamic values are free), instead of O(distinct
  value tuples). See `.claude/audits/custom-property-style-extraction-2026-06-22.md`.

  **`@pyreon/unistyle` (new, additive):**

  - `styles()` gains an `extractVars` mode — every flat `prop: value` declaration
    becomes a value-agnostic `prop: var(--u-<hash>)` and the value is collected
    into a sink (reuses all of `processDescriptor`'s resolution; structural
    fragments pass through). Absent ⇒ byte-identical to today.
  - `extractStyleVar`, `cpseVarName`, `cpseRewrite` — the extraction primitives.
  - `cpseStyled(tag)` — a styled primitive that applies CPSE: a value-agnostic
    class cached by property-set (N distinct values → ONE class, ONE
    `styler.resolve`) + per-instance inline custom properties; dynamic
    (signal-driven) values patch the inline property with no re-resolve. Opt-in,
    zero blast radius on the existing `styled`/`Element`/`rocketstyle` paths.

  **`@pyreon/runtime-server` (fix):** `normalizeStyle` now preserves CSS
  custom-property names (`--x`) verbatim instead of kebab-casing them — parity
  with the client `applyStyleProp` guard. Closes a latent SSR/client divergence
  for any `--Custom`-cased property (the inline custom properties CPSE emits).

  **Proven:** counter harness asserts O(N)→O(1) (100 distinct values: 100
  resolves + 100 rules classic vs 1 + 1 under CPSE); real-Chromium proves a real
  `cpseStyled` component renders N distinct values from ONE class + ONE resolve,
  with computed-style parity, nesting-safety, and dynamic updates at zero extra
  resolve; SSR parity proven by composition (cpseStyled VNode shape +
  normalizeStyle `--` serialization), each bisect-verified.

  **Staged (not in this release):** the `init({ styleExtraction })` flag +
  auto-migrating the default `styled`/`Element`/`rocketstyle` pipeline (broad
  blast radius — the regression-gated rollout), and responsive-array assembly in
  `cpseStyled` (the engine supports per-breakpoint var naming today).

- Updated dependencies [[`1f29c4b`](https://github.com/pyreon/pyreon/commit/1f29c4b9791e6ad96901ca0e2b90e5335b803895), [`02b77ae`](https://github.com/pyreon/pyreon/commit/02b77aed6b4383554b3458e408b462098fc3e708), [`35d440a`](https://github.com/pyreon/pyreon/commit/35d440a44d92ac913cf19f3f8e21b4603458a165)]:
  - @pyreon/core@0.35.0
  - @pyreon/reactivity@0.35.0

## 0.34.0

### Patch Changes

- [#1601](https://github.com/pyreon/pyreon/pull/1601) [`66d44c5`](https://github.com/pyreon/pyreon/commit/66d44c58920bf81848e9ba858c413a88727a3c65) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Internal: remove provably-unreachable defensive branches + harden test coverage
  (no behavior change).

  `SizedMap.set`'s eviction and `Cell.listen`'s promote-to-Set both guarded a
  value that the surrounding invariant guarantees is always defined
  (`maxEntries >= 1` ⇒ non-empty map on evict; the promote branch only runs when
  a single listener exists). Replaced the dead `!== undefined` / truthy guards
  with a documented type assertion (the codebase's sanctioned pattern for
  provably-safe paths), eliminating uncoverable branches. SizedMap → 100% branch
  coverage; reactivity branch coverage improved. Added selector tests for the
  3rd-subscriber and selection-leaves-a-multi-subscriber-key paths.

  `@pyreon/head`'s `createNewTag` SSR guard is documented + `v8 ignore`d as the
  unreachable defensive guard it is (the only caller, `syncDom`, already returns
  on `document === undefined`); added a node-environment test that exercises the
  true SSR function-input path of `useHead`. head → 100% statements/functions/
  lines, 98.3% branches.

  `@pyreon/primitives`' web `<Button>` drops an uncoverable `?? {}` fallback in
  favor of a documented assertion (the `primary` key is statically defined).
  Added targeted tests for the residual web-primitive branches — plain-value
  (non-signal) `value`/`checked`, the asset-name `src` dispatch, and the defensive
  guard false-paths in Field/Text/Press/WebView. primitives → 100% across all four
  metrics.

  `@pyreon/runtime-server` gains SSR edge-case + dev-mode/prod-mode coverage
  (documenting that `__DEV__` is a module-load constant, so both gate sides need
  separate NODE_ENV runs) and three documented `v8 ignore`s for genuinely-
  unreachable defensive arms (the outside-ALS context-stack fallback, the
  For-symbol function-each the For component pre-resolves, the stream context-store
  nullish fallback). statements/functions/lines → 98%+, branches 88.4% → 95.2%
  (a pre-existing RED branch gate, now green). No behavior change.

  `@pyreon/create-zero`'s `listFiles` walk uses a plain `else` for the
  non-directory case (a template tree is files-or-dirs only — no symlinks), and
  gained `substitute` tests covering the unknown-`{{key}}`-kept-verbatim branch.
  create-zero → 100% statements/functions/lines, 98.7% branches (one defensive
  unreachable branch remains in the dep-version resolver).

- Updated dependencies [[`66d44c5`](https://github.com/pyreon/pyreon/commit/66d44c58920bf81848e9ba858c413a88727a3c65)]:
  - @pyreon/reactivity@0.34.0
  - @pyreon/core@0.34.0

## 0.33.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0

## 0.32.0

### Minor Changes

- [#1466](https://github.com/pyreon/pyreon/pull/1466) [`ae3c3fd`](https://github.com/pyreon/pyreon/commit/ae3c3fd529250e7211657e4283fb5e6c3246bf00) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Streaming SSR no longer FOUCs Suspense-boundary content. `@pyreon/styler`'s `sheet.flushSSRPending()` (new) returns CSS rules collected since the previous flush + advances a watermark; the SSR-only module init registers it on `globalThis.__PYREON_STYLER_FLUSH__`. `@pyreon/runtime-server`'s `renderToStream` calls the hook (a) once after the synchronous shell render — emitting `<style data-pyreon-stream="shell">…</style>` inline at the top of the app body so shell content is styled before any Suspense resolves; (b) inside every `streamSuspenseBoundary`, BEFORE the `<template>`, so each boundary's resolved HTML arrives with its styles already in the page. No hard `runtime-server → styler` dependency (mirrors the `__pyreon_count__` perf-counter and SSG-plugin lookup pattern); the boundary path is a no-op when styler isn't loaded. Bundle cost: ~239 gz across the two packages (+129 styler, +110 runtime-server) — both within budget. Closes the FOUC observable in `examples/cpa-pw-app-solid` (`mode: 'ssr', ssr: { mode: 'stream' }`). Bisect-verified at both layers: 13 sheet unit specs cover the watermark / `@layer` ordering / reset semantics; 7 runtime-server integration specs cover the shell + per-boundary flush ordering, the `</style` escape, the multi-boundary case, and the no-hook graceful no-op. Companion cleanup: stale HMR-staleness comment in `styler/styled.tsx` was rewritten to reflect that the `onSheetClear` subscriber wired at module top already drops the static-VNode cache on `sheet.clearAll()` (the comment documented a gap that had already been closed).

### Patch Changes

- [#1517](https://github.com/pyreon/pyreon/pull/1517) [`510a410`](https://github.com/pyreon/pyreon/commit/510a410f196bb732d963bd357a6bc10993f794fd) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Unified string-mode render pipeline + a shipped `useRequestLocals` fix.

  **New `renderPage()` in `@pyreon/server`** — the one per-page render sequence (preload with `redirect()` catching → render with head collection → CSS-in-JS collect → loader-data script → HTTP status via the `notFoundComponent` chain), now shared by the production handler, zero's SSG prerender entry, and zero's dev SSR middleware. Pre-unification each consumer hand-copied the sequence and the copies drifted (styler tag missing from SSG, dual noindex call sites, serializer divergence). Template composition and streaming stay caller-specific by design.

  **Fixed: request-level `provide()` never reached rendered components.** `renderToString` / `renderToStream` always opened a FRESH ALS context stack, silently discarding every request-level provide — so `provideRequestLocals(ctx.locals)` in the handler never made `useRequestLocals()` resolve anything but the default inside a component, despite the documented contract. Both renderers now INHERIT an active `runWithRequestContext` scope (bare calls keep their fresh isolated stack). Bisect-verified regression specs at both the runtime-server and renderPage layers.

  Dev-SSR behavior change (zero): a loader-thrown `redirect()` in `vite dev` now produces a redirect page (meta-refresh + status) matching production's 302/307 semantics, instead of escaping to the Vite error overlay.

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

- [#1545](https://github.com/pyreon/pyreon/pull/1545) [`d38bed4`](https://github.com/pyreon/pyreon/commit/d38bed4ce425f6fe804e56df84a0e80e6d22a198) Thanks [@vitbokisch](https://github.com/vitbokisch)! - SSR hot-path optimizations from a CPU-profiling campaign against real-app-shaped trees (`scripts/bench-ssr.ts`): escapeHtml's dirty path drops the callback-replace for a charCode scan with lazy slicing (escaping measured ~19% of non-GC render time); `safeKeyForMarker` adds fast paths for numeric and `[\w.:]` keys (the dominant `<For>` key shapes — skips encodeURIComponent, ~7% of list-heavy renders) while dash-bearing keys keep the full `%2D` encoding so the `<!--k:KEY-->` comment-safety contract is unchanged (bisect-locked security spec); `isVoidElement` stops allocating a per-element `toLowerCase` string; `toAttrName` memoizes resolved+escaped attribute names; `renderPropSkipped` probes `on[A-Z]` via charCodes instead of a regex. Interleaved A/B/A/B benchmark (output byte-identical): blog-index-shaped pages −10%, 1k-row table −13% per render. 14 new edge-case lock specs.

- [#1508](https://github.com/pyreon/pyreon/pull/1508) [`a72f972`](https://github.com/pyreon/pyreon/commit/a72f972050edceda52888fa93b8c763a2c71b86a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `renderToString` rewritten to a maybe-sync renderer — every function in the string-render family now returns `string | Promise<string>` instead of always-`Promise<string>`. Fully-synchronous subtrees (the overwhelming majority — async components are rare) concatenate plain strings with ZERO promise hops; only a genuine `async function Component()` promotes its own subtree to a Promise, with `.then` continuations resuming the sequential child walk so strict left-to-right sibling order, provider visibility across async boundaries, and the context-stack trim-after-settle semantics are all preserved (locked by the new `maybe-sync-order.test.ts` contract specs).

  Why: the previous `async renderNode` + `html += await renderNode(child)` shape paid promise machinery at every node — on a 500-node SSR page (~100 RouterLinks) that was ~90µs of pure promise overhead per render against ~10µs of actual HTML work.

  Measured (M3 Max, Bun, production, controlled A/B): `renderToString` scenarios — empty +43% (697K renders/s), simple-5-routes +51% (220K/s), links-100 +41% (15.1K/s), layouts-26-params +78% (38.5K/s). Full `@pyreon/server` handler throughput (zero's SSR/ISR request path): simple +24% (206K req/s), medium-10-routes +32% (186K req/s), nested-5-deep +45% (114K req/s). Every zero SSR/ISR request and every SSG page build renders through this path.

  Public API unchanged — `renderToString` still returns `Promise<string>`; only the internal tree walk is promise-free for sync trees. The streaming path (`renderToStream`) is untouched (progressive flushing is inherently async).

- Updated dependencies [[`0e38332`](https://github.com/pyreon/pyreon/commit/0e3833212e93ec90994edfccb5f2966f9eb0e926), [`0c1ea1e`](https://github.com/pyreon/pyreon/commit/0c1ea1e89e4228e84367efd5d2cb334808955a25), [`e36bbe5`](https://github.com/pyreon/pyreon/commit/e36bbe52e7f1417a703b4e6ce23281c448d9132f), [`65ccdf2`](https://github.com/pyreon/pyreon/commit/65ccdf2ad95a16b676b58948acea51f957e5cf62), [`7f89196`](https://github.com/pyreon/pyreon/commit/7f89196dd3d99f61b0bba032481b9d389fdd8264)]:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0

## 0.31.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0

## 0.30.0

### Minor Changes

- [#1357](https://github.com/pyreon/pyreon/pull/1357) [`4c9844d`](https://github.com/pyreon/pyreon/commit/4c9844d4a408549ad48e3d93bbf686ba946032da) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<Image priority>` coverage bundle — closes 3 gates left open by [#1353](https://github.com/pyreon/pyreon/issues/1353) + fixes a real framework bug surfaced during e2e.

  **Framework bug fixed.** Pyreon's SSR `toAttrName` kebab-cased ALL camelCase props (`srcSet → src-set`, `fetchPriority → fetch-priority`, `crossOrigin → cross-origin`) — but these are STANDARD HTML attributes the spec defines as LOWERCASE-NO-DASH. Browsers silently ignore `fetch-priority`/`src-set`/`cross-origin`, so a body `<img fetchPriority="high" srcSet="…">` rendered correctly to Pyreon's eyes but produced HTML the preload scanner couldn't act on.

  Fix: a `HTML_ATTRIBUTE_MAP` allow-list in `@pyreon/runtime-server`'s `toAttrName` carves out the React-style camelCase props that map to lowercase HTML attrs. Mirrors React's `possibleStandardNames`. Pre-existing kebab default still applies to user-defined / unknown camelCase props (e.g. `dataTestId → data-test-id` — test in `ssr.test.ts:650` still passes).

  | JSX prop         | Before            | After                                 |
  | ---------------- | ----------------- | ------------------------------------- |
  | `srcSet`         | `src-set`         | `srcset`                              |
  | `fetchPriority`  | `fetch-priority`  | `fetchpriority`                       |
  | `crossOrigin`    | `cross-origin`    | `crossorigin`                         |
  | `referrerPolicy` | `referrer-policy` | `referrerpolicy`                      |
  | `tabIndex`       | `tab-index`       | `tabindex`                            |
  | `readOnly`       | `read-only`       | `readonly`                            |
  | `maxLength`      | `max-length`      | `maxlength`                           |
  | `colSpan`        | `col-span`        | `colspan`                             |
  | `autoComplete`   | `auto-complete`   | `autocomplete`                        |
  | `acceptCharset`  | `accept-charset`  | `accept-charset` (kebab — HTML spec)  |
  | `httpEquiv`      | `http-equiv`      | `http-equiv` (kebab — HTML spec)      |
  | `dataTestId`     | `data-test-id`    | `data-test-id` (unchanged — fallback) |

  3 new regression tests in `runtime-server/src/tests/ssr.test.ts` lock the allow-list (lowercase, kebab, boolean attrs). Bisect-verified: reverting the allow-list to the old kebab default fails 2 of 3 specs with `expected '<img src-set=…' to contain 'srcset='`. Restored → 169/169 pass.

  **Coverage closures for PR [#1353](https://github.com/pyreon/pyreon/issues/1353):**

  - **`docs/docs/images-and-fonts.md`** — new documentation page covering the bi-modal `<Image>` API (descriptor + string forms), descriptor `toString` compat, `createImageRegistry`, priority preload semantics, font self-hosting + preload, and the `image: false` / `font: false` opt-out grammar (PR [#1356](https://github.com/pyreon/pyreon/issues/1356)). Wired into the VitePress sidebar between SSG and Create Zero.
  - **verify-modes cell** — the existing `ssr-showcase × ssg` autodetect cell now asserts `dist/image-priority-probe/index.html` carries `<link rel="preload" as="image" fetchpriority="high" imagesrcset="…" crossorigin="anonymous">` in `<head>`. **Bisect-verified end-to-end**: stashing the `useHead` block fails the cell with the documented error message; restoring → 23/23 modes green.
  - **Real-Chromium e2e** — 2 specs in `e2e/ssr-showcase.spec.ts`: (a) preload `<link>` is present in the initial HTML response (before hydration runs — preload scanner can see it), (b) body `<img>` carries `fetchpriority="high"` + `loading="eager"`. The second spec is what surfaced the framework bug above.
  - **`examples/ssr-showcase/src/routes/image-priority-probe.tsx`** — minimal route exercising `<Image priority>` with `srcset` + cross-origin URL. Drives both gates above.

  **Validation:** 23/23 verify-modes • 1193/1194 zero • 169/169 runtime-server (+3 new) • 2/2 priority preload e2e • 117/117 ssr-showcase e2e • 11/11 validate-fast gates • typecheck + lint clean.

- [#1362](https://github.com/pyreon/pyreon/pull/1362) [`d040055`](https://github.com/pyreon/pyreon/commit/d040055e793c3b3e68cd58a286327655aee7ab6e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - SVG attribute mapping + expanded HTML attr coverage in SSR.

  **The bug class:** PR [#1357](https://github.com/pyreon/pyreon/issues/1357) added `HTML_ATTRIBUTE_MAP` to fix React-camelCase attrs the SSR kebab default broke (`fetchPriority → fetch-priority` was browser-ignored). The audit for other framework components surfaced TWO remaining gaps:

  1. **SVG attributes** — user-written JSX `<svg viewBox=...>` kebabs to `view-box` (browser-ignored). `<path strokeWidth=2>` kebabs to `stroke-width` which actually happens to match SVG's CSS-property convention, but the framework's behavior was "accidentally correct" not "knows what SVG needs." `theme.tsx` + `favicon.ts` authors wrote `stroke-width` directly in JSX as a workaround — the framework now handles either source spelling.
  2. **Additional HTML attrs** — `useMap`, `frameBorder`, `marginHeight`/`marginWidth`, `allowFullScreen`, `mediaGroup`, `controlsList`, `disablePictureInPicture`, `disableRemotePlayback`, `radioGroup`, `srcLang`, `popoverTarget` / `popoverTargetAction`, `noValidate`, `allowTransparency` — 15 standard React-camelCase HTML attrs that pre-fix kebabed wrong (`<form noValidate>` → `<form no-validate>`, browser-ignored).

  **Fix:**

  - **`HTML_ATTRIBUTE_MAP` extended** with the 15 missing standard HTML attrs.
  - **`SVG_ATTRIBUTE_MAP` added** with ~90 SVG attrs split into two classes per the SVG spec:
    - **Canonical camelCase preserved** (51 entries): `viewBox`, `preserveAspectRatio`, `gradientUnits`, `gradientTransform`, `patternUnits`, `attributeName`, `keySplines`, `numOctaves`, `pathLength`, `stdDeviation`, etc. SVG is case-sensitive; the kebab default emits `view-box` which browsers silently ignore.
    - **CSS-property style kebab** (33 entries): `strokeWidth → stroke-width`, `strokeLinecap → stroke-linecap`, `textAnchor → text-anchor`, `markerEnd → marker-end`, `clipPath → clip-path`, `floodColor → flood-color`, `stopColor → stop-color`, etc. These coincide with the kebab fallback but the explicit map documents the contract.
  - **Lookup order** in `toAttrName`: HTML_ATTRIBUTE_MAP → SVG_ATTRIBUTE_MAP → kebab fallback. HTML wins when an attr is in both maps (e.g. `tabIndex` is in HTML).

  **Back-compat preserved**: kebab-cased SVG attrs in user JSX (`<path stroke-width="2">`) continue to work — they pass through the fallback unchanged (no uppercase chars to replace).

  **Validation:**

  - ✅ **+7 regression specs** in `ssr.test.ts`:
    - 1 for the 13 new HTML attrs (positive + negative kebab assertions)
    - 5 for SVG (camelCase preservation, CSS-property kebab, gradient/pattern, single-word pass-through, back-compat kebab source)
    - 1 for marker-style kebab attrs (`markerEnd`/`clipPath`/`floodColor`)
  - ✅ **Bisect-verified at 2 layers**:
    - Removing `SVG_ATTRIBUTE_MAP` → 2 SVG canonical-camelCase specs fail (`view-box`/`gradient-units`)
    - Removing the new HTML entries → 1 spec fails with the 13 broken attrs listed
  - ✅ **176/176** runtime-server tests pass; **1262/1263** zero pass; **23/23** verify-modes; **11/11** validate-fast.

  The SVG_ATTRIBUTE_MAP and the extended HTML_ATTRIBUTE_MAP together cover the production set of standard attributes a Pyreon user is likely to write in JSX. Exotic SVG attrs (`xChannelSelector` etc.) are included; mathematical SVG filter attrs are covered. Framework-internal author workarounds (`stroke-width` written directly in JSX) keep working unchanged.

  **Why this matters now**: PR [#1357](https://github.com/pyreon/pyreon/issues/1357) fixed `<Image priority>`'s body `<img fetchPriority="high">`. Users writing custom SVG in their own components hit the same bug class — `<svg viewBox=...>` is a far more common shape than `<img fetchPriority=...>`. Closes the audit gap proactively before any user reports the silent SVG breakage.

### Patch Changes

- Updated dependencies [[`6feb9d4`](https://github.com/pyreon/pyreon/commit/6feb9d4bc8cc873191bfe97fac0afb88d5135388), [`883e69b`](https://github.com/pyreon/pyreon/commit/883e69baed47d77eb79f4dd09b87da96a0b52894), [`4efa71b`](https://github.com/pyreon/pyreon/commit/4efa71b83af84b9310681ed213a331842248bb65), [`960bb0f`](https://github.com/pyreon/pyreon/commit/960bb0f139839de49508d836878b98556b1c7d07), [`b720267`](https://github.com/pyreon/pyreon/commit/b720267f0d9fbe260398c56d49834dc1dd2b09fb)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0

## 0.29.0

### Patch Changes

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

- [#1314](https://github.com/pyreon/pyreon/pull/1314) [`9a863b7`](https://github.com/pyreon/pyreon/commit/9a863b71e946898ab2a8dac7051cef30adada7b4) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(runtime-server): allow `data:image/*` placeholders through the SSR URL guard

  SSR/SSG stripped **all** `data:` URIs from URL-bearing attributes, silently
  dropping the `imagePlugin` blur/color placeholders (`data:image/webp;base64,…`,
  `data:image/svg+xml,…`) from prerendered static HTML — `<img>`/`<video>` shipped
  with no `src`/`poster`. The client-side guard fix (`@pyreon/runtime-dom`, 0.28.1)
  only repaired post-hydration; the static markup `renderToString` /
  `renderToStream` emit was unchanged.

  Ports the client allowlist to the SSR renderer: a raster
  (`png`/`jpeg`/`gif`/`webp`/`avif`/…) or non-scripted-SVG `data:image/*` URI on an
  image-source attribute (`src`/`srcset`/`poster`) of an image-context element
  (`<img>`/`<source>`/`<video>`) now renders. Everything previously blocked stays
  blocked: `data:text/html` on `<iframe>`/`<object>`, `data:image` on
  non-image-context elements (`<a>`, `<embed>`), SVG carrying `<script>`/`on*=`
  handlers (base64 + url-encoded payloads decoded and scanned), and `javascript:`
  everywhere. `renderProp` now receives the element tag so the guard can check
  image context.

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

## 0.28.1

## 0.28.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0

## 0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0

## 0.26.3

## 0.26.2

## 0.26.1

## 0.26.0

### Patch Changes

- Updated dependencies [[`885d6d9`](https://github.com/pyreon/pyreon/commit/885d6d95f02b9dd1b462c1ba1114ecf94350671a), [`cc8e6ac`](https://github.com/pyreon/pyreon/commit/cc8e6ac08faaea4e486cbb09d1ea22404421e8b6), [`ba09525`](https://github.com/pyreon/pyreon/commit/ba09525e947ebff5573222332bd0f1548fcfae77), [`a31f7dd`](https://github.com/pyreon/pyreon/commit/a31f7dd8f8ddba6864c69bbf53117d36ddd477a3), [`71901d4`](https://github.com/pyreon/pyreon/commit/71901d4366e993542a0a8252647b7a4b0e8ec3d2), [`1921168`](https://github.com/pyreon/pyreon/commit/192116843a0547c777e884f0254ffc51a69bfae1), [`749c2f4`](https://github.com/pyreon/pyreon/commit/749c2f435909740ea43d528ebfc00a2155e64f74)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0

## 0.25.1

### Patch Changes

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

- [#768](https://github.com/pyreon/pyreon/pull/768) [`dfaefb8`](https://github.com/pyreon/pyreon/commit/dfaefb8e9e06eaff9039c001ad7731476b6b5732) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `captureContextStack()` now deduplicates: only the topmost frame per context-id is retained in the captured snapshot. Closes the residual snapshot-amplification leak that the `restoreContextStack` reference-identity fix (0.23.0) didn't reach.

  ## Background

  Heap snapshots from 0.21.x showed 1.22 MB / 321k-entry arrays retained by effect closures under deeply-nested reactive boundaries — the live context stack accumulating frames across reactive remounts. The 0.23.0 `restoreContextStack` fix (changing position-based truncation to reference-identity splice) cleaned the LIVE stack, dropping the headline metrics 7-16×.

  But the residual remained — heap snapshots still showed **20 arrays at 157 KB each (~40k entries)** retained by effect closures. Root cause: `captureContextStack()` was `[...getStack()]` — a verbatim copy of the live stack at the moment of capture. When that capture landed inside a nested `restoreContextStack` window (the live stack temporarily holds the same context-id pushed by multiple nested effects), the snapshot baked those duplicates in. Each effect's closure then retained them for its lifetime.

  ## The fix

  `captureContextStack()` now walks the stack top-to-bottom keeping only the topmost frame for each context-id. **Semantically equivalent to the verbatim copy** because `useContext()` walks the stack in reverse and stops at the first matching frame — any shadowed frame is unreachable by definition.

  ```ts
  // Before
  return [...getStack()]; // 40k entries under deep nesting

  // After
  // Walk top-to-bottom, keep topmost-per-id frames
  const seen = new Set<symbol>();
  const reversed: Map<symbol, unknown>[] = [];
  for (let i = stack.length - 1; i >= 0; i--) {
    const frame = stack[i];
    let unique = false;
    for (const id of frame.keys()) {
      if (!seen.has(id)) {
        seen.add(id);
        unique = true;
      }
    }
    if (unique) reversed.push(frame);
  }
  reversed.reverse();
  return reversed;
  // → ~N entries where N = distinct context ids in scope (typically 2-10)
  ```

  ## Safety: why this preserves all existing behavior

  The naïve "just dedup the array" version would have silently broken SSR. `@pyreon/runtime-server` was using `captureContextStack().length` as a stack-position marker for cleanup (4 call sites) — relying on `snapshot.length === live stack length`. Dedup makes the snapshot shorter, which would have caused SSR cleanup to pop fewer frames than it pushed.

  **Pre-requisite fix (also in this PR)**: introduce `getContextStackLength()` — a non-allocating helper that reads the LIVE stack length directly. Migrate the 4 SSR call sites to use it instead of `captureContextStack().length`. After this migration, dedup at capture time has zero observable effect on SSR length bookkeeping.

  `restoreContextStack` already removes snapshot frames by **reference identity** (not by position or count) — the cleanup logic works identically against a deduped snapshot.

  `@pyreon/runtime-dom`'s `mountReactive` uses the snapshot for restoration only, not for length. Safe to dedup.

  The reactivity layer's `setSnapshotCapture` DI hook (used by `_bind`, `renderEffect`, `effect`) passes the snapshot back unchanged into `restore` — no length dependency. Safe to dedup.

  ## Tests

  18 new specs in `context.test.ts`:

  - **Dedup behavior** (8 specs): empty stack → empty snapshot; single frame → identical; no duplicates → verbatim; duplicate ids collapse to topmost; deep duplicate-heavy stack collapses correctly; multi-key frames kept if any id is un-shadowed; multi-key frames dropped if all ids are shadowed; useContext returns same value pre/post dedup for arbitrary read patterns.
  - **restoreContextStack with deduped snapshots** (2 specs): restoration semantically equivalent; 40-duplicate stack only pushes/pops 1 frame post-dedup.
  - **getContextStackLength** (3 specs): returns LIVE stack length not snapshot length; zero on empty stack; matches array length through push/pop cycles.
  - **Leak audit regression locks** (2 specs):
    - 1000 snapshots of a 100-frame duplicate-heavy stack retain **1000 total frame references**, not 100,000.
    - 100 snapshots of a 500-frame mixed stack with 50 distinct ids retain **5000 frame references**, not 50,000.

  ## Bisect-verified

  - Revert `captureContextStack` to `[...getStack()]` → **6 dedup-behavior specs + 2 leak-audit specs fail**; 29 pre-existing specs still pass (semantic equivalence preserved).
  - Restored → 37/37 context tests, 523/523 `@pyreon/core`, 150/150 `@pyreon/runtime-server`, 681/681 `@pyreon/runtime-dom`, 521/521 `@pyreon/router` — total **1875 tests across affected packages**. Lint + typecheck clean. No lockfile drift. No `TEMP BISECT` remnants.

  ## Impact

  - **Per-snapshot retention drops from O(stack-depth) to O(distinct-ids-in-scope)** — typically 100× reduction on deep trees, the same shape as the bug-report's 800× extrapolation.
  - The leak-audit unit tests are permanent regression locks — re-introducing the bug shape fails CI deterministically (no heap snapshot needed).

  ## Honest scope note

  This PR closes the per-snapshot allocation amplification. The orthogonal "snapshots themselves accumulate in proportion to effect count" concern (raised in the analysis) is NOT addressed here — that's an inherent property of the effect-per-component architecture, not a leak. A possible future Map-interning pass could deduplicate identical snapshot ARRAYS via WeakMap, sharing one allocation across multiple effects whose contexts match. Filed as separate work if numbers warrant.

- Updated dependencies [[`dfaefb8`](https://github.com/pyreon/pyreon/commit/dfaefb8e9e06eaff9039c001ad7731476b6b5732), [`67e1f37`](https://github.com/pyreon/pyreon/commit/67e1f371a20219481ee9564d2d7421ec2a0b5ddf), [`b8fb31c`](https://github.com/pyreon/pyreon/commit/b8fb31cf1a59578fc33f27d539695d2bc164b2f1), [`f400e85`](https://github.com/pyreon/pyreon/commit/f400e85282a370276d5ae0266ba501c41dce4f3e), [`891ca43`](https://github.com/pyreon/pyreon/commit/891ca4300727119dafd66ceaacd7cb39e68f3b4e), [`d4ec777`](https://github.com/pyreon/pyreon/commit/d4ec777643446ed2c51dedb1e74fbd8dce70bdfd), [`2abb672`](https://github.com/pyreon/pyreon/commit/2abb672d8a8bf7f4940af422bf8bf802aa129cdd)]:
  - @pyreon/core@0.24.0
  - @pyreon/reactivity@0.24.0

## 0.23.0

### Minor Changes

- [#745](https://github.com/pyreon/pyreon/pull/745) [`f833a99`](https://github.com/pyreon/pyreon/commit/f833a997bbc04aa5ba94d0d5dd334628871aaa9a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat: close the three deferred SSR/ISR gaps from the deep-analysis pass

  Three independent fixes that close gaps explicitly deferred in earlier
  PRs ([#738](https://github.com/pyreon/pyreon/issues/738)/[#740](https://github.com/pyreon/pyreon/issues/740)/[#742](https://github.com/pyreon/pyreon/issues/742)/[#744](https://github.com/pyreon/pyreon/issues/744)) but called out as required by the goal-hook.

  ### 1. `renderToStream(root, { signal })` — AbortSignal threading

  `renderToStream` now accepts `{ signal?: AbortSignal }`. The internal
  controller forwards client-disconnect (`ReadableStream.cancel()`) AND
  upstream aborts to a shared signal; the drain loop races each pending
  Suspense batch against the abort-promise so the stream closes promptly
  when the consumer hangs up. Per-boundary resolvers check
  `ctx.signal.aborted` before enqueueing post-resolve HTML.

  Before: a client navigating mid-stream left in-flight Suspense work
  awaited server-side until its 30s timeout. Wasted CPU per dropped
  connection.

  After: cancellation propagates within ms; pending boundaries skip the
  swap. Tests (`tests/integration.test.ts`): upstream-abort skips
  post-resolve enqueue, pre-aborted signal still emits sync portion,
  `ReadableStream.cancel()` closes the stream within 100ms (well under
  the 200ms test boundary's pending work).

  ### 2. `ISRConfig.revalidateRequest` — auth-gated revalidation hook

  New optional `(req: Request) => Request | null`. Lets auth-gated
  `cacheKey` setups scope revalidation explicitly:

  - Return a custom `Request` (e.g. stripped cookies for anonymous
    revalidation) — used in place of the original.
  - Return `null` — SKIP revalidation entirely for this entry (stale
    stays stale until next live request).

  Closes the footgun where the default behaviour re-uses the original
  user's cookies for the background revalidation — if the session has
  expired since cache-write, the new render may misbehave or embed
  stale auth data. Tests: 2 specs covering null=skip and custom-request
  scrubbing cookies.

  ### 3. Cloudflare `_worker.js` runtime-contract gate

  New regression assertion in `adapters.test.ts` cloudflare suite: the
  emitted `_worker.js` MUST contain none of `node:` imports / `fs` /
  `path` / `__dirname` / `__filename` / `fileURLToPath` / `Buffer` /
  `process.env`. Locks the Web-standard runtime contract — any future
  template change that accidentally grows a Node API fails CI here
  instead of 500ing in production on Cloudflare Workers (which doesn't
  expose those APIs without the `nodejs_compat` flag).

  The `node:fs/promises` / `node:path` USE inside cloudflare.ts itself
  is build-time-only (runs in Node during `vite build`) and is
  unaffected — this check covers the EMITTED file.

  ### Net diff

  +220 / -10 lines (impl + 5 new tests + JSDoc + changeset). All
  existing suites pass unchanged: runtime-server 35+ tests, zero ISR
  15/15, adapters 37/37, typecheck + lint + build clean across both
  packages, gen-docs + check-doc-claims green.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

- [#757](https://github.com/pyreon/pyreon/pull/757) [`7632934`](https://github.com/pyreon/pyreon/commit/763293492a26d48e4a7b1b28e42a519677702b35) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `renderToStream` and `createHandler` (stream mode) now accept a configurable per-boundary Suspense timeout: `suspenseTimeoutMs?: number`. Defaults to `30_000` ms (unchanged from prior hard-coded behavior), so unset is byte-identical. Pass a smaller number (e.g. `5_000`–`10_000`) for tight-SLA user-facing deploys where the fallback is preferable to a delayed render, or pass `Infinity` to disable the timeout entirely for renders that legitimately need long async work (exports, reports, scheduled jobs). Values ≤0 or `NaN` fall back to the default — invalid input from a config layer can't accidentally drop every boundary.

  This completes the streaming control surface alongside the AbortSignal wire (`signal?: AbortSignal`, shipped in [#745](https://github.com/pyreon/pyreon/issues/745) + [#749](https://github.com/pyreon/pyreon/issues/749)).

  **`@pyreon/runtime-server`**: `RenderToStreamOptions` gains `suspenseTimeoutMs?: number`. Threaded into the internal `StreamCtx` and consumed by `streamSuspenseBoundary`. The `Infinity` case skips the `Promise.race` entirely (no setTimeout, no clearTimeout) — only the AbortSignal can stop a boundary in that mode.

  **`@pyreon/server`**: `HandlerOptions` gains `suspenseTimeoutMs?: number`, forwarded through `renderStreamResponse` → `renderToStream` only when defined (so unconfigured deploys land on `renderToStream`'s defaults byte-identically).

  **Tests**: 4 new specs in `runtime-server/src/tests/ssr.test.ts` (`renderToStream — suspenseTimeoutMs config`) covering explicit short timeout, default preservation, invalid-value fallback, and `Infinity` opt-out. 1 new integration spec in `server/src/tests/server.test.ts` proving the handler's option threads end-to-end.

  **Bisect-verified**:

  - Revert the `ctx.suspenseTimeoutMs` read to the hard-coded `30_000` → "explicit short timeout drops post-resolve content" spec fails (100ms boundary completes against the still-30s timeout); restored → passes.
  - Revert the createHandler forward (drop `suspenseTimeoutMs` from `renderStreamResponse` call) → "stream mode forwards suspenseTimeoutMs" spec fails the same way; restored → passes.
  - Both restored: runtime-server **150/150** + server **168/168 × 5 stability runs**. Lint + typecheck clean. No lockfile drift. No `TEMP BISECT` remnants. `gen-docs --check` clean.

  Manifest + MCP `api-reference` + `llms-full.txt` updated to document the new option and the `signal` option (the latter shipped in [#749](https://github.com/pyreon/pyreon/issues/749) but the manifest entry hadn't been updated). The "30s timeout" foot-gun in `mistakes[]` now mentions the configurability and the `Infinity` opt-out.

### Patch Changes

- [#748](https://github.com/pyreon/pyreon/pull/748) [`2976aa8`](https://github.com/pyreon/pyreon/commit/2976aa84213b479b4d045a83143b3a4a3d89aedf) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(server, runtime-server): Class I orphaned timer in prerender + Suspense streaming (audit-leak-classes discoveries)

  Two real Class I instances surfaced by the new `audit-leak-classes`
  script's `promise-race-no-clear` detector — bugs the lint rule
  `pyreon/promise-race-needs-cleartimeout` would have caught at edit
  time but pre-dated the rule.

  ### `@pyreon/server` `ssg.ts:prerender` — orphaned 30s setTimeout

  `renderPage`'s `Promise.race([handler(req), setTimeout-reject])`
  left the timer pinned for 30s when `handler` won. Same shape as
  [#734](https://github.com/pyreon/pyreon/issues/734)'s `@pyreon/zero` `isr.ts revalidate()` fix. Under high-RPS
  prerender batches (e.g. a large SSG build), hundreds of timer
  closures pile up before they self-clear.

  Fix: capture the timer id outside `Promise.race`, `clearTimeout`
  in `finally`.

  ### `@pyreon/runtime-server` `streamSuspense` — orphaned 30s setTimeout

  The Suspense streaming boundary races children against a 30s
  timeout. The setTimeout _resolves_ (rather than rejects) with
  `'timeout'` — but the orphaned-timer shape is identical: on
  success the timer stays pinned for 30s, holding the resolve
  callback + closure. Every Suspense boundary in a long-running
  SSR server accumulates one pending timer per rendered request
  until it fires.

  Fix: same `let timeoutId` + `try { … } finally { clearTimeout }`
  pattern.

  ### Validation

  - `@pyreon/server` 166/166 tests pass
  - `@pyreon/runtime-server` 143/143 tests pass
  - `@pyreon/test-utils` 90/90 tests pass (+15 new for the audit script)
  - Lint + typecheck clean
  - No public-API surface change

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

### Patch Changes

- Updated dependencies [[`3499594`](https://github.com/pyreon/pyreon/commit/3499594585b7fcb650ac0f80be4bc355f741491b)]:
  - @pyreon/reactivity@0.20.0
  - @pyreon/core@0.20.0

## 0.19.0

### Patch Changes

- [#624](https://github.com/pyreon/pyreon/pull/624) [`8a300bf`](https://github.com/pyreon/pyreon/commit/8a300bf0e6fe7532bb6ae4670a8d64258d64e25f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Migrate `@pyreon/runtime-server` onto the manifest-driven docs pipeline.

  `@pyreon/runtime-server` is the SSR/SSG renderer (`renderToString` / `renderToStream` / `runWithRequestContext` / `configureStoreIsolation` / `decodeKeyFromMarker`) — a real server API surface AI agents query — but it had NO `src/manifest.ts`, no api-reference markers, and was entirely absent from `llms.txt` / `llms-full.txt` / MCP `api-reference.ts`. `get_api(runtime-server, …)` 404'd for the whole surface. PR B of the recommended manifest-coverage follow-up sequence (PR A = the doc-claim correction, [#623](https://github.com/pyreon/pyreon/issues/623); [#622](https://github.com/pyreon/pyreon/issues/622) = compiler).

  **Added** `packages/core/runtime-server/src/manifest.ts` via `defineManifest()` — all 5 public exports as `api[]` entries with accurate signatures + dense `summary` + the real SSR foot-guns in `mistakes[]`: SSR is one-shot (no server reactivity; signals snapshot at render time), Suspense streams out-of-order with a 30s-timeout-keeps-fallback contract, `runWithRequestContext` must wrap the whole `prefetch + render` sequence or loader data is lost, `configureStoreIsolation` MUST be called once at startup or concurrent requests share one global store registry (cross-user SSR state bleed), `<head>` flushes before Suspense resolves. 3 package gotchas (no server reactivity / usually consumed via `@pyreon/server` / the server `typeof process` dev-gate convention).

  **Wiring:** `@pyreon/manifest` added as a `workspace:*` devDependency (the `@pyreon/lint` / `@pyreon/compiler` convention — `manifest.ts` is gen-docs-only, tree-shaken from published `lib/`). Surgical 3-line bun.lock add; `bun install --frozen-lockfile` verified (unrelated fresh-worktree version-field churn reverted to base). api-reference marker pair added between the `@pyreon/runtime-dom` and `@pyreon/store` regions; `bun run gen-docs` regenerated the `llms.txt` bullet, the `llms-full.txt` `## @pyreon/runtime-server` section, and the 5-entry MCP region; hand-prose `## Core Framework` count 6 → 7.

  **No runtime or API change** — purely additive doc metadata. `gen-docs --check` in sync; lint 0 errors; typecheck clean (runtime-server + mcp); runtime-server 143 tests, mcp 497, manifest 135 all green; `check-manifest-depth` passes (runtime-server enters at port-grade density and is intentionally NOT added to `LOCKED` — visible migration backlog, not yet flagship). New `manifest-snapshot.test.ts` (5 specs) locks the rendered bullet/section/api-reference shape + the foot-gun-catalog assertions locally in addition to the CI `Docs Sync` gate.

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

- [#256](https://github.com/pyreon/pyreon/pull/256) [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(runtime-server): render `innerHTML` / `dangerouslySetInnerHTML` as inner content, not as attributes

  `innerHTML` was emitted as a literal HTML attribute on the open tag
  (`<span innerHTML="&lt;svg&gt;…">`) instead of as the element's inner
  content. Wasted bytes, hydration mismatch, and — combined with the
  client-side `innerHTML` bug in the same PR — the literal closure text
  was visible on-screen before hydration replaced it with the real SVG.

  Fix:

  - `renderPropSkipped` now skips `innerHTML` and `dangerouslySetInnerHTML`
    so neither shows up in the open-tag attribute list.
  - `streamElementNode` (streaming) and `renderElement` (non-streaming)
    both write them as inner content — unwrapping function-typed values
    emitted by the JSX compiler for signal-derived expressions.

  5 new regression tests (`renderToString — innerHTML / dangerouslySetInnerHTML inner-content rendering`).

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
