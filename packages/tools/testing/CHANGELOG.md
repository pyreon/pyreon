# @pyreon/testing

## 0.47.0

### Minor Changes

- [#2351](https://github.com/pyreon/pyreon/pull/2351) [`bf658a0`](https://github.com/pyreon/pyreon/commit/bf658a0eb6495dc9bd7724997bdd6471043a6fe7) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(testing): library-specific helper subpaths — `/form`, `/ui`, `/router`, `/store`, `/i18n`, `/toast`, `/query` — each gated on its library as an OPTIONAL peer (the main entry stays dependency-light).

  - `@pyreon/testing/form` — `renderForm(() => useForm(...))` (renderHook-style headless harness: `fill` via setFieldValue+touched, `submit` awaits the full handleSubmit pipeline), `fillForm(scope, values)`/`submitForm(scope)` (REAL rendered forms, fields located by accessible LABEL, driven through real input/blur/submit events), `expectForm(form)` fluent assertions (`toBeValid`/`toBeInvalid`/`toHaveFieldError`/`toHaveNoFieldError`/`toBeDirty`/`toBePristine`/`toHaveValues`).
  - `@pyreon/testing/ui` — `renderWithTheme(ui, { theme, mode })` (PyreonUI wrap + reactive `setMode`, no remount), `expectComputedStyle(el, decls)` + `normalizeCssValue` (computed-serialization value normalization — `'red'`/`'#ff0000'`/`'rgb(255, 0, 0)'` compare equal in a real browser; happy-dom limits documented honestly).
  - `@pyreon/testing/router` — `await renderWithRouter(ui, { routes, route })` (initial route SETTLED before mount: lazy components + loaders pre-resolved via `router.preload`, so `useLoaderData()` is populated on first render; `navigate()` resolves after guards+loaders+DOM commit with the `NavigationResult`), `expectRouter(router).toBeAt('/posts/:id')` (pattern OR concrete path).
  - `@pyreon/testing/store` — `installStoreReset()` (afterEach `resetAllStores`) + `withFreshStore(useStore, fn)` (scoped guaranteed-fresh singleton, disposed after — sync/async/throw-safe) + re-exported `resetStore`/`resetAllStores`.
  - `@pyreon/testing/i18n` — `renderWithI18n(ui, { locale, messages })` with reactive `setLocale` + a bound `t()`.
  - `@pyreon/testing/toast` — `expectToast`/`findToast`/`getToasts`/`clearToasts` (store-level: work headless or with a mounted `<Toaster>`; type filter + soft-dismiss awareness).
  - `@pyreon/testing/query` — `renderWithQueryClient(ui, { client? })` + `createTestQueryClient()` (fresh isolated client per test, `retry: false`, `gcTime: Infinity` — the TanStack testing convention) + `setQueryData` passthrough.

  Every render harness accepts a `wrapper` option so providers COMPOSE (theme+router+query together) — deliberately no mega `renderApp`. Assertions follow the package's fluent convention (`expectSignal` precedent), never `expect.extend`.

  `@pyreon/store` fix (load-bearing for the isolation helpers, and a standalone leak fix): `resetStore(id)` / `resetAllStores()` now DISPOSE the store — stop its effectScope (setup/plugin computeds + effects) and run plugin cleanups — before dropping the registry entry. Previously a reset orphaned the entry while its scope kept firing on external signals forever (leak class B). Foreign registry values (custom `setRegistryProvider`) degrade to the old plain delete.

### Patch Changes

- [#2341](https://github.com/pyreon/pyreon/pull/2341) [`6a3fc45`](https://github.com/pyreon/pyreon/commit/6a3fc45ac6cb94e02066a3a0de8bd518564bd5ab) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix the `/matchers` and `/vitest` entries shipping broken:

  - `lib/matchers.js` was an EMPTY module — the library build's `treeshake.moduleSideEffects: false` silently dropped the bare side-effect `import '@testing-library/jest-dom/vitest'`, so `import '@pyreon/testing/matchers'` registered nothing. Registration is now an explicit `expect.extend` on bindings imported from `vitest` + `@testing-library/jest-dom/matchers` (bound imports cannot be tree-shaken), and a missing optional peer now fails loudly at module resolution instead of silently no-opping.
  - `@pyreon/testing/vitest` registered cleanup via `globalThis.afterEach`, which silently no-ops for projects running without `globals: true` (the vitest default) — containers leaked across tests and surfaced as confusing "Found multiple elements" failures. `afterEach` is now imported from `vitest`, which works regardless of the `globals` setting.
  - Both entries' shipped `.d.ts` were a bare `export {}` — the jest-dom `Assertion` type augmentation never reached published consumers. Each entry now declares the vitest module augmentation explicitly, and it survives into the built types.
  - `package.json` `sideEffects` now lists the two registration entries so consumer bundlers don't drop the bare imports either; `vitest` is declared as an optional peer.

- Updated dependencies [[`9799d6b`](https://github.com/pyreon/pyreon/commit/9799d6bfa1c3f99fa38f4375eebd330c2df0a715), [`34d68e1`](https://github.com/pyreon/pyreon/commit/34d68e1e00088c589b8362468144951d648527f2), [`bf658a0`](https://github.com/pyreon/pyreon/commit/bf658a0eb6495dc9bd7724997bdd6471043a6fe7), [`577f40f`](https://github.com/pyreon/pyreon/commit/577f40fc3282672818c8b31a4f595b1dbb295d19)]:
  - @pyreon/core@0.47.0
  - @pyreon/runtime-dom@0.47.0
  - @pyreon/store@0.47.0
  - @pyreon/toast@0.47.0
  - @pyreon/form@0.47.0
  - @pyreon/reactivity@0.47.0
  - @pyreon/router@0.47.0
  - @pyreon/i18n@0.47.0
  - @pyreon/query@0.47.0
  - @pyreon/ui-core@0.47.0

## 0.46.0

### Patch Changes

- [#2269](https://github.com/pyreon/pyreon/pull/2269) [`1dc9cce`](https://github.com/pyreon/pyreon/commit/1dc9cce9d0ca8b5376f581b41edb0f6f2630b779) Thanks [@vitbokisch](https://github.com/vitbokisch)! - docs(testing): migrate @pyreon/testing to the manifest-driven docs pipeline (the
  last real-API package without a manifest — 51 → 52 manifests). Adds
  `src/manifest.ts` documenting the 7 Pyreon-native APIs (render / cleanup /
  renderHook + the reactive-graph matchers expectSignal / expectEffect /
  expectGarbageCollected / expectNoReactiveLeak) with source-verified footguns —
  including that render's queries bind to `baseElement` not `container`, cleanup is
  NOT auto-registered without the `/vitest` setup entry, renderHook runs the hook
  ONCE (Pyreon semantics), expectSignal's two matchers are the same check, and the
  GC matchers require `--expose-gc` — plus one grouped entry for the verbatim
  @testing-library/dom re-exports. Wires it into gen-docs (llms.txt / llms-full.txt /
  MCP api-reference), adds the @pyreon/manifest devDep + a manifest-snapshot test.
  Docs/manifest only — no runtime behavior change.

- [#2228](https://github.com/pyreon/pyreon/pull/2228) [`b09187a`](https://github.com/pyreon/pyreon/commit/b09187a1a3cb3352316cff72bfd68883d8720ead) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/testing` — finish the Testing-Library-parity story. The `fireEvent` /
  `waitFor` / `renderHook` / jest-dom-matcher surface shipped in prior releases;
  this hardens the real-Chromium coverage the parity bar requires (happy-dom can't
  exercise real event dispatch, visibility, or focus):

  - `fireEvent` is now proven through **both** halves of Pyreon's event model in a
    real browser: delegated events (`click`/`input`/`change`/`keyDown`/`submit`/
    `pointerDown`/`dblClick`/`focusIn`) that must bubble to the mount-container
    delegation root, AND non-bubbling events (`focus`/`blur`/`mouseEnter`/
    `mouseLeave`) that reach Pyreon's direct `addEventListener`. Also locks the
    `preventDefault → false` boolean return and the generic `fireEvent(el, event)`
    / `createEvent` form.
  - `waitFor` is proven to resolve on a signal-driven DOM change AND to **reject**
    on timeout (not hang); `waitForElementToBeRemoved` is covered.
  - `renderHook` reactive-value + `rerender` semantics are locked in a real mount.
  - The full jest-dom matcher set (`toBeVisible`/`toHaveFocus` — real
    `getComputedStyle`/`activeElement`, `toBeDisabled`/`toBeEnabled`/`toBeChecked`/
    `toHaveValue`/`toHaveClass`/`toHaveAttribute`/`toHaveTextContent`/
    `toBeInTheDocument`/`toBeEmptyDOMElement`) is exercised in real Chromium, each
    passing on the true case and throwing on the false case.

  Docs/README updated to reflect the now-complete surface (the "landing across
  follow-up PRs" caveat is removed).

- Updated dependencies [[`8f0912c`](https://github.com/pyreon/pyreon/commit/8f0912c3a36055aa625d582777850c0c3ecfbc04), [`d9a8dd8`](https://github.com/pyreon/pyreon/commit/d9a8dd80627239d864ebd70de830b50d72eae4c9), [`bdea687`](https://github.com/pyreon/pyreon/commit/bdea687b11ce312ce5a9aaec3a96a44bb6c48d30), [`75a49be`](https://github.com/pyreon/pyreon/commit/75a49befac42202c8237911aa4b111efbbfb1a61), [`cc5250d`](https://github.com/pyreon/pyreon/commit/cc5250d4022638286a0bf89facffb5a585fe2a18), [`19c1ce1`](https://github.com/pyreon/pyreon/commit/19c1ce12a54305ac875d1b19682ecf084addc607), [`f67f3fe`](https://github.com/pyreon/pyreon/commit/f67f3fe451f0aeeb74a024501d30f593ce50b7ff), [`d93e7d3`](https://github.com/pyreon/pyreon/commit/d93e7d3f9a4d679b25a3fc646d99673c2fe276c5), [`22d82cf`](https://github.com/pyreon/pyreon/commit/22d82cf46bad096765f5cb174d2bf3fdadb49902), [`853c9b6`](https://github.com/pyreon/pyreon/commit/853c9b615459fa891bb0876d0b2d05d478deb728), [`3124522`](https://github.com/pyreon/pyreon/commit/31245225c087922575846fa644f93523ff6e1435)]:
  - @pyreon/runtime-dom@0.46.0
  - @pyreon/reactivity@0.46.0
  - @pyreon/core@0.46.0

## 0.45.0

### Patch Changes

- Updated dependencies [[`747cced`](https://github.com/pyreon/pyreon/commit/747cced0efd3611bcff4f0d8ec01417ed5f19e45), [`5cf5387`](https://github.com/pyreon/pyreon/commit/5cf5387fb214108c694e3678a76a113b4d198fa4)]:
  - @pyreon/runtime-dom@0.45.0
  - @pyreon/core@0.45.0
  - @pyreon/reactivity@0.45.0

## 0.44.0

### Patch Changes

- Updated dependencies [[`ae2472e`](https://github.com/pyreon/pyreon/commit/ae2472e4ecb31cd59bde23d1983afe7db1c62d99), [`8413136`](https://github.com/pyreon/pyreon/commit/84131368d6f8790ba50e2af9d383ee289e4b1f5c), [`721618e`](https://github.com/pyreon/pyreon/commit/721618e97dacf995d8356dabea601ef4e98a4a12), [`d859370`](https://github.com/pyreon/pyreon/commit/d8593704b0941ef0e51a427147ebce2a385ecae3)]:
  - @pyreon/runtime-dom@0.44.0
  - @pyreon/reactivity@0.44.0
  - @pyreon/core@0.44.0

## 0.43.1

## 0.43.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.43.0
  - @pyreon/reactivity@0.43.0
  - @pyreon/runtime-dom@0.43.0

## 0.42.0

### Patch Changes

- Updated dependencies [[`39051db`](https://github.com/pyreon/pyreon/commit/39051dbcec2aa5f3aa9db79c5ac0a9f9197cc1e9)]:
  - @pyreon/runtime-dom@0.42.0
  - @pyreon/core@0.42.0
  - @pyreon/reactivity@0.42.0

## 0.41.2

## 0.41.1

## 0.41.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.41.0
  - @pyreon/reactivity@0.41.0
  - @pyreon/runtime-dom@0.41.0

## 0.40.0

### Minor Changes

- [#2036](https://github.com/pyreon/pyreon/pull/2036) [`136376b`](https://github.com/pyreon/pyreon/commit/136376b59f3c09cbf52d9d054963786187bd181b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/testing` is now a thin adapter over `@testing-library/dom` (the shared foundation under the React/Vue/Solid/Svelte testing libraries) instead of a from-scratch reimplementation. `render` mounts a Pyreon component and binds the full `@testing-library/dom` query set to it; `screen`, `fireEvent`, `waitFor`, `within`, `prettyDOM`, and every query (`getByRole` with real ARIA + accessible-name resolution, `getByText`, `getByLabelText`, `getByTestId`, …) are re-exported verbatim — so the entire Testing-Library API works exactly as you know it, with the ecosystem's battle-tested edge-case handling. This matches how every Pyreon adapter package is built (`@pyreon/query` wraps TanStack, `@pyreon/dnd` wraps pragmatic-drag-and-drop). `fireEvent` through Pyreon's event delegation is verified in a real browser.

- [#2038](https://github.com/pyreon/pyreon/pull/2038) [`b7f132e`](https://github.com/pyreon/pyreon/commit/b7f132eb64b614666d9c8c50d5c66f38851e51d4) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/testing` gains the GC / leak matchers. `expectGarbageCollected(factory)` collapses the hand-rolled `WeakRef` + two-pass-`gc()` ceremony into one call; `expectNoReactiveLeak(action)` asserts that a mount+unmount (or any action) leaves no net new nodes in the reactive graph after GC — catching the subscription/effect-scope retention leak class. Both require `--expose-gc` (`execArgv: ['--expose-gc']` in the vitest config) and throw an actionable error when it's absent rather than silently passing.

- [#2036](https://github.com/pyreon/pyreon/pull/2036) [`136376b`](https://github.com/pyreon/pyreon/commit/136376b59f3c09cbf52d9d054963786187bd181b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/testing` gains `renderHook` and two setup sub-entries. `renderHook(hook, { initialProps })` runs a Pyreon hook once in a probe component (Pyreon semantics — hooks run once) and exposes its return via `result.current`; `rerender(props)` updates a reactive props signal so `computed`/`effect` derivations re-run without re-invoking the hook. `@pyreon/testing/matchers` registers the `@testing-library/jest-dom` matchers (the complete, battle-tested set every Testing-Library user knows — `toBeInTheDocument`, `toBeVisible`, `toHaveAccessibleName`, `toBeChecked`, …) rather than a hand-rolled subset; `@pyreon/testing/vitest` is a `setupFiles` entry that also auto-registers `afterEach(cleanup)`. `@testing-library/jest-dom` is an optional peer dependency.

- [#2037](https://github.com/pyreon/pyreon/pull/2037) [`c184330`](https://github.com/pyreon/pyreon/commit/c184330594a7726c4f1f1095cc3a785cfe9ef3f7) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/testing` gains the reactive-native matchers — the differentiator DOM-only testing libraries can't express. `expectSignal(sig).toHaveChangedTimes(n)` / `expectSignal(computed).toHaveRecomputedTimes(n)` assert fire counts; `expectEffect(handle).toReRunWhen(action)` and `.notToReRunWhen(action)` assert fine-grained re-run behavior — the NEGATIVE form ("this unrelated write did NOT re-run the effect") is impossible under a whole-component re-render model. They read Pyreon's reactive graph and require a dev/test build (a production build tree-shakes the graph — the matchers throw a clear error rather than silently pass). Replaces the hand-rolled `let ran = 0; …; expect(ran).toBe(n)` pattern.

- [#2033](https://github.com/pyreon/pyreon/pull/2033) [`2091a13`](https://github.com/pyreon/pyreon/commit/2091a1363e94e3c2f52fb404ce7c80911520ea0f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - New package `@pyreon/testing` — official testing utilities for Pyreon. This first cut ships the Testing-Library core: `render(ui, options?)` (mounts into an isolated container, returns bound queries + `unmount`/`debug`), `screen` (document-scoped queries), `cleanup()` (unmounts every rendered tree; auto-registerable in `afterEach`), and the `getByText`/`getByTestId` query families (`getBy`/`queryBy`/`getAllBy`/`findBy` variants). Interaction (`fireEvent`/`waitFor`), ARIA-role queries, `renderHook`, jest-dom matchers, and the reactive-native matchers follow in subsequent releases.

### Patch Changes

- [#2060](https://github.com/pyreon/pyreon/pull/2060) [`4e6d768`](https://github.com/pyreon/pyreon/commit/4e6d768cacacc3b7595dbdb0cf41bded5ac287dd) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix `render()` failing to find portaled content. Bound queries (`getByRole`, `getByText`, …) now resolve from `baseElement` (`document.body` by default) instead of the mount container — matching `@testing-library/react`. Pyreon `<Portal>` / Overlay / Modal / Toast / Dropdown render OUTSIDE the container (into `document.body`), so container-scoped queries silently failed to find any modal/overlay/tooltip. Scope to a single tree with `within(result.container)` when needed.

- Updated dependencies [[`e6d3905`](https://github.com/pyreon/pyreon/commit/e6d390586944b903ee8d9c97a71cbaf26eca63d6), [`a5021f6`](https://github.com/pyreon/pyreon/commit/a5021f631729add83b2808a18288a2c48f81c233), [`ea835ad`](https://github.com/pyreon/pyreon/commit/ea835ad364e3dcf0de8337fceed382e9f6762285), [`4958096`](https://github.com/pyreon/pyreon/commit/4958096c01f4ed4f031cc65bf9ff7c26c93d3449), [`e859638`](https://github.com/pyreon/pyreon/commit/e859638a4c382051d5fa6f2605a8c383207f6e66), [`c184330`](https://github.com/pyreon/pyreon/commit/c184330594a7726c4f1f1095cc3a785cfe9ef3f7), [`85d4a91`](https://github.com/pyreon/pyreon/commit/85d4a91c5e015af7348ebdd312e0ba5523950a3d), [`ed364d2`](https://github.com/pyreon/pyreon/commit/ed364d2a34f4b74df94c02f3c2e630b96a4f2e7f)]:
  - @pyreon/runtime-dom@0.40.0
  - @pyreon/reactivity@0.40.0
  - @pyreon/core@0.40.0
