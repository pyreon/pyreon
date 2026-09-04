# @pyreon/machine

## 0.52.0

### Minor Changes

- Co-locate native runtimes into their own packages. (ed6518a)

  The Swift/Kotlin runtimes for form, store, state-tree, machine, i18n, permissions,
  and query move out of the `@pyreon/native-runtime-*` monolith into each package's
  `native/{swift,kotlin}/` (declared via the `pyreon.native` package.json field,
  aggregated by `pyreon-native wire`). Framework-base runtimes (reactivity/styling/JSON
  helpers) stay in the monolith. A new `scripts/check-native-cosource.ts` gate compiles
  and smoke-runs every co-located `.swift`/`.kt` against the stub harness so a relocated
  runtime can't rot silently. No API change — this is a source-location move.

### Patch Changes

- Update third-party dependencies to their latest compatible releases, (ea669a1)
  extending #3174's sweep to every package.json the first pass hadn't reached
  (that pass touched only the root manifest, so nothing there tripped the
  Changeset gate — this one edits per-package manifests directly and does).

  Runtime dependencies that reach consumers: `oxc-parser`/`oxc-transform`
  0.147 → 0.148 (`@pyreon/compiler`, `@pyreon/native-compiler`, `@pyreon/lint`
  — `@oxc-project/types` alongside it), `magic-string` 1.2.2 → 1.2.3
  (`@pyreon/compiler`), the CodeMirror 6 family — `@codemirror/search` and
  `@codemirror/state` 6.7.1 → 6.7.2, `@codemirror/legacy-modes` 6.5.3 → 6.5.4
  (`@pyreon/code`), TipTap 3.30.3 → 3.31.2 (`@pyreon/rich-text`), TanStack Query
  5.102.2 → 5.102.8 across `@tanstack/query-core` and its persist/devtools
  companions (`@pyreon/query`, and the shared root override so `@pyreon/http`
  agrees), `@tanstack/table-core` 9.1.2 → 9.2.4 (`@pyreon/table`), the
  pragmatic-drag-and-drop family (`@pyreon/dnd`) — core 3.0.0 → 3.1.0,
  auto-scroll 3.1.0 → 3.2.0, hitbox 2.1.0 → 2.2.0, all in-range within the
  v3 major this repo already adopted.

  Dev-only comparison/tooling bumps across the touched packages: `rolldown`,
  `react-hook-form`, `hotkeys-js`, `axios`, `ky`, `i18next`, `xstate`, `joi`,
  `typia`, `nuqs`, `@tanstack/react-virtual`, `@tanstack/react-table`,
  `@tanstack/react-query`, `motion`, and `mobx-state-tree` 7.4.0 → 8.0.0 — a
  real major, but its own peer range for `mobx` moved `^6.3.0` → `^7.0.0`,
  which matches what this repo already declares (`^7.0.3`); the OLD pin was
  the one silently out of range.

  `happy-dom` deduped to ONE resolved version repo-wide — three stale copies
  (20.11.6/20.12.0/20.13.2) were co-installed before this pass across the ~17
  packages that each pin it independently. The unification target is
  **20.11.6, not the newest 20.13.2** — bumping past 20.11.6 breaks
  `@pyreon/styler`'s `memory-growth.test.ts` deterministically (5/5 local
  runs, plus a CI failure on `test (fundamentals+ui-system+zero)`), a pure
  `environment: 'happy-dom'` test whose eviction-cycle counting depends on
  CSSOM/`cssRules` behavior that changed somewhere between those versions —
  confirmed by isolating the version with an exact pin, not by assumption; 3/3
  clean at 20.11.6, 5/5 failing at 20.13.2. Verified pre-existing on `main`
  (3/3 passes there, at 20.11.6) so this is the same "routine bump, unvetted
  runtime behavior change" shape as the `@tanstack/virtual-core` finding
  below, just caught before push instead of by CI. The one other consumer
  pinning past 20.11.6 — `@happy-dom/global-registrator` in
  `examples/benchmark`, whose own 20.13.2 release requires `happy-dom
^20.13.2` as a peer — is reverted to `^20.11.6` alongside it, so the whole
  graph resolves to one version again.

  `examples/benchmark`'s framework competitors were refreshed too so the
  "fastest framework" comparisons stay honest against current releases: Vue +
  `@vue/server-renderer` + `@vue/compiler-dom` 3.5.41 → 3.5.42, Svelte 5.56.10
  → 5.57.0, and Octane 0.1.46 → 0.2.2 (its peer `@octanejs/vite-plugin`
  0.1.46 → 0.1.52 alongside it) — a real minor jump, verified with a clean
  production build before committing to it. Octane 0.2.2 replaces the
  `forBlock` fast-path flag the row-list bench's own doc comment describes
  un-handicapping with a new `fastKeyedForBlock` path; the bench impl still
  reaches it (confirmed by compiling `octane.tsrx` through `octane/compiler`
  0.2.2 and reading the emitted flags), so the comparison stays fair, but
  every previously-published Pyreon-vs-Octane number in
  `.claude/skills/pyreon-benchmarks/SKILL.md` was measured against 0.1.46 and
  needs re-verification against 0.2.2 before being cited again — flagged
  there, not restated as fact here.

  Held deliberately, each for a stated reason found by actually reading the
  dependency rather than assuming: TypeScript stays capped `<7.0.0` (removes
  the classic Compiler API `@pyreon/compiler`/`@pyreon/mcp`/`@pyreon/cli` are
  built on). `vitest`/`@vitest/browser`/`@vitest/browser-playwright`/
  `@vitest/coverage-v8` stay on 4.1.11 as one locked unit (5.0.0 just went GA
  and changes `clearMocks` to default `true`, tightens `coverage.include`/
  `exclude` matching, and removes several import entrypoints — exactly the
  class of change this repo's `Coverage (Full)` gate has already rotted on
  three times; a real migration, not a version bump). `@changesets/cli`
  2.31.1 → 3.0.1 and `@changesets/changelog-github` 0.7.0 → 1.0.0 stay put:
  1.0.0 ships `"type": "module"` with no CJS export, and this repo's own
  `.changeset/resilient-changelog.cjs` does `require('@changesets/changelog-
github')` — bumping it would break `changeset version` at release time with
  `ERR_REQUIRE_ESM`, verified by reading the published package's `exports`
  map, not assumed. The root `uuid` override stays at `11.1.1` for the same
  reason, one level removed: it force-pins a transitive dep of `exceljs`
  (`^8.3.0`, itself already outside its own declared range on purpose), and
  `uuid` 12.0.0 dropped CommonJS support entirely — `exceljs`'s own bundled
  code does `require('uuid')`, verified directly in its installed `dist/`, so
  the same ESM-only trap applies one hop further down the graph.

  One more found by actually running the browser test tier, not just typecheck
  and the node/happy-dom suite: `@tanstack/virtual-core` was bumped 3.17.4 →
  3.17.8 in this branch's first pass (a routine-looking override edit, not
  vetted as carefully as the deps above), and it broke
  `@pyreon/virtual`'s real-Chromium `repositions a STAYING row below when row 0
