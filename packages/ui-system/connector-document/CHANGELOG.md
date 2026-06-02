# @pyreon/connector-document

## 0.27.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@1.0.0
  - @pyreon/document@1.0.0

## 0.26.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/document@0.26.3

## 0.26.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/document@0.26.2

## 0.26.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/document@0.26.1

## 0.26.0

### Patch Changes

- Updated dependencies [[`cc8e6ac`](https://github.com/pyreon/pyreon/commit/cc8e6ac08faaea4e486cbb09d1ea22404421e8b6)]:
  - @pyreon/core@1.0.0
  - @pyreon/document@1.0.0

## 0.25.1

### Patch Changes

- [#902](https://github.com/pyreon/pyreon/pull/902) [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Ship source maps in published tarballs.

  Every `@pyreon/*` package now ships its `.js.map` and `.d.ts.map` files. The previous `!lib/**/*.map` exclusion in each package's `files` array left every emitted JS file pointing at a `//# sourceMappingURL=*.map` that wasn't actually published — causing Vite (and other bundlers) to log a "Failed to load source map" warning per file on every cold dev start. Real bug in shipped tarballs, not just dev-noise theory.

  The fix is shipping the maps. They make framework stack traces readable: `at mountChild (node_modules/@pyreon/runtime-dom/src/nodes.ts:147)` instead of `at e (node_modules/@pyreon/runtime-dom/lib/index.js:1:42857)`. This matters most when a user hits a framework bug, opens devtools, or sees an unreadable production error from a server-side render. Sentry / Bugsnag / Rollbar can also translate framework frames using the shipped maps; without them, the framework's part of every captured stack stays opaque.

  Cost: ~350KB-1MB per package in `node_modules`. Bundlers (Vite, Webpack, Rollup, esbuild) strip source maps from production builds automatically; they never reach end users. Every comparable library (React, Vue, Solid, Preact, Svelte, TanStack) does this.

  No API changes. The `check-distribution` CI gate inverts to enforce the new contract (maps must be present, not absent).

- Updated dependencies [[`c862965`](https://github.com/pyreon/pyreon/commit/c8629652a94ca7d1e8622cd2de5b4ac009874dbf), [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e)]:
  - @pyreon/core@0.25.1
  - @pyreon/document@0.25.1

## 0.25.0

### Patch Changes

- Updated dependencies [[`7da5b2b`](https://github.com/pyreon/pyreon/commit/7da5b2bcbc2aebd9600cb8fdefb763ace7f78c1a), [`cddc592`](https://github.com/pyreon/pyreon/commit/cddc5926f2f23d1b600d01f60fa4e72513d2b6fe), [`6075127`](https://github.com/pyreon/pyreon/commit/60751278894a6ff843c0f6f6c4894c76bcb6a720)]:
  - @pyreon/core@0.25.0
  - @pyreon/document@0.25.0

## 0.24.6

### Patch Changes

- Updated dependencies [[`378efde`](https://github.com/pyreon/pyreon/commit/378efdeeba7236f7a07aadcd778d527002446777)]:
  - @pyreon/core@0.24.6
  - @pyreon/document@0.24.6

## 0.24.5

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.5
  - @pyreon/document@0.24.5

## 0.24.4

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.4
  - @pyreon/document@0.24.4

## 0.24.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.3
  - @pyreon/document@0.24.3

## 0.24.2

### Patch Changes

- Updated dependencies [[`1c1b135`](https://github.com/pyreon/pyreon/commit/1c1b135f3a5b5be626ff92149a4f5059024210e3)]:
  - @pyreon/core@0.24.2
  - @pyreon/document@0.24.2

## 0.24.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.1
  - @pyreon/document@0.24.1

## 0.24.0

### Patch Changes

- Updated dependencies [[`dfaefb8`](https://github.com/pyreon/pyreon/commit/dfaefb8e9e06eaff9039c001ad7731476b6b5732)]:
  - @pyreon/core@0.24.0
  - @pyreon/document@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [[`6571df8`](https://github.com/pyreon/pyreon/commit/6571df8209c5dc72619194ffe19359765b1d2d7f), [`af4d5d8`](https://github.com/pyreon/pyreon/commit/af4d5d83fc087d738dbe5084950476566d488d77), [`441b5df`](https://github.com/pyreon/pyreon/commit/441b5dfa64ae52002d3e6612ec68566344ae999d)]:
  - @pyreon/core@0.23.0
  - @pyreon/document@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.22.0
  - @pyreon/document@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.21.0
  - @pyreon/document@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.20.0
  - @pyreon/document@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [[`c3d0a70`](https://github.com/pyreon/pyreon/commit/c3d0a7017ed2ef4468ec3fb4e4c09ec869d2917a), [`ac1d375`](https://github.com/pyreon/pyreon/commit/ac1d37542b11cd95451a2f0b0a51cc43603d001a), [`21e465c`](https://github.com/pyreon/pyreon/commit/21e465c7957c3e57c838af58ffa995682908c5f8), [`9f03747`](https://github.com/pyreon/pyreon/commit/9f037478763d9f8cd2365feb63dc87fda2545e5d), [`078b1e7`](https://github.com/pyreon/pyreon/commit/078b1e72343828b2d73f97c03e0b5b0f335fe979), [`fa4e37f`](https://github.com/pyreon/pyreon/commit/fa4e37fa620cf0e3f240053bf789b84bd9668838)]:
  - @pyreon/document@0.19.0
  - @pyreon/core@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.18.0
  - @pyreon/document@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [[`35af0e2`](https://github.com/pyreon/pyreon/commit/35af0e22b670151052e0b1df5006977fca759128), [`8b1a982`](https://github.com/pyreon/pyreon/commit/8b1a982faa140e7e646293a47d6a4fbe70cac67c)]:
  - @pyreon/core@0.17.0
  - @pyreon/document@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [[`a4a4255`](https://github.com/pyreon/pyreon/commit/a4a42550835cb2706b99beed8ea582037d338ea8)]:
  - @pyreon/core@0.16.0
  - @pyreon/document@0.16.0

## 0.14.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.14.0
  - @pyreon/document@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies [[`a05c4ba`](https://github.com/pyreon/pyreon/commit/a05c4bab713f5168acd56eb233520102735bd80a)]:
  - @pyreon/core@0.13.0
  - @pyreon/document@0.13.0

## 0.12.15

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.15
  - @pyreon/document@0.12.15

## 0.12.14

### Patch Changes

- [#252](https://github.com/pyreon/pyreon/pull/252) [`25949e7`](https://github.com/pyreon/pyreon/commit/25949e79484f169ac905bb9feecf31c702de1db6) Thanks [@vitbokisch](https://github.com/vitbokisch)! - T1.1 Phase 5 Batch 2 — browser smoke tests for rocketstyle + coolgrid + connector-document

  Adds real-Chromium Playwright smoke tests for three more ui-system
  packages. happy-dom can't compute styles from the injected stylesheet
  or resolve `@media` queries, so the rocketstyle → styler → DOM cascade,
  the coolgrid grid math, and the connector-document real-`h()`
  extraction pipeline went untested end-to-end.

  `@pyreon/rocketstyle` (`src/__tests__/rocketstyle.browser.test.tsx`,
  6 tests). Wraps a real `ComponentFn` (not `'div' as any`), matching
  production rocketstyle usage (Element/Text bases).

  - `.theme()` mounts and Chromium computes the authored color/padding
    via styler; emits a `pyr-*` class.
  - `state` prop swaps the resolved `$rocketstyle` theme.
  - `variant` layers on top of state.
  - `modifier` transform derives styles from the accumulated state theme.
  - `m(light, dark)` theme callback resolves per `PyreonUI` mode.
  - Reactive mode swap: `mode` is a signal on `PyreonUI`, rocketstyle's
    `$rocketstyleAccessor` reads `themeAttrs.mode` (ReactiveContext
    getter), styler's `isReactiveRS` effect observes the change and
    swaps classList in place — no remount. This is the only axis that
    survives the rocketstyle HOC spread (`{...filteredProps}` in
    `rocketstyleAttrsHoc` collapses `_rp()` getter props to values, so
    dimension props like `state={stateSig()}` aren't currently reactive
    end-to-end; mode flows via context, not props, so it stays live).

  `@pyreon/coolgrid` (`src/__tests__/coolgrid.browser.test.tsx`, 7 tests).
  Wraps in `PyreonUI` (deprecated `<Provider>` from @pyreon/unistyle
  replaced).

  - Container mounts with `display: flex; flex-direction: column`.
  - Col size=6/12 → ~50% of Row; two size=6 Cols sum to ~100%
    side-by-side.
  - `flex-basis: 25%` for size=3/12.
  - **columns != 12**: `theme.grid.columns = 6`, size=2/6 → 33.3333%
    — proves the math is `size / columns`, not hardcoded.
  - **`gap` subtraction**: Row `gap={24}`, Col size=6 emits
    `calc(50% - 24px)`; Chromium preserves the literal in computed
    `flex-basis`, col width < 50% of Row but > 40% (subtraction not
    failure).
  - **Responsive `size={[12, 6, 4]}`**: at the ~414px vitest viewport
    (below `sm`=576), the xs entry applies → size=12 → 100% of Row.

  `@pyreon/connector-document`
  (`src/__tests__/connector-document.browser.test.tsx`, 5 tests).

  - **Path A strict**: component body throws; if `extractDocumentTree`
    falls through to Path B and invokes the component, the test fails
    with the throw. Passing proves Path A reads `_documentProps` off
    the JSX vnode without invoking the component.
  - Path B: `extractDocumentTree` invokes the component to recover
    `_documentProps` from the post-call vnode (the rocketstyle
    attrs-HOC pattern).
  - Function-valued `_documentProps` resolve to LIVE values at
    extraction time — same vnode, signal mutated between calls, second
    extraction reads the new value.
  - Transparent (non-documentType) wrappers built with real `h()`
    flatten correctly.
  - `resolveStyles` produces a plain style record in the browser bundle
    (color/backgroundColor/fontSize=24/padding=[8,16] all parse; no
    Node-only dep leaks).

  Bisect-verified (load-bearing hot-path revert per suite):

  - **rocketstyle**: (a) emptied dimension theme merge → 3/6 failed
    (state, variant, modifier). (b) Static-returned `mode` in `useTheme`
    → 2/6 failed (reactive mode swap, m-callback dark-mode test).
    Restored, 6/6 pass.
  - **coolgrid**: (a) emptied Col `widthStyles` → 3/7 failed
    (size-ratio tests + flex-basis literal + gap + responsive).
    (b) Ignored `hasGap`, always plain percentage → gap-subtraction
    test failed with `calc(50% - 24px)` assertion. Restored, 7/7 pass.
  - **connector-document**: Path A strict test is self-bisecting —
    the component body throws, so any regression that causes the
    extractor to invoke it fails immediately with a real error.
    Additionally, gating Path B (`else if (false && typeof type ===
'function')`) → Path B + reactive accessor tests fail, 2/5.
    Restored, 5/5 pass.

  Also removes the three packages from `PHASE_5_PENDING_PACKAGES` in
  `scripts/check-browser-smoke.ts`. 7 packages remain pending
  (ui/{theme,components,primitives} + 4 compat layers).

- Updated dependencies []:
  - @pyreon/core@0.12.14
  - @pyreon/document@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.13
  - @pyreon/document@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.12
  - @pyreon/document@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.11
  - @pyreon/document@0.12.11
