# @pyreon/table

## 0.53.0

### Minor Changes

- [#3847](https://github.com/pyreon/pyreon/pull/3847) [`a110468`](https://github.com/pyreon/pyreon/commit/a1104680b3cf44b9d062ee4906b76a3ff09b2634) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Native lowering for machine, i18n, toast, a11y, table, dnd and sync moves out of the compiler into package-owned plugins. A bare transform with no plugins no longer lowers these libraries; `<Toaster/>` must be imported from `@pyreon/toast`.

### Patch Changes

- Updated dependencies [[`c933f92`](https://github.com/pyreon/pyreon/commit/c933f92e20104aba2807e229f03b9f0530135cb3), [`4d3fae3`](https://github.com/pyreon/pyreon/commit/4d3fae39e62d0fe71392990b878f2d94686a1c5f), [`068310d`](https://github.com/pyreon/pyreon/commit/068310dd9bd78663945348f579a7f5fd082c6944), [`c253ae2`](https://github.com/pyreon/pyreon/commit/c253ae23978b06904768d171f3eb7e2b7114e273), [`4d3fae3`](https://github.com/pyreon/pyreon/commit/4d3fae39e62d0fe71392990b878f2d94686a1c5f), [`87879d0`](https://github.com/pyreon/pyreon/commit/87879d0a04b5e221482693596cff0f7352c1e3ed), [`4b207a7`](https://github.com/pyreon/pyreon/commit/4b207a7c56938fc326b79dae1d381b7af53c8681), [`792e27e`](https://github.com/pyreon/pyreon/commit/792e27ef09c9b3dcc88c85a7ab6d969f60388848), [`0c95de5`](https://github.com/pyreon/pyreon/commit/0c95de5911873d56543a28acc0bb23e0ad5b299c), [`6df4450`](https://github.com/pyreon/pyreon/commit/6df4450bb57c834997796f8f37c59bae3e743d74), [`9fed8dc`](https://github.com/pyreon/pyreon/commit/9fed8dc5982d850bf09a0d0afa95b6d0fc7e8bae), [`1ce711d`](https://github.com/pyreon/pyreon/commit/1ce711d63e715110f614fcc423530eb13ceee43a), [`f7b64d9`](https://github.com/pyreon/pyreon/commit/f7b64d9164eb34d202e3d84b0c729a8d6918a359), [`3ec86b7`](https://github.com/pyreon/pyreon/commit/3ec86b7d4fce4c2c2c19ae233e5387d112b97a9a), [`4d3fae3`](https://github.com/pyreon/pyreon/commit/4d3fae39e62d0fe71392990b878f2d94686a1c5f), [`09839d5`](https://github.com/pyreon/pyreon/commit/09839d56f631df1743319211cd2c821c2f259990), [`a110468`](https://github.com/pyreon/pyreon/commit/a1104680b3cf44b9d062ee4906b76a3ff09b2634), [`b0d6ac0`](https://github.com/pyreon/pyreon/commit/b0d6ac0c32c0b678d97144f43e750683bf1225ae), [`cf21221`](https://github.com/pyreon/pyreon/commit/cf21221e4249823a8fd04be8601168817045f6eb), [`0c95de5`](https://github.com/pyreon/pyreon/commit/0c95de5911873d56543a28acc0bb23e0ad5b299c), [`09839d5`](https://github.com/pyreon/pyreon/commit/09839d56f631df1743319211cd2c821c2f259990), [`ed1e29d`](https://github.com/pyreon/pyreon/commit/ed1e29d20c98d7c6ae2c062c10aa73174afa35c3), [`9b84418`](https://github.com/pyreon/pyreon/commit/9b844189403ed062150edff9999d2cae7838f430), [`3de1c68`](https://github.com/pyreon/pyreon/commit/3de1c68b460f1f83deb9988192dfa4000ffb25b0)]:
  - @pyreon/native-compiler@0.53.0
  - @pyreon/core@0.53.0
  - @pyreon/reactivity@0.53.0

## 0.52.0

### Minor Changes

- [#3651](https://github.com/pyreon/pyreon/pull/3651) [`9d6ca3d`](https://github.com/pyreon/pyreon/commit/9d6ca3d705b555a2bb52d6dfd0c5fe231ff69f5c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Hardening pass across six fundamentals packages.

  **@pyreon/rx** — `groupBy` / `keyBy` / `countBy` / `mapValues` now build prototype-free records (`Object.create(null)`). A key named `constructor` made `groupBy` throw and `countBy` produce `'function Object() …1'`; a `__proto__` key was written as the result's prototype and vanished. Behaviour change: the results no longer inherit from `Object.prototype` (call `Object.hasOwn(result, k)`, not `result.hasOwnProperty(k)`). `search()` gains signal/plain overloads (a plain call is typed `T[]`, a signal call a computed) instead of `any`.

  **@pyreon/machine** — event and state names are looked up as OWN keys, so `send('toString')` is an unhandled event instead of moving the machine into an undefined state; an initial/target named after an `Object.prototype` member is rejected at creation. A throwing `onExit` / `onEnter` / `onTransition` / `onDone` listener is reported (`console.error`, `[Pyreon]` prefix) and no longer aborts the transition midway. Behaviour change: `send()` called from inside a listener is QUEUED and runs after the current macrostep completes (run-to-completion), instead of running nested in the middle of it; such a call returns the state as it is at that moment.

  **@pyreon/permissions** — behaviour change: `usePermissions([])` is a self-contained deny-all instance; it no longer falls back to the provider's instance (the mode is chosen by the presence of the argument, not its length). The native lowering makes the same choice. The resolve memo is re-enabled once `patch()` replaces the last predicate with a boolean. `can.all` / `can.any` accept an array plus a context (`can.all(['a', 'b'], post)`) so multi-checks reach context-dependent predicates; the rest-args form is unchanged.

  **@pyreon/i18n** — `<Trans>` no longer lets an interpolated value create markup: angle brackets in values are neutralised before tags are parsed, so `x</bold><link>…` renders as text instead of invoking the `link` component. Loader-returned namespaces get the same normalization as `messages` (flat dotted keys expanded, unsafe keys dropped, a store-owned deep copy). Behaviour change: locales resolve along the BCP 47 step-down chain (`en-US` → `en` → `fallbackLocale`, itself stepped down). Key paths, inline format names and custom plural rules are OWN-property lookups (`t('a.constructor.name')` no longer returns `'Object'`). `$t()` nesting no longer re-interpolates a nested result, so a value that looks like `{{x}}` is not substituted twice. The `Intl.PluralRules` cache and the per-instance resolution cache are LRU-bounded (the resolution cache used to stop caching entirely after 2000 keys).

  **@pyreon/url-state** — signals now follow navigations made through the registered router (`router.push('?page=2')`, `<RouterLink>`), including a router registered after the signal was created (`UrlRouter` gains an optional `currentRoute`, which `@pyreon/router` already provides). Behaviour changes: array params keep their element type, inferred from the default's first element (`[0]` → `number[]`), and a `,` inside an element round-trips; a lone custom `serialize` or `deserialize` is honoured (the other half is inferred), and with `arrayFormat: 'repeat'` a custom codec applies per element; `onChange` fires only when the value actually changed; an empty number param (`?page=`) and an unrecognised boolean fall back to the default, and booleans accept `1`/`0`. The native lowering decodes empty numbers and booleans the same way.

  **@pyreon/table** — `flexRenderCell` tracks the cell renderer itself (the lookup stays untracked), so a renderer reading table state such as `info.row.getIsSelected()` updates on that change; data edits still re-run only the edited row. `columnSignature` covers group columns' children and the `cell` / `header` / `footer` renderers (by source text, so an inline column literal stays stable), so a renderer swap re-renders the cells. Cleanup is registered on the owning `EffectScope` instead of `onUnmount`, so `useTable` in a store no longer warns.

  **@pyreon/atlas** — the permission-set recorder wraps the new array form of `can.all` / `can.any` too, so keys passed that way are seeded with the role's policy and recorded as consulted.

- [#3755](https://github.com/pyreon/pyreon/pull/3755) [`489cba8`](https://github.com/pyreon/pyreon/commit/489cba8f7bb308ca26d27607a0c14c6dfa42da50) Thanks [@vitbokisch](https://github.com/vitbokisch)! - PMTC lowers a TS integer `number` to Kotlin `Long` (64-bit) instead of `Int` (32-bit), matching Swift's `Int`. One shared source now holds the same values on both targets: `{ createdAt: 1726000000000 }` decoded on iOS and threw `Failed to parse int` on Android, and integer arithmetic past 2147483647 overflowed on Android only. Integer literals emit with the `L` suffix, and the emitter converts at every Kotlin/Compose API that takes `Int` (subscripts, `take`/`drop`/`substring`/`padStart`, `List(n)`, Compose dimensions, shift counts) and widens at every one that returns `Int` (`.size`, `.length`, `indexOf`). `parseInt` lowers to `toLongOrNull`, and a `useUrlState` integer accepts the JS safe-integer range on both targets (it was pinned to 32 bits on iOS too).

  Breaking for hand-written Kotlin against these runtime surfaces: `PyreonFieldArray` (`length`, `key`, and every index parameter) and `PyreonTableState` (`page`, `pageCount()`, `filteredCount()`, `setPage`, the `pageSize` and `rowId` index parameters) now use `Long`; the generated chart engine and `PyreonChartHandle` state (`hover`, `selected`, `hidden`, `step`, `seriesCount`) use `Long` indices and counts.

- [#2833](https://github.com/pyreon/pyreon/pull/2833) [`2e12add`](https://github.com/pyreon/pyreon/commit/2e12addb54586212dce479699d7ea70f084d1a7e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Ship co-located native ports, and gate that they always do.

  - **`@pyreon/table`**: its `PyreonTableState` Swift/Kotlin ports (added in [#2828](https://github.com/pyreon/pyreon/issues/2828))
    were declared via `pyreon.native` and compiled by the co-source gate, but the
    package's `files` array did not include `native/swift` / `native/kotlin` — so
    the ports never reached the published tarball. A native app installing
    `@pyreon/table` could not resolve them. Added the two `files` entries.

  - **`@pyreon/cli`** (`runDistributionGate`, i.e. `pyreon doctor` + the
    `check-distribution` CI gate): a new rule, `distribution/native-source-not-
shipped`, fails any package that declares `pyreon.native` but omits the
    declared native source dirs from `files`. This is the class of bug above —
    a co-located port that builds in-repo but is absent from npm. It surfaced two
    real instances (`@pyreon/sync`, `@pyreon/table`), both fixed here.

- [#2838](https://github.com/pyreon/pyreon/pull/2838) [`2eb6540`](https://github.com/pyreon/pyreon/commit/2eb6540c024529b2b26bd1bd9d97aeda64a48323) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lower `@pyreon/table`'s `createTableState` to native (iOS + Android).

  `const t = createTableState({ data: () => rows(), columns: [{ id }], pageSize })`
  in shared `.tsx` now compiles to the `@Observable` PyreonTableState engine —
  sort / filter / paginate / select, rendered with `<For each={t.rows()}>` +
  `@pyreon/primitives`.

  - **Column cell accessors are codegen'd** from the row struct's inferred field
    types: a `String` field → `.string($0.name)`, a number → `.number(Double($0.age))`.
  - **Swift** wires the reactive data source in `.onAppear` (`t.setData { rows }`),
    because a `@State` initializer can't capture the source signal; the table
    itself is a self-seeding `@State`. **Kotlin** passes it in the constructor
    (sequential `remember`).
  - Use-sites: `t.rows()`/`t.toggleSort(id)`/`t.setFilter(q)`/… flow through as
    methods; `t.page()`/`t.sortColumn()`/… drop parens (property reads).
  - The `PyreonTableState` port is now `@Observable` (Swift) / `mutableStateOf`-
    backed (Kotlin) so sort/filter/page mutations recompose.
  - `@pyreon/table` declares a `nativeFrontend` and leaves WEB_ONLY_PACKAGES; the
    TanStack-backed `useTable` (row model / faceting / virtual sizing) stays web.

  Verified: the actual emit type-checks against the real SwiftUI SDK + the real
  port on macOS, and both targets validate against the compiler stubs. v1: scalar
  columns with the default `row[id]` accessor; explicit accessors / rowId /
  filterFn are follow-ups.

- [#2828](https://github.com/pyreon/pyreon/pull/2828) [`58c0fc4`](https://github.com/pyreon/pyreon/commit/58c0fc46789226dd23e1556908ccb8af52bae41e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `createTableState` — a dependency-free, reactive table-state core, plus co-located native Swift/Kotlin ports (`PyreonTableState`): the multiplatform-portable alternative to `useTable` (which binds `@tanstack/table-core` and is web-only-rich).

  Pure signal logic for sort / filter / paginate / row-selection, so the same behaviour runs on web AND — via the native ports — on iOS/Android, where you render `rows()` with native `<For>` (tables ARE native: SwiftUI `List` / Compose `LazyColumn`), no WebView. `data` is an accessor so a signal source stays reactive; `rows()` re-derives filtered → sorted → paginated; `toggleSort` cycles none → asc → desc → none; the filter is case-insensitive across every column (override with `filterFn`); selection is keyed by `rowId`. A `createTableState`-only import tree-shakes TanStack out entirely (`sideEffects: false`).

  The native ports are behaviour-identical to the TS engine (same sort/filter/paginate/select results) and are compile-and-run verified by the co-source gate (`swiftc` + `kotlinc` compile the runtime and run the assertion tests).

- [#2881](https://github.com/pyreon/pyreon/pull/2881) [`2b11ae1`](https://github.com/pyreon/pyreon/commit/2b11ae1977597aa08aa8f8f7668a642c50eed301) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fine-grained cells-list accessor `visibleCells(table, rowId)` + value-gated atom propagation (TanStack Store reference parity).

  Two changes that together make a single-cell edit genuinely fine-grained end-to-end:

  - **`visibleCells(table, rowId)`** (new export) — the cells-LIST companion to `flexRenderCell`, for the inner `<For>` of a keyed table body. The previously documented `each={() => row.getVisibleCells()}` leaves a TRACKED table-core read in every row's scope (its memo deps read `table.options`, which changes on every options sync — data edits included), so a single-cell edit re-ran every row's cells-list accessor: measured 1000 re-runs at N=1000 where 1 is correct, making the edit ~3× slower than a memoized react-table. `visibleCells` subscribes to the row's own signal plus the column-geometry state slices (visibility, order, pinning, grouping) and looks the cells up untracked from the CURRENT row model. Re-measured: update-1cell is now ~1.3× FASTER than a hand-memoized react-table at N=100 and N=1000 (10-25× vs naive).
  - **Atom bindings default `compare` to `Object.is`** — TanStack Store's reference `createAtom` does not propagate an equal update; Pyreon's bare `computed` notifies unconditionally on dependency change. Core creates its per-slice `table.atoms[key]` with no compare while their fn reads `table.options`, so every data edit re-notified every state-slice subscriber with an unchanged value. Value-gating restores reference-binding parity.
  - The structural column signature now includes `groupedColumnMode` (it changes the leaf-column list without touching `columns` or row ids), so that change correctly bumps the per-row signals.

  The sort-toggle contract is unchanged and deliberate: a structure/order change still re-runs all cells (coarse-but-correct for state-reading cells — the case `React.memo` on `original` identity silently freezes).

### Patch Changes

- [#3753](https://github.com/pyreon/pyreon/pull/3753) [`6bf2770`](https://github.com/pyreon/pyreon/commit/6bf2770d8d25e02aa853ac249b6c07923dac001d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Dependency refresh to latest. `@pyreon/dnd` moves to `@atlaskit/pragmatic-drag-and-drop` 4 and `-hitbox` 3 (the auto-scroll adapter already required core 4, so v3 core would have been installed twice). Runtime deps of the other packages move to their latest in-major releases (`oxc-parser` 0.152, `magic-string`, `@tanstack/query-*` 5.104, CodeMirror, tiptap, `yjs`, `sharp`, `vite`, …).

- [#3174](https://github.com/pyreon/pyreon/pull/3174) [`ea669a1`](https://github.com/pyreon/pyreon/commit/ea669a11028d7067e80b8c59bb2f5d35d5cbda1b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Update third-party dependencies to their latest compatible releases,
  extending [#3174](https://github.com/pyreon/pyreon/issues/3174)'s sweep to every package.json the first pass hadn't reached
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
  `.agents/guides/benchmarks/README.md` was measured against 0.1.46 and
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

- [#2704](https://github.com/pyreon/pyreon/pull/2704) [`1d74edc`](https://github.com/pyreon/pyreon/commit/1d74edc1b85c22714b9ee4b86e8fa9228be2ca93) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Update external dependencies to latest across the workspace: tanstack query/virtual patches, tiptap 3.29.2, codemirror view 6.43.8, shiki 4.4.2, elkjs 0.12, yjs 13.6.32, MCP SDK 1.30, oxc 0.143, magic-string 1.1.0, pragmatic-drag-and-drop 2.0.2, and tooling (vite 8.2.0, playwright 1.62.1 — both previously held back by upstream bugs now fixed). `@pyreon/testing` widens its `@testing-library/jest-dom` peer to `^6.0.0 || ^7.0.0` (v7 verified). TypeScript stays capped `<7.0.0` (TS7 removed the classic Compiler API); `@tanstack/table-core` stays on v8 (v9 is a structural API rewrite that would break `@pyreon/table`'s public options surface — tracked as its own migration).

- [#3515](https://github.com/pyreon/pyreon/pull/3515) [`87b581a`](https://github.com/pyreon/pyreon/commit/87b581a6a28433116c9a6c8364fbb8e3cab15760) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Documentation-only: closes five README/manifest gaps against shipped 0.52-cycle APIs, found by auditing every package README against its real exports.

  - **`@pyreon/core`** — `<Async>`, `use()` (already in the manifest but undocumented in the README) and `elementRef()` (missing from BOTH the README and the manifest) are now documented. `elementRef` gets a new manifest `api[]` entry with a real `mistakes` catalog, and the package `longExample` now demonstrates all three primitives so they surface in `llms-full.txt` / the MCP `api-reference` (the manifest's `longExample`, not `api[].example`, is what drives that section).
  - **`@pyreon/sync`** — the multiplatform pure-TS CRDT engine (`pyreonAdapter`, `PyreonCrdtAdapter`, `PyreonCrdtDoc`, `createActorId`, `connectPyreonSync`, `webSocketChannel`, `createNativeSyncHost`) shipped via [#2824](https://github.com/pyreon/pyreon/issues/2824)/[#3207](https://github.com/pyreon/pyreon/issues/3207) and was undocumented everywhere — the README's own roadmap table still implied only the Yjs engine had landed. Adds a "Multiplatform engine" README section, 7 new manifest `api[]` entries, and a roadmap row.
  - **`@pyreon/table`** — `createTableState` (the dependency-free, PMTC-lowerable table-state core) was documented in the manifest but absent from the README, which reads as TanStack-only. Adds a full section + a comparison table + a gotcha distinguishing it from `useTable`.
  - **`@pyreon/router`** — `safeRedirectLocation` / `classifyRedirectTarget` (public open-redirect-guard exports) get a short "Redirect-target security" subsection under `notFound() / redirect()`.
  - **`@pyreon/hooks`** — the README's "full surface" table-count line said "55 hooks across 7 categories" against a real 65 (the prose line three lines above it was correct and already guarded by `check-doc-claims`; this second, unguarded restatement of the same number silently drifted on its own). The table itself listed three hooks that do not exist (`useRootSize`, `useSpacing`, `useThemeValue`) and was missing 19 real ones across Interaction/Data (`useBluetooth`, `useSafeArea`, `useScreenOrientation`, `useDeviceMotion`, `useSpeech`, `useDeviceInfo`, `useCamera`, `useAudioRecorder`, `useWakeLock`, `useAppState`, `useCrashReporter`, `useAuth`, `useDatabase`, `useGeolocation`, `useMap`, `useWebSocket`, `useSecureStorage`, `usePush`, `usePayments`). The table is now a verified 1:1 match against `src/index.ts`'s real exports (programmatically diffed).
  - **`@pyreon/cli`** — `check-doc-claims` gains a guarded claim site for the hooks README's table-count line, closing the exact gap that let it drift silently: `packages/tools/cli/src/doctor/gates/doc-claims.ts`'s `hook export count` check previously only watched the prose line in that file, not this second restatement a few lines below it. Bisect-verified: reverting the new claim spec makes the new regression test fail with `expected +0 to be 1` (drift undetected); restored, it passes.
  - **`@pyreon/mcp`** — `api-reference.ts` regenerated (`bun run gen-docs`) from the `@pyreon/core` / `@pyreon/sync` manifest edits above; no hand edits.

  No runtime behavior changes in any package.

- [#3557](https://github.com/pyreon/pyreon/pull/3557) [`5c60743`](https://github.com/pyreon/pyreon/commit/5c60743c32bac8c46279fccacc5a51126b183832) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Stop publishing the build's bundle-analysis report.

  `vl_rolldown_build` writes an HTML treemap per entry into `lib/analysis/`, and
  54 packages published it: every install downloaded a build report (258 KB for
  `@pyreon/charts`) that is not part of the package. Their `files` now exclude
  `lib/analysis`, as ten packages already did. `pyreon doctor`'s distribution
  gate enforces it twice: a `vl_rolldown_build` package that publishes `lib`
  must exclude the report, and the live `npm pack --dry-run` probe fails if the
  tarball carries one.

- [#3081](https://github.com/pyreon/pyreon/pull/3081) [`b3af6f5`](https://github.com/pyreon/pyreon/commit/b3af6f5ade4cbc9ce756c173d349acb640f09264) Thanks [@vitbokisch](https://github.com/vitbokisch)! - perf(table): O(1) cell lookup in `renderCell` instead of an O(C²)-per-row scan

  `flexRenderCell` → `renderCell` resolved a cell by doing `getVisibleCells().find(c => c.column.id === columnId)` — an O(C) linear scan by column id. It runs once per cell per render (the documented `{() => flexRenderCell(table, row.id, cell.column.id)}` shape), so a row with C columns did C scans of C cells → **O(C²) per row**, **O(N·C²)** on any full re-render (mount / sort / filter / pagination).

  It now uses table-core v9's own memoized `row.getVisibleCellsByColumnId()` — a by-column-id map with the SAME visible-column filter and the SAME memo deps (`[row.getAllCells(), columnVisibility]`) as `getVisibleCells`, so it returns the identical cell in O(1). Falls back to the O(C) scan only when a table is built from a minimal feature set without column visibility. Per row: **O(C²) → O(C)**.

  This does not change the adapter's compare/laziness semantics — `renderCell` already runs `untrack`ed and already read the same visibility atoms.

  Bisect-verified: a stub row whose `getVisibleCells`/`getAllCells` throw but whose `getVisibleCellsByColumnId` returns the cell renders correctly through the O(1) path; reverting to the `.find` scan throws (`should not scan getVisibleCells`).

- [#3078](https://github.com/pyreon/pyreon/pull/3078) [`76c0feb`](https://github.com/pyreon/pyreon/commit/76c0febfda0b05a73e0be307c344819435a8479d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - perf(table): make `isSelected` O(1) instead of an O(k) per-row scan

  `createTableState`'s `isSelected(id)` was `selected().includes(id)` — an O(k)
  linear scan of the selected-ids array. It's the per-row selection-checkbox
  predicate (called once per rendered row inside a reactive scope), so with k rows
  selected it cost O(N·k) per selection change, and O(N²) under a select-all over
  N rendered rows.

  It now reads a lazily-derived `Set` (`computed(() => new Set(selected()))`): the
  Set rebuilds O(k) once per selection change (a rare gesture) and each read is
  O(1) via `Set.has`. Same booleans, same reactivity (the Set is a computed
  derived from `selected()`). This is the pure-signal, native-portable
  `createTableState` — it does NOT touch the `@tanstack/table-core` seam.

  Bisect-verified with an operation-count lock: reading the predicate once for each
  of 200 selected rows makes ZERO `Array.includes` calls (Set-backed); the old
  `.includes` form makes one per read (200).

- [#3423](https://github.com/pyreon/pyreon/pull/3423) [`920f97b`](https://github.com/pyreon/pyreon/commit/920f97b0b746bafabbc263a8d89e6283e2df75ef) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `createTableState` no longer renders a blank page when the data shrinks, and empty cells sort as one rank

  Two fixes to the dependency-free table-state core, both mirrored into the
  co-located Swift and Kotlin ports so web, iOS and Android stay 1:1.

  **The page could fall off the end of the data.** `setFilter` resets to page 0,
  but nothing else did — and a filter is not the only way the row set gets
  smaller. Deleting rows, or a refetch returning fewer, left the page pointing
  past the end: `rows()` sliced an empty window and the table rendered NOTHING,
  while `pageCount()` cheerfully reported a smaller number than `page()`.
  `page()` is now derived and clamped against the live row count, so the three
  can never disagree. Deriving rather than writing the signal back has a
  deliberate consequence: a transient shrink — a filter typed and cleared, a
  refetch — returns the reader to where they were instead of stranding them on
  the last page.

  **`null` and `undefined` were ranked against each other.** Both hit the same
  `a == null` arm, so the comparator answered "a before b" to `(null, undefined)`
  AND to `(undefined, null)`. A sort given a comparator that claims two rows each
  precede the other is free to reorder them, so rows with empty cells shuffled
  for no reason and the result depended on where they sat in the input. They are
  now one rank — which is also what the native ports already did, since their
  `PyreonCell` has a single `.none` case.

- [#2748](https://github.com/pyreon/pyreon/pull/2748) [`111ac7e`](https://github.com/pyreon/pyreon/commit/111ac7e262c6deda789f4060db9d6ebf35e00fbb) Thanks [@vitbokisch](https://github.com/vitbokisch)! - TanStack Table 9.0.0 → 9.1.2 (+ @tanstack/store 0.11.1). The Pyreon
  reactivity bindings pass unchanged — 9.1's one seam addition, the optional
  `commit` hook, is a render-phase-adapter API (`publishExternalState`'s
  staged-options path) that a fine-grained adapter deliberately does not
  implement: options are a real atom here (`createOptionsStore: true`), so
  derived atoms subscribe reactively and there is no out-of-band invalidation
  to signal. Rationale documented at the seam.
- Updated dependencies [[`2ac084f`](https://github.com/pyreon/pyreon/commit/2ac084f5c3c762902e38004b3787f806d155d338), [`d5f19b9`](https://github.com/pyreon/pyreon/commit/d5f19b9700962305b1cc4fd0e5da603ec884e759), [`8563e97`](https://github.com/pyreon/pyreon/commit/8563e97ee5fd91daa6d74547c712ae6b71cffb47), [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d), [`9045709`](https://github.com/pyreon/pyreon/commit/9045709020995c37692eb2a9a6ecd65f6b8c6e30), [`57b94ed`](https://github.com/pyreon/pyreon/commit/57b94ed8cd4b2aa9d5bd16e52d39edcdb7056c62), [`1c70f68`](https://github.com/pyreon/pyreon/commit/1c70f68b69a7e9f60eb7d565bf8797a155353743), [`99a1888`](https://github.com/pyreon/pyreon/commit/99a188821c005c4750c3daf98fd2d0863a0e3b58), [`e56abb6`](https://github.com/pyreon/pyreon/commit/e56abb6b44873164473b085e0e64838e7d9e7012), [`9f02726`](https://github.com/pyreon/pyreon/commit/9f0272677bd083fb50998335257e31e44766e85d), [`cc455e8`](https://github.com/pyreon/pyreon/commit/cc455e84d9ed7d682d963d44b25cd3c4bb89c7c8), [`6a7c0f1`](https://github.com/pyreon/pyreon/commit/6a7c0f1bb21f285fce47fe67492ce9a14c20fd6a), [`cf50c79`](https://github.com/pyreon/pyreon/commit/cf50c79668fa46510df17f76906520c53d6e0e4a), [`f2194d5`](https://github.com/pyreon/pyreon/commit/f2194d544ca7fc10dcc64b2aeb1c97dc923eabfe), [`e6b70a5`](https://github.com/pyreon/pyreon/commit/e6b70a5c80ed7c9f338a6a750296ebe89e9dd9c2), [`cbd6459`](https://github.com/pyreon/pyreon/commit/cbd6459970423b7f7d94883685ae7c753895f1d9), [`ea4e50a`](https://github.com/pyreon/pyreon/commit/ea4e50ab7d97d84f2bd5518ea747280c34805611), [`c8c47f7`](https://github.com/pyreon/pyreon/commit/c8c47f7c1b1853c4fde3247d5d7618cab03b6c4f), [`d114ff8`](https://github.com/pyreon/pyreon/commit/d114ff8c83ac98acb0c421d0ee3217e43d4d713b), [`50d9324`](https://github.com/pyreon/pyreon/commit/50d93245d8e28ba0a3c8217bd83a50d3dd6719d3), [`317367a`](https://github.com/pyreon/pyreon/commit/317367a9ade57b9aefd036441ebb397c8e3d1dc2), [`5c5e246`](https://github.com/pyreon/pyreon/commit/5c5e246832453a94e5ce112d11c9109d800d2889), [`384cb23`](https://github.com/pyreon/pyreon/commit/384cb23669ef897b74206c9441b8982a71729367), [`4f75a72`](https://github.com/pyreon/pyreon/commit/4f75a72ebbc4223a88d9ffc2ce950d962aa973a4), [`773f9df`](https://github.com/pyreon/pyreon/commit/773f9dfaafaed05a06b252b1f83a0f7d970dbb8d), [`3dba9dc`](https://github.com/pyreon/pyreon/commit/3dba9dceec5dc96c34686b70604b6d79939655a2), [`d98b60d`](https://github.com/pyreon/pyreon/commit/d98b60d48ec42e1cf4cc6f22e20262000384676a), [`e44dcc7`](https://github.com/pyreon/pyreon/commit/e44dcc7124a5617f95ddb69786be262a35280d5f), [`768f104`](https://github.com/pyreon/pyreon/commit/768f104018ced7568dde1c99990a21c273e924ec), [`87b581a`](https://github.com/pyreon/pyreon/commit/87b581a6a28433116c9a6c8364fbb8e3cab15760), [`9593fbc`](https://github.com/pyreon/pyreon/commit/9593fbc44375cc00f57865790a798bd53e479551), [`24c4019`](https://github.com/pyreon/pyreon/commit/24c4019d3e2527bf063d65d62bf574b00965d1e4), [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d), [`d0e57b2`](https://github.com/pyreon/pyreon/commit/d0e57b27ccbf9b4b90521235186a003f3d6bc3ca), [`fabd888`](https://github.com/pyreon/pyreon/commit/fabd888ac865155a5af687f1706bf918c6419f19), [`5c60743`](https://github.com/pyreon/pyreon/commit/5c60743c32bac8c46279fccacc5a51126b183832), [`5438e9a`](https://github.com/pyreon/pyreon/commit/5438e9a7496e4c6e5dac43bc03ab90459d147a59), [`5af143d`](https://github.com/pyreon/pyreon/commit/5af143d746be81a4a0d688243f123d532c455553), [`2bef24d`](https://github.com/pyreon/pyreon/commit/2bef24df3d5c86d709509906d4d1e831357b41c6), [`f4e9268`](https://github.com/pyreon/pyreon/commit/f4e9268a750318ceb5f7d2dc40c185a53e6b5299), [`c26fcef`](https://github.com/pyreon/pyreon/commit/c26fcef861ec794ca7f0e0b2163d84f7b58c0866), [`127e5d6`](https://github.com/pyreon/pyreon/commit/127e5d65cd2a3cea8457a1bd6f397b75c0ad4597), [`50caf2d`](https://github.com/pyreon/pyreon/commit/50caf2d3f97fefa7afa6105e38c7f5940c427b5d), [`c7feb0b`](https://github.com/pyreon/pyreon/commit/c7feb0b726ea78ef7b6a4d3a17e8ae85df471a67)]:
  - @pyreon/core@0.52.0
  - @pyreon/reactivity@0.52.0

## 0.51.0

### Minor Changes

- Migrate to TanStack Table v9. (175a232)

  **`useTable` now returns the `Table` instance directly** instead of `Computed<Table>` — there is no `table()` call. v9 exposes a pluggable reactivity seam (`coreReactivityFeature`) and the adapter backs its atoms with Pyreon signals, so reading the table inside any reactive scope subscribes natively. The v8 version counter, the whole-`TableState` structural diff, and the `onStateChange` interception all existed only because v8 had no such seam; they are gone.

  **Features must now be registered explicitly.** v9 exposes an API only when its feature is present, and row models are feature slots rather than options: `getCoreRowModel()` is automatic (delete it), and the rest become `tableFeatures({ rowSortingFeature, sortedRowModel: createSortedRowModel(), … })`. Define the set once at module scope — it is a compile-time type parameter. Note `row.getVisibleCells()` requires `columnVisibilityFeature`.

  **Core types take a leading `TFeatures` generic** (`ColumnDef<typeof features, User>`), `table.getState()` → `table.store.state`, top-level `onStateChange` → per-slice `on<Slice>Change` (supplying one puts that slice in controlled mode), column pinning is logical (`start`/`end`, not `left`/`right`), `sortingFn` → `sortFn`, and `getIsSomeRowsSelected()` now means "at least one" including all-selected.

  **The runtime re-export surface is now an explicit curated list rather than `export *`.** Under the wildcard, table-core's public surface was literally ours — an upstream major retired 40 of 51 runtime exports and leaked internals (`noop`, `getMemoOptions`, `_getVisibleLeafColumns`). The curated list covers the full author surface (all 16 features, every row model and built-in fn) while keeping adapter-construction plumbing out; types are still re-exported wholesale. A future upstream major is now our migration rather than yours.

  `@pyreon/feature`'s `useTable` gains a fix along the way: `pageSize` was typed-but-unimplemented under v8 — it was read only as a boolean and its value discarded, so `pageSize: 25` silently paged by 10. It now sets the initial page size, and an unpaginated table is unpaginated (rather than truncated to v9's default of 10).

  Fine-grained per-cell updates are preserved and verified: a single-cell edit still re-runs only the changed row's cells (6 cell units, 1 DOM write at both N=100 and N=1000 — matching hand-memoized react-table with no memo boilerplate). See the migration section in the table docs for a before/after.

  `flexRender` and `flexRenderCell` now return a resolved-child type instead of `unknown`/`VNodeChild`. `VNodeChild` includes the accessor arm, so returning it made Pyreon's own documented `<td>{() => flexRenderCell(…)}</td>` pattern a nested accessor that the type system rejected; both functions always return already-resolved content, and the narrower type says so. `{flexRender(…)}` now typechecks directly in JSX.

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

- Fix a readonly atom never notifying when subscribed before its first read. (277fe9e)

  The v9 reactivity bindings back `ReadonlyAtom` with a Pyreon `computed`, which
  is LAZY — it subscribes to its dependencies only once evaluated. Attaching a
  direct subscriber to a computed nobody had read yet therefore attached to a node
  with no upstream edges, and the subscriber never fired. `subscribe` now primes
  the computed with one `untrack`ed read before attaching, so the dependency graph
  exists first.

  The mounted table hid this because rendering reads the row models before
  anything subscribes; it surfaces when core or a consumer subscribes to a derived
  atom it has not read. The failure was silent — no error, just an atom that never
  updates.

- Updated dependencies:
  - @pyreon/reactivity@0.51.0
  - @pyreon/core@0.51.0

## 0.50.0

### Patch Changes

- Updated dependencies [[`f3f5d3b`](https://github.com/pyreon/pyreon/commit/f3f5d3b70d2bd19b23b802ea21ad8ba9d5e416a7)]:
  - @pyreon/core@0.50.0
  - @pyreon/reactivity@0.50.0

## 0.49.0

### Patch Changes

- Updated dependencies [[`41049d8`](https://github.com/pyreon/pyreon/commit/41049d897a1804d92ac0f599a48493e9a7a0fa85), [`d935083`](https://github.com/pyreon/pyreon/commit/d935083033edd2c0e74c8fa71e46d9dfcdb661e7)]:
  - @pyreon/core@0.49.0
  - @pyreon/reactivity@0.49.0

## 0.48.0

### Patch Changes

- Updated dependencies [[`a333656`](https://github.com/pyreon/pyreon/commit/a333656ac79c7a43163b0a07f593aa71a59e124d), [`3f1120a`](https://github.com/pyreon/pyreon/commit/3f1120aaa5ee69b85f5de56681a655ba30bf0f67), [`9b5cb93`](https://github.com/pyreon/pyreon/commit/9b5cb9312fc46ddeaede34df600e63ef4ce16023), [`1fa3347`](https://github.com/pyreon/pyreon/commit/1fa33473514e64ebc07e3e75ad818fe1a9f89245)]:
  - @pyreon/reactivity@0.48.0
  - @pyreon/core@0.48.0

## 0.47.0

### Patch Changes

- [#2345](https://github.com/pyreon/pyreon/pull/2345) [`17dbb42`](https://github.com/pyreon/pyreon/commit/17dbb42544f53a553bde5e8fcb57a7a99888cc28) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Bench-only: both wall-clock benches now measure the REAL compiled path (`pyr-tpl` — the fixture compiled through `transformJSX` + esbuild automatic JSX runtime, what vite-plugin apps ship) alongside the hand-`h()` transparency column, with untimed real-DOM correctness gates on every cell. No shipped runtime code changed. Measured outcome: virtual's steady-state scroll is 1.3× faster than react-virtual on the compiled path; table's ~2× mount gap is confirmed as per-cell reactive-binding setup (the compiled fixture closes only ~10% of it), not an h() harness artifact.

- Updated dependencies [[`9799d6b`](https://github.com/pyreon/pyreon/commit/9799d6bfa1c3f99fa38f4375eebd330c2df0a715)]:
  - @pyreon/core@0.47.0
  - @pyreon/reactivity@0.47.0

## 0.46.0

### Patch Changes

- Updated dependencies [[`75a49be`](https://github.com/pyreon/pyreon/commit/75a49befac42202c8237911aa4b111efbbfb1a61), [`cc5250d`](https://github.com/pyreon/pyreon/commit/cc5250d4022638286a0bf89facffb5a585fe2a18), [`19c1ce1`](https://github.com/pyreon/pyreon/commit/19c1ce12a54305ac875d1b19682ecf084addc607), [`f67f3fe`](https://github.com/pyreon/pyreon/commit/f67f3fe451f0aeeb74a024501d30f593ce50b7ff), [`d93e7d3`](https://github.com/pyreon/pyreon/commit/d93e7d3f9a4d679b25a3fc646d99673c2fe276c5), [`3124522`](https://github.com/pyreon/pyreon/commit/31245225c087922575846fa644f93523ff6e1435)]:
  - @pyreon/reactivity@0.46.0
  - @pyreon/core@0.46.0

## 0.45.0

### Minor Changes

- [#2193](https://github.com/pyreon/pyreon/pull/2193) [`7d737ff`](https://github.com/pyreon/pyreon/commit/7d737ff41dd16112cd1c7746a8cc65cecccdaad0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `flexRenderCell` for fine-grained per-cell updates. Inside a keyed `<For>`, the
  captured `cell` freezes on an in-place value change (the reconciler reuses the DOM node
  and never re-runs the cell body); `flexRenderCell(table, row.id, cell.column.id)` inside an
  accessor re-navigates to the live cell each read. Passing the `table` **accessor** (not
  `table()`) makes the cell subscribe to only its own row's version signal, so an in-place
  data edit re-runs just the changed rows' cells — matching a hand-`React.memo`'d
  `@tanstack/react-table` row with zero memoization boilerplate.

  `useTable` now maintains per-row version signals under the hood (additive; the returned
  `Computed<Table>` is unchanged). A no-op TanStack auto-reset `onStateChange` on a data
  change is distinguished from a real state change via a value comparison, so the fine-grained
  path isn't defeated by spurious re-emits.

  Adds a benchmark suite (`bench:table` deterministic re-render/DOM-write counts, and
  `bench:table:wall` wall-clock) vs `@tanstack/react-table` — both wrap the same
  `@tanstack/table-core@8.21.3`. Single-cell edit re-runs 6 cell units (only the changed row)
  = idiomatic memoized react-table, but N-independent and with no memo boilerplate; 7-8×
  faster than naive react-table on a single-cell update.

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.45.0
  - @pyreon/reactivity@0.45.0

## 0.44.0

### Patch Changes

- Updated dependencies [[`d859370`](https://github.com/pyreon/pyreon/commit/d8593704b0941ef0e51a427147ebce2a385ecae3)]:
  - @pyreon/reactivity@0.44.0
  - @pyreon/core@0.44.0

## 0.43.1

## 0.43.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.43.0
  - @pyreon/reactivity@0.43.0

## 0.42.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.42.0
  - @pyreon/reactivity@0.42.0

## 0.41.2

## 0.41.1

## 0.41.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.41.0
  - @pyreon/reactivity@0.41.0

## 0.40.0

### Patch Changes

- Updated dependencies [[`c184330`](https://github.com/pyreon/pyreon/commit/c184330594a7726c4f1f1095cc3a785cfe9ef3f7), [`ed364d2`](https://github.com/pyreon/pyreon/commit/ed364d2a34f4b74df94c02f3c2e630b96a4f2e7f)]:
  - @pyreon/reactivity@0.40.0
  - @pyreon/core@0.40.0

## 0.39.0

### Patch Changes

- Updated dependencies [[`fa95aba`](https://github.com/pyreon/pyreon/commit/fa95aba3aebc24d0178093cd89870b8807beca72), [`794fb27`](https://github.com/pyreon/pyreon/commit/794fb27e6fa67e71608b603cd627cf4eff61a102), [`f7083e5`](https://github.com/pyreon/pyreon/commit/f7083e5a56768fb67e097ec9bc6ee6d1bc6e0d09), [`c82687c`](https://github.com/pyreon/pyreon/commit/c82687c07a2b2ba976787dea74bc891f72a1165a)]:
  - @pyreon/reactivity@0.39.0
  - @pyreon/core@0.39.0

## 0.38.0

### Patch Changes

- Updated dependencies [[`cfa422f`](https://github.com/pyreon/pyreon/commit/cfa422fdb6985e50c74e06cf0f4c1318213d6303), [`0376a3d`](https://github.com/pyreon/pyreon/commit/0376a3ddc75dd1fbee582e7cabe98beb01d60073), [`6ee46e7`](https://github.com/pyreon/pyreon/commit/6ee46e7dca1cb01aacaa7c61ef5dbbcf12b30668)]:
  - @pyreon/reactivity@0.38.0
  - @pyreon/core@0.38.0

## 0.37.1

## 0.37.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.37.0
  - @pyreon/reactivity@0.37.0

## 0.36.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.36.0
  - @pyreon/reactivity@0.36.0

## 0.35.0

### Patch Changes

- Updated dependencies [[`1f29c4b`](https://github.com/pyreon/pyreon/commit/1f29c4b9791e6ad96901ca0e2b90e5335b803895), [`02b77ae`](https://github.com/pyreon/pyreon/commit/02b77aed6b4383554b3458e408b462098fc3e708), [`35d440a`](https://github.com/pyreon/pyreon/commit/35d440a44d92ac913cf19f3f8e21b4603458a165)]:
  - @pyreon/core@0.35.0
  - @pyreon/reactivity@0.35.0

## 0.34.0

### Patch Changes

- [#1611](https://github.com/pyreon/pyreon/pull/1611) [`038a58c`](https://github.com/pyreon/pyreon/commit/038a58c0f39a35ad4338f6d2596c33c47e4e30cc) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Internal coverage hardening — documented `v8 ignore`s for genuinely-unreachable
  defensive guards (deepMerge's non-plain-input safety net, the plain-mode
  `config.state ?? {}` fallback that `model()` rejects upstream, the
  `snapshotValue` meta-guard already gated by `isModelInstance`, the nested-walk
  `applyPatch` non-instance guard) + a test for the `onValidationError`-suppressed
  patch path. No behavior change. Branches → 98.85%, S/F/L → 100%.
- Updated dependencies [[`66d44c5`](https://github.com/pyreon/pyreon/commit/66d44c58920bf81848e9ba858c413a88727a3c65)]:
  - @pyreon/reactivity@0.34.0
  - @pyreon/core@0.34.0

## 0.33.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0

## 0.32.0

### Patch Changes

- Updated dependencies [[`0e38332`](https://github.com/pyreon/pyreon/commit/0e3833212e93ec90994edfccb5f2966f9eb0e926), [`0c1ea1e`](https://github.com/pyreon/pyreon/commit/0c1ea1e89e4228e84367efd5d2cb334808955a25), [`e36bbe5`](https://github.com/pyreon/pyreon/commit/e36bbe52e7f1417a703b4e6ce23281c448d9132f), [`65ccdf2`](https://github.com/pyreon/pyreon/commit/65ccdf2ad95a16b676b58948acea51f957e5cf62), [`7f89196`](https://github.com/pyreon/pyreon/commit/7f89196dd3d99f61b0bba032481b9d389fdd8264)]:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0

## 0.31.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0

## 0.30.0

### Patch Changes

- Updated dependencies [[`6feb9d4`](https://github.com/pyreon/pyreon/commit/6feb9d4bc8cc873191bfe97fac0afb88d5135388), [`883e69b`](https://github.com/pyreon/pyreon/commit/883e69baed47d77eb79f4dd09b87da96a0b52894), [`4efa71b`](https://github.com/pyreon/pyreon/commit/4efa71b83af84b9310681ed213a331842248bb65), [`960bb0f`](https://github.com/pyreon/pyreon/commit/960bb0f139839de49508d836878b98556b1c7d07), [`b720267`](https://github.com/pyreon/pyreon/commit/b720267f0d9fbe260398c56d49834dc1dd2b09fb)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0

## 0.29.0

### Patch Changes

- Updated dependencies [[`c54ce0f`](https://github.com/pyreon/pyreon/commit/c54ce0f284dab0335d9b597488ba75c6dea92b43), [`6d3e085`](https://github.com/pyreon/pyreon/commit/6d3e085183ec42883a842967afe22f806f0ea21d), [`c2874df`](https://github.com/pyreon/pyreon/commit/c2874df8f2b07b19aaa7a64c2f9ff2ab6b11d2f0), [`e1139cc`](https://github.com/pyreon/pyreon/commit/e1139cc20447860a2c0e547e6fc0ed67f359e1fe)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0

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

### Patch Changes

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

## 0.13.0

### Minor Changes

- Add @pyreon/storage (reactive localStorage, sessionStorage, cookies, IndexedDB) and @pyreon/hotkeys (keyboard shortcut management). Add useSubscription to @pyreon/query for WebSocket integration. Upgrade to pyreon core 0.5.4. Convert all tests and source to JSX.

## 0.1.0

### Minor Changes

- [#9](https://github.com/pyreon/fundamentals/pull/9) [`9fe5b51`](https://github.com/pyreon/fundamentals/commit/9fe5b51868c50c3bcab1961f94df27846921b739) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Initial public release of Pyreon fundamentals ecosystem.
  - **@pyreon/store** — Global state management with `StoreApi<T>`
  - **@pyreon/state-tree** — Structured reactive models with snapshots, patches, middleware
  - **@pyreon/form** — Signal-based form management with validation, field arrays, context
  - **@pyreon/validation** — Schema adapters for Zod, Valibot, ArkType
  - **@pyreon/query** — TanStack Query adapter with fine-grained signals
  - **@pyreon/table** — TanStack Table adapter with reactive state
  - **@pyreon/virtual** — TanStack Virtual adapter for efficient list rendering
  - **@pyreon/i18n** — Reactive i18n with async namespace loading, plurals, interpolation
  - **@pyreon/storybook** — Storybook renderer for Pyreon components
  - **@pyreon/feature** — Schema-driven CRUD primitives with `defineFeature()`