is remeasured taller` test deterministically (3/3 local runs, plus 3/3 CI
  retries) — bisected down to virtual-core's own 3.17.7 "synchronous
  notification for scroll compensation" change, not to anything else in this
  branch (ruled out `@tanstack/react-virtual`, unrelated — not imported by this
  code path at all; ruled out the `oxc-parser`/`magic-string`/`rolldown`
  bumps too, by reverting each in isolation and rebuilding). Reverted back to
  3.17.4, matching what's currently on `main`, and NOT bumped further.

  This surfaced something that predates this PR: `@pyreon/virtual`'s own
  `package.json` has declared `@tanstack/virtual-core: "^3.17.7"` since an
  earlier fix (commit 973c4e323, "the root overrides pinned
  @tanstack/virtual-core to 3.17.4 while three packages declared ^3.17.7, so
  the installed version did not satisfy its own consumers' declared range")
  — but the root override was only ever bumped to 3.17.4 there, not to
  3.17.7+, so the exact mismatch that fix describes is still live on `main`
  today: the declared floor and the resolved version disagree, silently,
  because the currently-resolved 3.17.4 happens to still pass. Bumping the
  override to actually satisfy the package's own declared range (3.17.7,
  confirmed — not just 3.17.8) is what surfaces the real compatibility break
  in `use-virtualizer.ts`'s remeasurement handling. Left as-is here rather
  than fixed, because closing it needs either updating the wrapper for
  virtual-core's new synchronous-notification timing or re-adjudicating the
  test's assumptions against it — real source-level work, not a version
  bump. Tracked as a known gap, not silently left broken: someone picking
  this up should treat `bun run test:browser` in `@pyreon/virtual` as the
  regression gate, not just `bun run test`, which does not exercise this
  path at all (confirmed: the full node/happy-dom suite passes 1805/1805
  regardless of which virtual-core version is resolved).

- Update external dependencies to latest across the workspace: tanstack query/virtual patches, tiptap 3.29.2, codemirror view 6.43.8, shiki 4.4.2, elkjs 0.12, yjs 13.6.32, MCP SDK 1.30, oxc 0.143, magic-string 1.1.0, pragmatic-drag-and-drop 2.0.2, and tooling (vite 8.2.0, playwright 1.62.1 — both previously held back by upstream bugs now fixed). `@pyreon/testing` widens its `@testing-library/jest-dom` peer to `^6.0.0 || ^7.0.0` (v7 verified). TypeScript stays capped `<7.0.0` (TS7 removed the classic Compiler API); `@tanstack/table-core` stays on v8 (v9 is a structural API rewrite that would break `@pyreon/table`'s public options surface — tracked as its own migration). (1d74edc)
- Ship the MIT LICENSE file in the package tarball (8aeffe0)

  These eight published packages were missing a `LICENSE` file. The repo's
  own rule has always been that every package carries one ("Every package
  MUST have `LICENSE` (MIT) and `README.md` — no exceptions"), but nothing
  enforced it, so the gap went unnoticed.

  No runtime change. It matters anyway: consumers, vendoring tools and
  licence scanners read the file from the tarball, and its absence makes an
  MIT-licensed package look unlicensed at the point where that question is
  actually asked. A gate now keeps every workspace covered.

- fix(machine): reject non-existent transition targets at construction; batch the `always` cascade so reactive readers never see a transient state (faf933f)

  - **A non-existent / typo'd transition target used to silently corrupt the machine.** `resolveTransition`/`resolveAlways` returned the target without checking it exists, so `send('GO')` into a typo'd `'lodaing'` set the state there — `matches(...)` false for every real state, `nextEvents()` empty, every subsequent `send()` a no-op — permanently stuck, with no error (TS doesn't F-bound targets to `keyof states`, so it compiles clean; JS consumers have no protection at all). Every `on` / `always` / guarded target is now validated at `createMachine(...)` and throws like an invalid `initial` does.
  - **The `send`/`reset`/creation `always` cascade wasn't batched**, so a reactive reader (`effect`/`computed` on `machine()`) re-ran once per intermediate `always` step and observed the transient state — contradicting the manifest's documented "a transient state is never observed by reactive readers". The mutation + cascade are now wrapped in `batch()`; a subscriber settles on the final state, while the per-step `onEnter`/`onExit`/`onTransition` imperative callbacks still fire per step.
  - **Documented a `reset()` gotcha** (JSDoc): `reset()` sets the state directly and deliberately does NOT fire `onExit(current)` / `onEnter(initial)`, so a resource acquired in `onEnter` and released in `onExit` (the "timer on enter, clear on exit" pattern) is not torn down by `reset()` — clean it up explicitly first. (Behavior unchanged — an existing test locks this contract.)

  Bisect-verified (target-validation throws; effect never observes the transient). Full `@pyreon/machine` suite (132) green.

- Updated dependencies:
  - @pyreon/reactivity@0.52.0

## 0.51.0

### Patch Changes

- Every package manifest now declares its MULTIPLATFORM story as data: (4e53471)
  `multiplatform: { tier: 'shared' | 'service-backend' | 'web-only', rationale }`
  (a discriminated union — `web-only` REQUIRES the rationale sentence). The
  assignments transcribe the classification the multiplatform docs and the PMTC
  compiler's own `WEB_ONLY_PACKAGES` registry already maintain, and the new
  `check-multiplatform-tier` gate (validate-fast family) holds the contract:
  a manifest without a tier, a published package with neither manifest nor
  explicit exemption, a `web-only` without a rationale, or a stale generated
  tier table all fail CI — so a new package can never again silently default
  to web-only while the ecosystem advertises "one codebase, three targets".

  No runtime change in any package: manifests are docs-pipeline inputs and are
  stripped from published tarballs; every generated surface (llms, MCP
  api-reference, reference pages) is byte-identical.

- Updated dependencies:
  - @pyreon/reactivity@0.51.0

## 0.50.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.50.0

## 0.49.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.49.0

## 0.48.0

### Minor Changes

- [#2353](https://github.com/pyreon/pyreon/pull/2353) [`3f1120a`](https://github.com/pyreon/pyreon/commit/3f1120aaa5ee69b85f5de56681a655ba30bf0f67) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Inference type helpers across the libraries — "derive, don't annotate twice". All type-only (`export type`, zero runtime bytes):

  - `@pyreon/reactivity`: `SignalValue<S>` / `ComputedValue<C>` (unwrap a signal/computed/accessor to its value type), `MaybeAccessor<T>` (the framework-wide value-or-accessor parameter shape — NOT auto-called, resolve inside a reactive scope), `AccessorReturn<A>` (resolve a MaybeAccessor back to its value type).
  - `@pyreon/store`: `StoreState<Api>` (unwrapped per-field value shape — schema stores give the schema-inferred `TRaw`; composition stores give the signal fields unwrapped, computeds/actions excluded, mirroring the runtime `api.state` snapshot), `StoreActions<Api>` (the plain-function action surface).
  - `@pyreon/form`: `FormValues<F>` (TValues from the `useForm` return OR its options), `FieldNames<F>`, `FieldValue<F, K>`, and the standalone opt-in `NestValues<T>` (flat dot-path shape → nested payload shape — the type companion of runtime `nestValues()`; deliberately NOT threaded through `useForm`'s signature, whose value model stays flat).
  - `@pyreon/router`: `LoaderData<L>` — a loader's resolved data type from the loader function itself, for `useLoaderData<LoaderData<typeof loader>>()`.
  - `@pyreon/i18n`: opt-in typed translation keys — `MessageKeys<M>` (dot-path key union, plural suffixes collapsed, recursion depth-capped at 6 levels), `TranslationParams<M, K>` (`{{param}}` extraction incl. inline format specs + `count: number` for plural keys; needs `as const`), `TypedTranslationKey<M>`, and a purely additive generic overload `createI18n<typeof en>(options)` returning `I18nInstance<TypedTranslationKey<M>>` whose `t` rejects typos (namespaced `ns:key` strings stay unchecked). `I18nInstance` gained a `TKey extends string = string` parameter (default `string` — untyped usage byte-identical); `t` is now declared method-style so typed instances stay assignable to `I18nInstance` (Provider contract).
  - `@pyreon/machine`: `StateOf<M>` / `EventOf<M>` — state/event unions from the machine INSTANCE or a raw config (the pre-existing `InferStates`/`InferEvents` are config-only and silently yield `never` on an instance — README example fixed accordingly).
  - `@pyreon/query`: `QueryData<R>` / `QueryError<R>` — unwrap the adapter's fine-grained result bags (`useQuery`/suspense/infinite; infinite results derive `InfiniteData<Page>`); tagged query-KEY inference remains TanStack's own `InferDataFromTag` (not duplicated).

### Patch Changes

- Updated dependencies [[`a333656`](https://github.com/pyreon/pyreon/commit/a333656ac79c7a43163b0a07f593aa71a59e124d), [`3f1120a`](https://github.com/pyreon/pyreon/commit/3f1120aaa5ee69b85f5de56681a655ba30bf0f67), [`1fa3347`](https://github.com/pyreon/pyreon/commit/1fa33473514e64ebc07e3e75ad818fe1a9f89245)]:
  - @pyreon/reactivity@0.48.0

## 0.47.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.47.0

## 0.46.0

### Patch Changes

- [#2254](https://github.com/pyreon/pyreon/pull/2254) [`356a9d6`](https://github.com/pyreon/pyreon/commit/356a9d6f4cdcb3f0b3ad50994cd28e0ff6c35fbb) Thanks [@vitbokisch](https://github.com/vitbokisch)! - docs(machine): document the instance query + control surface. The manifest was
  already excellent (dense summaries + 5 gotchas), but four reactive public methods
  were only mentioned in passing — now a grouped api[] entry: `matches(...states)`
  (variadic OR), `nextEvents()` (declared `on` keys — NOT guard-filtered, excludes
  `always`, verified machine.ts:182), `reset()` (initial + its `always` cascade),
  `dispose()` (clears all listeners; the machine still transitions afterward). Each
  carries a source-verified foot-gun. Regenerates the MCP api-reference machine
  region + snapshot test (entry count 4 → 5). Docs/manifest only — no runtime change.
- Updated dependencies [[`75a49be`](https://github.com/pyreon/pyreon/commit/75a49befac42202c8237911aa4b111efbbfb1a61), [`cc5250d`](https://github.com/pyreon/pyreon/commit/cc5250d4022638286a0bf89facffb5a585fe2a18), [`19c1ce1`](https://github.com/pyreon/pyreon/commit/19c1ce12a54305ac875d1b19682ecf084addc607), [`f67f3fe`](https://github.com/pyreon/pyreon/commit/f67f3fe451f0aeeb74a024501d30f593ce50b7ff), [`d93e7d3`](https://github.com/pyreon/pyreon/commit/d93e7d3f9a4d679b25a3fc646d99673c2fe276c5)]:
  - @pyreon/reactivity@0.46.0

## 0.45.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.45.0

## 0.44.0

### Patch Changes

- Updated dependencies [[`d859370`](https://github.com/pyreon/pyreon/commit/d8593704b0941ef0e51a427147ebce2a385ecae3)]:
  - @pyreon/reactivity@0.44.0

## 0.43.1

## 0.43.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.43.0

## 0.42.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.42.0

## 0.41.2

## 0.41.1

## 0.41.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.41.0

## 0.40.0

### Patch Changes

- Updated dependencies [[`c184330`](https://github.com/pyreon/pyreon/commit/c184330594a7726c4f1f1095cc3a785cfe9ef3f7), [`ed364d2`](https://github.com/pyreon/pyreon/commit/ed364d2a34f4b74df94c02f3c2e630b96a4f2e7f)]:
  - @pyreon/reactivity@0.40.0

## 0.39.0

### Patch Changes

- Updated dependencies [[`fa95aba`](https://github.com/pyreon/pyreon/commit/fa95aba3aebc24d0178093cd89870b8807beca72), [`794fb27`](https://github.com/pyreon/pyreon/commit/794fb27e6fa67e71608b603cd627cf4eff61a102), [`f7083e5`](https://github.com/pyreon/pyreon/commit/f7083e5a56768fb67e097ec9bc6ee6d1bc6e0d09), [`c82687c`](https://github.com/pyreon/pyreon/commit/c82687c07a2b2ba976787dea74bc891f72a1165a)]:
  - @pyreon/reactivity@0.39.0

## 0.38.0

### Patch Changes

- Updated dependencies [[`cfa422f`](https://github.com/pyreon/pyreon/commit/cfa422fdb6985e50c74e06cf0f4c1318213d6303), [`0376a3d`](https://github.com/pyreon/pyreon/commit/0376a3ddc75dd1fbee582e7cabe98beb01d60073), [`6ee46e7`](https://github.com/pyreon/pyreon/commit/6ee46e7dca1cb01aacaa7c61ef5dbbcf12b30668)]:
  - @pyreon/reactivity@0.38.0

## 0.37.1

## 0.37.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.37.0

## 0.36.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.36.0

## 0.35.0

### Minor Changes

- [#1699](https://github.com/pyreon/pyreon/pull/1699) [`fb82997`](https://github.com/pyreon/pyreon/commit/fb82997ddc322b8d72cdb8914cba28fa8e8d6526) Thanks [@vitbokisch](https://github.com/vitbokisch)! - API polish pass (breaking, pre-1.0 — clean over backward-compatible):

  - **`send(event, payload?)` now returns the settled `TState`** (after any `always` cascade) instead of `void` — so `const next = machine.send('GO')` works, matching what users expect. Returns the unchanged current state for an unhandled event or a rejected guard. (Type-level breaking; existing callers that ignore the return are unaffected at runtime.)
  - **`can(event, payload?)` now predicts `send` EXACTLY** — it always evaluates the guard with the given payload (or `undefined` if none). Previously a guarded event with no payload reported `true`; now it evaluates the guard, so `can('LOGIN')` with no/invalid payload against a payload-reading guard reports `false`. (Behavioral breaking — the precise, correct semantic.)
  - **Guards are now throw-safe** — a guard that throws (e.g. reading a property of a missing payload) DENIES the transition rather than crashing `send` / `can` / the `always` cascade. Consistent with `@pyreon/permissions` predicate evaluation. This is what makes the precise `can(event)` (no-payload) safe.

  Tests: +7 (send return value across transition / always-cascade / unhandled / guard-reject / throw-safe; can throw-safety + payload). The 3 tests that codified the old `can`-without-evaluating-guard behavior were updated to the new precise contract. Bisect-verified `safeGuard` (3 throw-safe tests fail when neutered) and the `send` return (5 fail when reverted to void). Coverage holds above the package's 98% floor.

- [#1693](https://github.com/pyreon/pyreon/pull/1693) [`446f5a6`](https://github.com/pyreon/pyreon/commit/446f5a654b956d66199e0d1cf2077827a8c07d0c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Complete the core statechart semantics that fit `@pyreon/machine`'s constrained-signal philosophy (the synchronous transition-logic features XState has — not the data/async features Pyreon deliberately offloads to signals/effects):

  - **Eventless (`always`) transitions** — `states.X.always: target | { target, guard } | [...]` fire synchronously on entering a state (and for the initial state at creation / on `reset()`), cascading until none apply; first unguarded entry or first passing guard wins. Guards receive no payload (read external signals). Models transient/condition states (`check → pass | fail`) that are never observed by `machine()`. A self-looping `always` throws after 1000 steps.
  - **Final states** — `states.X.final: true` + reactive `machine.isFinal()` + `machine.onDone(cb)` (fires with the triggering event when a final state is entered, including via an `always` cascade).
  - **`onExit(state, cb)`** — exit listeners, completing the lifecycle set (`onEnter` / `onExit` / `onTransition` / `onDone`). On each transition they fire in state-chart order: `onExit(from)` (machine still reads `from`) → `onTransition` → `onEnter(to)` → `onDone` if final. Pairs with `onEnter` for per-state setup/teardown (the idiomatic delayed-transition pattern — no built-in `after`, by design).
  - **`can(event, payload?)`** — now precise when given a payload (evaluates the guard, predicting `send` exactly). Without a payload a guarded event still reports `true` (backward-compatible).

  Also fixes `InferEvents` to robustly union event names across heterogeneous state shapes (states with only `always`/`final` and no `on` no longer collapse the inference to `never`).

  Deliberately out of scope (offloaded to Pyreon primitives, per the package's stated philosophy): extended-state/context → signals; invoked actors/services → effects+signals; hierarchical/parallel states → compose machines; delayed `after` → `onEnter`+timer+`onExit`. The package remains "a constrained signal with statechart transition semantics," not an XState clone. Backward-compatible: all pre-existing tests pass unchanged.

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.35.0

## 0.34.0

### Patch Changes

- Updated dependencies [[`66d44c5`](https://github.com/pyreon/pyreon/commit/66d44c58920bf81848e9ba858c413a88727a3c65)]:
  - @pyreon/reactivity@0.34.0

## 0.33.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.33.0

## 0.32.0

### Patch Changes

- Updated dependencies [[`0c1ea1e`](https://github.com/pyreon/pyreon/commit/0c1ea1e89e4228e84367efd5d2cb334808955a25), [`e36bbe5`](https://github.com/pyreon/pyreon/commit/e36bbe52e7f1417a703b4e6ce23281c448d9132f), [`65ccdf2`](https://github.com/pyreon/pyreon/commit/65ccdf2ad95a16b676b58948acea51f957e5cf62), [`7f89196`](https://github.com/pyreon/pyreon/commit/7f89196dd3d99f61b0bba032481b9d389fdd8264)]:
  - @pyreon/reactivity@0.33.0

## 0.31.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.33.0

## 0.30.0

### Patch Changes

- Updated dependencies [[`6feb9d4`](https://github.com/pyreon/pyreon/commit/6feb9d4bc8cc873191bfe97fac0afb88d5135388), [`960bb0f`](https://github.com/pyreon/pyreon/commit/960bb0f139839de49508d836878b98556b1c7d07), [`b720267`](https://github.com/pyreon/pyreon/commit/b720267f0d9fbe260398c56d49834dc1dd2b09fb)]:
  - @pyreon/reactivity@0.33.0

## 0.29.0

### Patch Changes

- Updated dependencies [[`c54ce0f`](https://github.com/pyreon/pyreon/commit/c54ce0f284dab0335d9b597488ba75c6dea92b43), [`6d3e085`](https://github.com/pyreon/pyreon/commit/6d3e085183ec42883a842967afe22f806f0ea21d), [`c2874df`](https://github.com/pyreon/pyreon/commit/c2874df8f2b07b19aaa7a64c2f9ff2ab6b11d2f0)]:
  - @pyreon/reactivity@0.33.0

## 0.28.1

### Patch Changes

- [#1226](https://github.com/pyreon/pyreon/pull/1226) [`63bdb95`](https://github.com/pyreon/pyreon/commit/63bdb956b9d1ac5db779672f0cd7314de672fac9) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lock coverage thresholds at ≥95% statements / branches / functions / lines. All 4 packages already measure at 100% on every metric (machine 63/63, store 13/13, virtual 59/59, kinetic-presets 198/198) — this PR just locks the thresholds.

## 0.28.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.33.0

## 0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.33.0

## 0.26.3

## 0.26.2

## 0.26.1

## 0.26.0

### Patch Changes

- Updated dependencies [[`885d6d9`](https://github.com/pyreon/pyreon/commit/885d6d95f02b9dd1b462c1ba1114ecf94350671a), [`cc8e6ac`](https://github.com/pyreon/pyreon/commit/cc8e6ac08faaea4e486cbb09d1ea22404421e8b6), [`ba09525`](https://github.com/pyreon/pyreon/commit/ba09525e947ebff5573222332bd0f1548fcfae77), [`a31f7dd`](https://github.com/pyreon/pyreon/commit/a31f7dd8f8ddba6864c69bbf53117d36ddd477a3), [`71901d4`](https://github.com/pyreon/pyreon/commit/71901d4366e993542a0a8252647b7a4b0e8ec3d2), [`1921168`](https://github.com/pyreon/pyreon/commit/192116843a0547c777e884f0254ffc51a69bfae1), [`749c2f4`](https://github.com/pyreon/pyreon/commit/749c2f435909740ea43d528ebfc00a2155e64f74)]:
  - @pyreon/reactivity@0.33.0

## 0.25.1

### Patch Changes

- [#902](https://github.com/pyreon/pyreon/pull/902) [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Ship source maps in published tarballs.

  Every `@pyreon/*` package now ships its `.js.map` and `.d.ts.map` files. The previous `!lib/**/*.map` exclusion in each package's `files` array left every emitted JS file pointing at a `//# sourceMappingURL=*.map` that wasn't actually published — causing Vite (and other bundlers) to log a "Failed to load source map" warning per file on every cold dev start. Real bug in shipped tarballs, not just dev-noise theory.

  The fix is shipping the maps. They make framework stack traces readable: `at mountChild (node_modules/@pyreon/runtime-dom/src/nodes.ts:147)` instead of `at e (node_modules/@pyreon/runtime-dom/lib/index.js:1:42857)`. This matters most when a user hits a framework bug, opens devtools, or sees an unreadable production error from a server-side render. Sentry / Bugsnag / Rollbar can also translate framework frames using the shipped maps; without them, the framework's part of every captured stack stays opaque.

  Cost: ~350KB-1MB per package in `node_modules`. Bundlers (Vite, Webpack, Rollup, esbuild) strip source maps from production builds automatically; they never reach end users. Every comparable library (React, Vue, Solid, Preact, Svelte, TanStack) does this.

  No API changes. The `check-distribution` CI gate inverts to enforce the new contract (maps must be present, not absent).

