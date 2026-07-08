# @pyreon/testing

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