- Updated dependencies [[`c862965`](https://github.com/pyreon/pyreon/commit/c8629652a94ca7d1e8622cd2de5b4ac009874dbf), [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e)]:
  - @pyreon/reactivity@0.25.1

## 0.25.0

### Patch Changes

- Updated dependencies [[`7da5b2b`](https://github.com/pyreon/pyreon/commit/7da5b2bcbc2aebd9600cb8fdefb763ace7f78c1a), [`bc145f3`](https://github.com/pyreon/pyreon/commit/bc145f3dd6ff8414ab3d36f7723d7f1217d19835), [`6075127`](https://github.com/pyreon/pyreon/commit/60751278894a6ff843c0f6f6c4894c76bcb6a720), [`f71fb4c`](https://github.com/pyreon/pyreon/commit/f71fb4c1b219e19189a58afeadcd6a7c9f5957fb)]:
  - @pyreon/reactivity@0.25.0

## 0.24.6

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.24.6

## 0.24.5

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.24.5

## 0.24.4

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.24.4

## 0.24.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.24.3

## 0.24.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.24.2

## 0.24.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.24.1

## 0.24.0

### Patch Changes

- Updated dependencies [[`67e1f37`](https://github.com/pyreon/pyreon/commit/67e1f371a20219481ee9564d2d7421ec2a0b5ddf), [`b8fb31c`](https://github.com/pyreon/pyreon/commit/b8fb31cf1a59578fc33f27d539695d2bc164b2f1), [`f400e85`](https://github.com/pyreon/pyreon/commit/f400e85282a370276d5ae0266ba501c41dce4f3e), [`891ca43`](https://github.com/pyreon/pyreon/commit/891ca4300727119dafd66ceaacd7cb39e68f3b4e), [`d4ec777`](https://github.com/pyreon/pyreon/commit/d4ec777643446ed2c51dedb1e74fbd8dce70bdfd), [`2abb672`](https://github.com/pyreon/pyreon/commit/2abb672d8a8bf7f4940af422bf8bf802aa129cdd)]:
  - @pyreon/reactivity@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [[`3499594`](https://github.com/pyreon/pyreon/commit/3499594585b7fcb650ac0f80be4bc355f741491b)]:
  - @pyreon/reactivity@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [[`c3d0a70`](https://github.com/pyreon/pyreon/commit/c3d0a7017ed2ef4468ec3fb4e4c09ec869d2917a), [`ecd8e52`](https://github.com/pyreon/pyreon/commit/ecd8e526943a1e6b07957ff96f4410fa482baa0d), [`c4b6e9a`](https://github.com/pyreon/pyreon/commit/c4b6e9a5850196171c2197fc918163f736708aa8), [`fb40906`](https://github.com/pyreon/pyreon/commit/fb409066e49e44c42f77084a92a68103a4e6c5ef), [`9f03747`](https://github.com/pyreon/pyreon/commit/9f037478763d9f8cd2365feb63dc87fda2545e5d), [`3374150`](https://github.com/pyreon/pyreon/commit/33741500499dfb487d031bbffe77723d74b8f261)]:
  - @pyreon/reactivity@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.16.0

## 0.14.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.13.0

## 0.12.15

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.12.15

## 0.12.14

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.12.11

## 0.9.0

### Minor Changes

- ### Improvements
  - Upgrade to pyreon 0.7.5 (jsx preset, all JSX types accept undefined)
  - Use @pyreon/typescript preset (no local jsx override needed)
  - Complete documentation: 18 package READMEs, 18 docs/ files, llms.txt
  - Update AI building rules with document generation patterns

## 0.8.0

### Minor Changes

- [`075dd4f`](https://github.com/pyreon/fundamentals/commit/075dd4fe4a325fe5a5637a68e209dffe665bb84e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - ### Improvements
  - Upgrade to TypeScript 6.0 and pyreon 0.7.3
  - Switch to @pyreon/typescript for tsconfig presets
  - Full exactOptionalPropertyTypes compliance
  - Security: add sanitization across all document renderers (XSS, XML injection, protocol validation)
  - Fix WebSocket.send() type for TS 6.0
  - Clean up conditional spreading now that core 0.7.3 accepts undefined on JSX attrs

## 0.7.0

### Minor Changes

- [`deb9834`](https://github.com/pyreon/fundamentals/commit/deb983456472cc685d80e97b21196588af53b502) Thanks [@vitbokisch](https://github.com/vitbokisch)! - ### New package

  - `@pyreon/document` — universal document rendering with 18 node primitives and 14 output formats (HTML, PDF, DOCX, XLSX, PPTX, email, Markdown, text, CSV, SVG, Slack, Teams, Discord, Telegram, Notion, Confluence/Jira, WhatsApp, Google Chat)

  ### Fixes

  - Fix DTS export paths — bump @vitus-labs/tools-rolldown to 1.15.4 (emitDtsOnly fix)
  - All packages now produce correct type declarations

## 0.6.0

### Minor Changes

- [`5610cdf`](https://github.com/pyreon/fundamentals/commit/5610cdffb69022aacd44419d7c71b97bdcf8403f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - ### New packages

  - `@pyreon/flow` — reactive flow diagrams with signal-native nodes, edges, pan/zoom, auto-layout via elkjs
  - `@pyreon/code` — reactive code editor with CodeMirror 6, minimap, diff editor, lazy-loaded languages

  ### Improvements

  - Upgrade to pyreon 0.6.0
  - Use `provide()` for context providers (query, form, i18n, permissions)
  - Fix error message prefixes across packages

## 0.13.0

### Minor Changes

- Add @pyreon/permissions (reactive type-safe permissions) and @pyreon/machine (reactive state machines). Update AI building rules.
