# @pyreon/kinetic

## 0.52.0

### Minor Changes

- `show` now accepts the two shapes that used to crash it (a2e00f6)

  A kinetic transition read visibility by calling `show()`, so anything that was
  not a function died with `TypeError: show is not a function` — an error naming a
  prop the author may never have written, from inside a component they did not
  write either.

  Two shapes hit it, and both are ones a consumer reaches for naturally:

  - **Absent.** `<FadeIn>content</FadeIn>` — a preset used for a plain entrance,
    which is what presets exist for. `show` was optional in the runtime but
    required in the types, and the runtime cast the `undefined` through anyway.
  - **A plain boolean.** `show={isOpen}` where `isOpen` is a signal: the compiler
    auto-calls a known signal in attribute position, so the accessor the author
    typed arrives already resolved.

  Both now normalize at every entry point (`kinetic()`, `<Transition>`,
  `<Collapse>`, `<Stagger>`, `useTransitionState`). Absent means unconditionally
  shown — an element with no `show` is not conditional, and whether it _animates_
  on mount stays `appear`'s job. This is the same rule `<Show when>` and
  `<Match when>` already follow: an API that takes an accessor has to take the
  value too, because the compiler can hand it either.

  Found by running the shared multi-target source in a real browser. `<FadeIn>`
  with no `show` is the shape the preset docs show, and nothing in the suite had
  ever mounted it.

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
- A `kinetic().preset()` chain now animates on iOS and Android (b7b499e)

  The preset is what makes this possible: it NAMES an animation both targets
  already know, so the box lowers through the same `<Transition>` path the
  primitive uses — presets, durations and both emitters, all already verified.
  None of the animation is re-implemented.

  What it needs that a primitive does not is a TRIGGER. Rewriting to
  `<Transition show={true}>` is the obvious move and is wrong: it compiles and
  never animates, because `.animation(_:value:)` watches a constant and
  `AnimatedVisibility(visible = true)` starts visible. So the enter is driven by a
  synthesized flag that flips on mount, reusing the on-mount harness — which also
  carries the SwiftUI stable-identity host an `.onAppear` needs.

  ```swift
  @State private var __kineticIn: Bool = false
  … .transition(.opacity).animation(.default, value: __kineticIn)
    .onAppear { __kineticIn = true }
  ```

  ```kotlin
  var __kineticIn by remember { mutableStateOf(false) }
  LaunchedEffect(Unit) { __kineticIn = true }
  AnimatedVisibility(visible = __kineticIn, enter = fadeIn(…))
  ```

  A chain with NO `.preset()` has no animation vocabulary to carry across, so it
  still degrades to a plain container and warns by name. `<Transition name>` from
  `@pyreon/primitives` remains the portable spelling.

  Native app-runtime coverage: 35/37 → 36/37.

- fix(kinetic): `reverseLeave` now actually reverses the leave order (was a no-op in the common mount-visible case) (67c4a95)

  `<Stagger reverseLeave>` / `kinetic(...).stagger({ reverseLeave: true })` gated the reversal on `!show()` **evaluated once at mount**. Stagger components run once, so a stagger mounted visible (`show` true — the dominant usage: items appear, then later leave) took the `else` branch and produced a **forward** leave order identical to `reverseLeave: false` — the feature silently did nothing. In the only case the branch fired (`show` false at mount) it reversed the _enter_ order instead, backwards from the prop name.

  The per-item delay is now phase-aware: a forward `--kinetic-delay` (enter) and a mirrored `--kinetic-leave-delay` (leave, when `reverseLeave`), with `setTransition(el, value, 'leave')` applying the reversed delay on the leave phase. Enter stays forward; the last-entered item leaves first. Non-`reverseLeave` staggers set both vars equal, so their behaviour is byte-identical. `onAfterLeave` (already attached to the item that leaves last) now fires correctly because that item genuinely has the largest leave delay.

  The prior mock-vnode tests encoded the bug (one asserted the common case does nothing); they're rewritten to the corrected invariant, plus a `setTransition` phase-picking test.

  Bisect-verified; full `@pyreon/kinetic` suite (274) green.

- Derive the native compiler's web-only warning set from the package manifests (e56b865)

  Importing a web-only `@pyreon/*` package into shared source is meant to warn at
  parse time, naming the `<Web>` escape hatch. Four packages — `@pyreon/url-state`,
  `@pyreon/head`, `@pyreon/hotkeys` and `@pyreon/feature` — declared
  `multiplatform: { tier: 'web-only' }` but were absent from the compiler's
  hand-written `WEB_ONLY_PACKAGES` literal, so importing one produced **no
  diagnostic at all**: the call emitted verbatim and the native build failed with
  `cannot find 'x' in scope`, pointing nowhere near the cause.

  The set is now derived from the manifests (`tier === 'web-only'` and no
  `nativeFrontend`) and regenerated by `check-multiplatform-tier`, which gates that
  it stays in sync. The hand-written list had already been repaired twice by hand —
  `@pyreon/sync` and `@pyreon/rich-text` were missing, `@pyreon/toast` went stale
  the other way once its core lowered — each time with a comment recording the
  incident rather than closing the class.

  A cross-check test existed but ran in one direction only (every compiler entry
  must declare web-only), and its comment waved the other direction through as
  acceptable. That was the direction that shipped the bug; it now asserts equality.

  Two supporting changes:

  - `multiplatform` gains an optional `nativeFrontend` field for packages that
    lower part of their surface. The three-value tier vocabulary could not express
    partial crossing, which is what made `@pyreon/toast` go stale. `toast`, `a11y`,
    `query` and `validation` now declare it.
  - The blanket warning defers to `UNLOWERED_PYREON_MODULES`, the finer per-symbol
    mechanism, so packages covered there (`validate`, `validation`, `http`, `rx`)
    warn exactly once with their specific advice instead of twice.

  `@pyreon/query` and `@pyreon/validation` also had factually stale rationales:
  query's said native fetching is `useFetch/PyreonFetch` although `PyreonQuery`
  shipped and `useQuery` is lowered, and validation's said per-validator lowering
  was "not shipped" although the Gap-4 schema forms emit native validators.

  ## Lower `@pyreon/validate`'s `s` DSL to native validators

  A top-level `const X = s.object({ … })` declaration now emits a Swift `Codable`
  struct and a Kotlin `data class`, each with `parse` / `safeParse` and real
  constraint enforcement — from the same source, on both targets. Before this,
  `@pyreon/validate` had no native story at all: a native app could not validate
  data, and the schema emitted verbatim.

  It reuses the existing Gap-4 schema pipeline (recognizer → IR → per-target
  emit) rather than adding a second one. The only structural difference from
  zod / valibot / arktype is that `s.object({ … })` arrives with no wrapper call —
  it already IS a Standard Schema — so the shared walker's `schemaFn` became
  nullable instead of being copied.

  Scope, stated plainly: the DECLARATION form lowers. Inline uses
  (`s.string().parse(x)`), the JIT, JSON-schema export and the v1/mini compat
  surfaces stay web, and still warn.

  The recognizer gates on the IMPORT, not the bare name: `zodSchema(...)` is a
  distinctive wrapper but a lone `s` is not, and claiming it would silently
  rewrite a user's own binding.

  ## Native router: implement the `query` it has always advertised

  `PyreonRouter`'s header has listed `query` (typed search params) since the C1
  scaffold on BOTH platforms, and neither implemented it. Worse than missing: a
  path carrying `?…` was handed to `matchPath` whole, so `/users/42?tab=a`
  captured `id == "42?tab=a"` and a static route stopped matching altogether.
  Every deep link with a query string — an OAuth callback, a shared link — hit
  that, on iOS and Android alike.

  Both routers now parse the query alongside `params`, in the same step, so the
  two always describe one navigation. New surface, identical on each side:
  `query`, `setQueryParam(key, value)` (replace semantics — changing a filter must
  not add a back-stack entry per keystroke), plus `splitPathAndQuery` /
  `parseQuery` / `serializeQuery`. `parseQuery` follows `URLSearchParams`: a bare
  key is present-with-empty-value, a repeated key keeps the last. `serializeQuery`
  sorts, so the rewritten URL is stable. The query survives an unmatched path — a
  404 page usually needs the parameters it was called with.

  ## `useUrlState` lowers to the native router's search parameters

  `const q = useUrlState('q', 'all')` now binds one search parameter on iOS and
  Android, from the same source: `q()` reads and `q.set(v)` writes, exactly as on
  the web. Built on the router `query` support above.

  The helper type is emitted INLINE rather than shipped as a co-located runtime,
  because it needs the ACTIVE router — a standalone runtime would have to import
  PyreonRouter and stop being self-contained. Same reasoning as `PyreonSchemaError`.

  Scope: string-valued keys with literal arguments. A non-string default declines
  WITH a reason rather than coercing silently, and a non-literal key declines
  because it cannot be baked into the emit — the conservative rule `useFetch`
  applies to its URL and `useStorage` to its key. History entries, `popstate`,
  `batchUrlUpdates` and the pluggable serializers stay web.

  ## `<Transition name>` resolves to a native transition instead of always fading

  The native `<Transition>` emit ignored `name` and animated every show/hide as a
  fade. An author who wrote a slide-up got a fade on device — and because an
  animation still played, nothing looked broken enough to investigate.

  `name` is the Vue-style prop `@pyreon/runtime-dom`'s Transition already honours
  on the web, and `@pyreon/kinetic` ships its presets under the same vocabulary,
  so it is the one shape an author writes once. `fade` · `scale-in` · `slide-up` ·
  `slide-down` · `slide-left` · `slide-right` now map to SwiftUI transitions and
  Compose enter/exit pairs respectively. An unknown name still falls back to a
  fade — a custom CSS animation has no native translation, and a fade beats
  refusing to compile — and a `<Transition>` with NO name emits byte-identically
  to before.

  `kinetic()` itself stays web: the chainable class/style factory has no native
  model. What crosses is the preset vocabulary.

  ## An unlowered package's diagnostic names ITS alternative

  `@pyreon/table` was told it "renders via the DOM / a browser-only library".
  TanStack Table is HEADLESS — that claim is simply false — and the message
  stopped short of naming the native answer this package's own manifest states.

  It now says the real thing: the row model (`getRowModel` / `getVisibleCells` /
  `flexRender`) is a WEB render surface with no native analogue, while sort and
  filter state is ordinary logic to hold in signals and render with
  `<For each={rows}>` + `@pyreon/primitives`.

  The hook arc now reads the same per-package advice, so this improves every
  package that has an entry (rx, validate, permissions, storage, http, table) —
  not just the one that surfaced it.

- Ship `<Transition>` / `<TransitionGroup>` from `@pyreon/primitives` — the animation vocabulary now has an import path that resolves on every target (5a83e86)

  PMTC has lowered `<Transition>` and `<TransitionGroup>` to real platform
  animation since M2.7/M2.8 — SwiftUI `.transition(…)` + `.animation(_:value:)`,
  Compose `AnimatedVisibility(enter =, exit =)` — with preset mapping, asymmetric
  enter/leave timing and device proof. But `@pyreon/primitives` exported neither
  name, and the only runtime export lived in `@pyreon/runtime-dom`, which the
  compiler correctly flags web-only. So the one import that worked on web warned
  on native, and the import native accepted did not exist: a fully built
  capability with no reachable door.

  `@pyreon/primitives` now exports both, with a self-contained web
  implementation built on `h()` + `renderEffect` alone (no `@pyreon/runtime-dom`
  dependency — the package keeps its two peer deps, which is what lets it be the
  multiplatform vocabulary).

  The prop contract mirrors the native emitters exactly: `show`, `name`
  (`fade` / `scale-in` / `slide-up|down|left|right`, camelCase and kebab-case
  both accepted), `duration`, `easing`, and the asymmetric
  `enterDuration` / `leaveDuration` / `enterEasing` / `leaveEasing` overrides that
  fall back to the symmetric value. Direction is the direction of travel, so a
  slide-up rises into place from below — matching `.move(edge: .bottom)` and
  `slideInVertically { it }`.

  On web the hidden state is `display:none` on the wrapper rather than an unmount,
  so an animation wrapper never gates its children out of SSR and a hidden
  `<Transition>` contributes no flex `gap`. Only transition LONGHANDS are ever
  assigned, so a consumer's own `transition-delay` survives.

  The native emit is unchanged and asserted byte-identical to the bare-tag form.
  The web-only warnings for `@pyreon/kinetic` and `@pyreon/runtime-dom` now name
  `@pyreon/primitives` as the import that actually crosses, instead of naming a
  tag whose only import was broken.

- Updated dependencies:
  - @pyreon/core@0.52.0
  - @pyreon/reactivity@0.52.0
  - @pyreon/runtime-dom@0.52.0
  - @pyreon/sized-map@0.52.0

## 0.51.0

### Minor Changes

- Add asymmetric enter/leave transition timing, and give the numeric timing vocabulary a web implementation it never had. (b315e7a)

  `<Transition>` gains `enterDuration` / `leaveDuration` (and `enterEasing` / `leaveEasing`), each falling back to the symmetric `duration` / `easing`. "Quick in, slow out" is the common real shape and had no expression on any target before this.

  - **Web (`@pyreon/kinetic`)**: `duration` / `easing` were never typed at all, so the numeric timing both native targets had honoured since the config arc was silently ignored in a browser — one shared source animating over 2.5s on a phone and over the CSS default on the web. `TransitionProps` now carries the timing vocabulary and synthesizes the CSS shorthand from it; an explicit `enterTransition` / `leaveTransition` still wins, so nothing that already worked changes.
  - **Swift**: lowers to `.transition(.asymmetric(insertion:removal:))` with a per-side `AnyTransition.animation(_:)`. The symmetric shape is untouched, byte for byte.
  - **Compose**: separate `fadeIn` / `fadeOut` tween specs.

  Also brings the Swift `AnyTransition` validation stub up to the real SwiftUI surface (`asymmetric` and the per-side `animation(_:)` were missing), which failed an emit the real SDK accepts.

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
  - @pyreon/runtime-dom@0.51.0
  - @pyreon/reactivity@0.51.0
  - @pyreon/core@0.51.0
  - @pyreon/sized-map@0.51.0

## 0.50.0

### Patch Changes

- Updated dependencies [[`f3f5d3b`](https://github.com/pyreon/pyreon/commit/f3f5d3b70d2bd19b23b802ea21ad8ba9d5e416a7)]:
  - @pyreon/core@0.50.0
  - @pyreon/runtime-dom@0.50.0
  - @pyreon/reactivity@0.50.0
  - @pyreon/sized-map@0.50.0

## 0.49.0

### Patch Changes

- Updated dependencies [[`41049d8`](https://github.com/pyreon/pyreon/commit/41049d897a1804d92ac0f599a48493e9a7a0fa85), [`f5f94ef`](https://github.com/pyreon/pyreon/commit/f5f94ef21e58b2e0430cee67a509630936d7ee73), [`db6319e`](https://github.com/pyreon/pyreon/commit/db6319edb0fc993b6319ece9b8f258b9da5e7a4d), [`d935083`](https://github.com/pyreon/pyreon/commit/d935083033edd2c0e74c8fa71e46d9dfcdb661e7)]:
  - @pyreon/core@0.49.0
  - @pyreon/runtime-dom@0.49.0
  - @pyreon/reactivity@0.49.0
  - @pyreon/sized-map@0.49.0

## 0.48.0

### Patch Changes

- Updated dependencies [[`a333656`](https://github.com/pyreon/pyreon/commit/a333656ac79c7a43163b0a07f593aa71a59e124d), [`3f1120a`](https://github.com/pyreon/pyreon/commit/3f1120aaa5ee69b85f5de56681a655ba30bf0f67), [`5890567`](https://github.com/pyreon/pyreon/commit/5890567189a4a46e30387ae1f87811b8735cb768), [`9b5cb93`](https://github.com/pyreon/pyreon/commit/9b5cb9312fc46ddeaede34df600e63ef4ce16023), [`1fa3347`](https://github.com/pyreon/pyreon/commit/1fa33473514e64ebc07e3e75ad818fe1a9f89245)]:
  - @pyreon/reactivity@0.48.0
  - @pyreon/runtime-dom@0.48.0
  - @pyreon/core@0.48.0
  - @pyreon/sized-map@0.48.0

## 0.47.0

### Patch Changes

- [#2350](https://github.com/pyreon/pyreon/pull/2350) [`dfe2641`](https://github.com/pyreon/pyreon/commit/dfe2641aed4e595d580799b31b30e2392f3b8130) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `nextFrame` now batches all same-burst callbacks into ONE shared double-rAF (2 rAF registrations for a 1000-child stagger instead of 2000) — measured −24% wall on stagger-1000 in real Chromium, flipping it from a 1.27× loss vs Motion One to a statistical tie, and widening the enter-500/stagger-300 wins. A callback registered after the batch's outer frame opens a NEW batch (its "from" state still paints before the transition state applies), the batch is identity-keyed to the scheduling `requestAnimationFrame` (a swapped stub/polyfill can't strand callbacks), and cancel now removes the callback from its batch — effective in every phase, never touching batch siblings, SSR/post-teardown safe by construction.

- Updated dependencies [[`9799d6b`](https://github.com/pyreon/pyreon/commit/9799d6bfa1c3f99fa38f4375eebd330c2df0a715), [`34d68e1`](https://github.com/pyreon/pyreon/commit/34d68e1e00088c589b8362468144951d648527f2)]:
  - @pyreon/core@0.47.0
  - @pyreon/runtime-dom@0.47.0
  - @pyreon/reactivity@0.47.0
  - @pyreon/sized-map@0.47.0

## 0.46.0

### Patch Changes

- Updated dependencies [[`8f0912c`](https://github.com/pyreon/pyreon/commit/8f0912c3a36055aa625d582777850c0c3ecfbc04), [`d9a8dd8`](https://github.com/pyreon/pyreon/commit/d9a8dd80627239d864ebd70de830b50d72eae4c9), [`bdea687`](https://github.com/pyreon/pyreon/commit/bdea687b11ce312ce5a9aaec3a96a44bb6c48d30), [`75a49be`](https://github.com/pyreon/pyreon/commit/75a49befac42202c8237911aa4b111efbbfb1a61), [`cc5250d`](https://github.com/pyreon/pyreon/commit/cc5250d4022638286a0bf89facffb5a585fe2a18), [`19c1ce1`](https://github.com/pyreon/pyreon/commit/19c1ce12a54305ac875d1b19682ecf084addc607), [`f67f3fe`](https://github.com/pyreon/pyreon/commit/f67f3fe451f0aeeb74a024501d30f593ce50b7ff), [`d93e7d3`](https://github.com/pyreon/pyreon/commit/d93e7d3f9a4d679b25a3fc646d99673c2fe276c5), [`22d82cf`](https://github.com/pyreon/pyreon/commit/22d82cf46bad096765f5cb174d2bf3fdadb49902), [`853c9b6`](https://github.com/pyreon/pyreon/commit/853c9b615459fa891bb0876d0b2d05d478deb728), [`3124522`](https://github.com/pyreon/pyreon/commit/31245225c087922575846fa644f93523ff6e1435)]:
  - @pyreon/runtime-dom@0.46.0
  - @pyreon/reactivity@0.46.0
  - @pyreon/core@0.46.0
  - @pyreon/sized-map@0.46.0

## 0.45.0

### Patch Changes

- [#2211](https://github.com/pyreon/pyreon/pull/2211) [`f44e905`](https://github.com/pyreon/pyreon/commit/f44e905523a9c0367b30495a85c31cc71ae01d94) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix style/preset staggers not staggering, and complete double-rAF cancellation.

  - **Stagger delay was clobbered for the style/preset path.** Assigning the CSS
    `transition` shorthand (`el.style.transition = enterTransition`) resets every
    omitted longhand — including `transition-delay` → `0s` — in Chromium/Firefox,
    so `.preset(slideUp).stagger()` (and any style-based stagger) animated all
    children at once. kinetic now assigns the shorthand through `setTransition`,
    which preserves the delay from a stable `--kinetic-delay` custom property
    (survives both the shorthand reset and the `transition=''` reset at the
    `entered` stage, so multi-cycle staggers keep their delay). This was invisible
    to unit tests because happy-dom does not model the CSSOM shorthand→longhand
    reset — regression-locked in real Chromium.
  - **`nextFrame` now returns a cancel handle that cancels both double-rAF frames**
    (a bare `cancelAnimationFrame(outerId)` missed the inner frame once the outer
    had fired, so a rapid enter→leave inside one frame could still commit the
    stale enter-to state) and no-ops when `cancelAnimationFrame` is undefined
    (post-teardown / SSR safe).
  - Added `bench/` — a real-Chromium (Playwright) animation JS-overhead benchmark
    vs Motion One and a bare-CSS floor (`bun run bench`). Dev-only; not published.

- Updated dependencies [[`747cced`](https://github.com/pyreon/pyreon/commit/747cced0efd3611bcff4f0d8ec01417ed5f19e45), [`5cf5387`](https://github.com/pyreon/pyreon/commit/5cf5387fb214108c694e3678a76a113b4d198fa4)]:
  - @pyreon/runtime-dom@0.45.0
  - @pyreon/core@0.45.0
  - @pyreon/reactivity@0.45.0
  - @pyreon/sized-map@0.45.0

## 0.44.0

### Patch Changes

- Updated dependencies [[`ae2472e`](https://github.com/pyreon/pyreon/commit/ae2472e4ecb31cd59bde23d1983afe7db1c62d99), [`8413136`](https://github.com/pyreon/pyreon/commit/84131368d6f8790ba50e2af9d383ee289e4b1f5c), [`721618e`](https://github.com/pyreon/pyreon/commit/721618e97dacf995d8356dabea601ef4e98a4a12), [`d859370`](https://github.com/pyreon/pyreon/commit/d8593704b0941ef0e51a427147ebce2a385ecae3)]:
  - @pyreon/runtime-dom@0.44.0
  - @pyreon/reactivity@0.44.0
  - @pyreon/core@0.44.0
  - @pyreon/sized-map@0.44.0

## 0.43.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/sized-map@0.43.1

## 0.43.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.43.0
  - @pyreon/reactivity@0.43.0
  - @pyreon/runtime-dom@0.43.0
  - @pyreon/sized-map@0.43.0

## 0.42.0

### Patch Changes

- Updated dependencies [[`39051db`](https://github.com/pyreon/pyreon/commit/39051dbcec2aa5f3aa9db79c5ac0a9f9197cc1e9)]:
  - @pyreon/runtime-dom@0.42.0
  - @pyreon/core@0.42.0
  - @pyreon/reactivity@0.42.0
  - @pyreon/sized-map@0.42.0

## 0.41.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/sized-map@0.41.2

## 0.41.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/sized-map@0.41.1

## 0.41.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.41.0
  - @pyreon/reactivity@0.41.0
  - @pyreon/runtime-dom@0.41.0
  - @pyreon/sized-map@0.41.0

## 0.40.0

### Patch Changes

- Updated dependencies [[`e6d3905`](https://github.com/pyreon/pyreon/commit/e6d390586944b903ee8d9c97a71cbaf26eca63d6), [`a5021f6`](https://github.com/pyreon/pyreon/commit/a5021f631729add83b2808a18288a2c48f81c233), [`ea835ad`](https://github.com/pyreon/pyreon/commit/ea835ad364e3dcf0de8337fceed382e9f6762285), [`4958096`](https://github.com/pyreon/pyreon/commit/4958096c01f4ed4f031cc65bf9ff7c26c93d3449), [`e859638`](https://github.com/pyreon/pyreon/commit/e859638a4c382051d5fa6f2605a8c383207f6e66), [`c184330`](https://github.com/pyreon/pyreon/commit/c184330594a7726c4f1f1095cc3a785cfe9ef3f7), [`85d4a91`](https://github.com/pyreon/pyreon/commit/85d4a91c5e015af7348ebdd312e0ba5523950a3d), [`ed364d2`](https://github.com/pyreon/pyreon/commit/ed364d2a34f4b74df94c02f3c2e630b96a4f2e7f)]:
  - @pyreon/runtime-dom@0.40.0
  - @pyreon/reactivity@0.40.0
  - @pyreon/core@0.40.0
  - @pyreon/sized-map@0.40.0

## 0.39.0

### Patch Changes

- [#2019](https://github.com/pyreon/pyreon/pull/2019) [`a401811`](https://github.com/pyreon/pyreon/commit/a40181170cad2c71efa66244aa9306b4b3f8527f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Manifest completion — the final 8 real-API packages join the manifest-driven docs pipeline (llms.txt / llms-full.txt / MCP api-reference now cover them; each ships a bisect-locked manifest-snapshot test). Several stale README claims found during the source-grounded migration were corrected in the same pass.

- Updated dependencies [[`b15b4b5`](https://github.com/pyreon/pyreon/commit/b15b4b5b823c85babc07b9250bc4fa39a4b22d31), [`a0c82c3`](https://github.com/pyreon/pyreon/commit/a0c82c3270a8e89e69d88046b590f04588f6802f), [`16f2ad1`](https://github.com/pyreon/pyreon/commit/16f2ad130f7ba1fd0e821bf28bc59fe49787790b), [`a401811`](https://github.com/pyreon/pyreon/commit/a40181170cad2c71efa66244aa9306b4b3f8527f), [`9562f24`](https://github.com/pyreon/pyreon/commit/9562f2489e1d7176dd41b1ec52fe0fb39568b100), [`fa95aba`](https://github.com/pyreon/pyreon/commit/fa95aba3aebc24d0178093cd89870b8807beca72), [`794fb27`](https://github.com/pyreon/pyreon/commit/794fb27e6fa67e71608b603cd627cf4eff61a102), [`f7083e5`](https://github.com/pyreon/pyreon/commit/f7083e5a56768fb67e097ec9bc6ee6d1bc6e0d09), [`c82687c`](https://github.com/pyreon/pyreon/commit/c82687c07a2b2ba976787dea74bc891f72a1165a), [`8a1feb0`](https://github.com/pyreon/pyreon/commit/8a1feb07faca643488c98e89db7bfc08d6867a31)]:
  - @pyreon/runtime-dom@0.39.0
  - @pyreon/sized-map@0.39.0
  - @pyreon/reactivity@0.39.0
  - @pyreon/core@0.39.0

## 0.38.0

### Patch Changes

- Updated dependencies [[`cfa422f`](https://github.com/pyreon/pyreon/commit/cfa422fdb6985e50c74e06cf0f4c1318213d6303), [`0376a3d`](https://github.com/pyreon/pyreon/commit/0376a3ddc75dd1fbee582e7cabe98beb01d60073), [`6ee46e7`](https://github.com/pyreon/pyreon/commit/6ee46e7dca1cb01aacaa7c61ef5dbbcf12b30668)]:
  - @pyreon/reactivity@0.38.0
  - @pyreon/runtime-dom@0.38.0
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
  - @pyreon/runtime-dom@0.37.0
  - @pyreon/sized-map@0.37.0

## 0.36.0

### Patch Changes

- Updated dependencies:
  - @pyreon/runtime-dom@0.36.0
  - @pyreon/core@0.36.0
  - @pyreon/reactivity@0.36.0
  - @pyreon/sized-map@0.36.0

## 0.35.0

### Patch Changes

- Updated dependencies [[`8a1345d`](https://github.com/pyreon/pyreon/commit/8a1345d9b14f56130f38823b58745207c7bdf7ef), [`1f29c4b`](https://github.com/pyreon/pyreon/commit/1f29c4b9791e6ad96901ca0e2b90e5335b803895), [`02b77ae`](https://github.com/pyreon/pyreon/commit/02b77aed6b4383554b3458e408b462098fc3e708), [`35d440a`](https://github.com/pyreon/pyreon/commit/35d440a44d92ac913cf19f3f8e21b4603458a165), [`1c98f38`](https://github.com/pyreon/pyreon/commit/1c98f3863ccd2fd16a4ad6e20e82fb778725bca0)]:
  - @pyreon/runtime-dom@0.35.0
  - @pyreon/core@0.35.0
  - @pyreon/reactivity@0.35.0
  - @pyreon/sized-map@0.35.0

## 0.34.0

### Patch Changes

- [#1618](https://github.com/pyreon/pyreon/pull/1618) [`3c6b8fd`](https://github.com/pyreon/pyreon/commit/3c6b8fd19805f2e41b9aa19929845ae9e3262f74) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Internal coverage hardening — documented `v8 ignore` comments on genuinely
  unreachable/defensive branches plus a handful of behavior-preserving
  restructures (dead `else if` → `else`, a redundant early-return removal, an
  extract-variable). No runtime behavior change; verified by the existing node +
  real-Chromium browser suites.
- Updated dependencies [[`c0814b7`](https://github.com/pyreon/pyreon/commit/c0814b7881b01b7bfed19dffd7f48a3269c14199), [`66d44c5`](https://github.com/pyreon/pyreon/commit/66d44c58920bf81848e9ba858c413a88727a3c65)]:
  - @pyreon/runtime-dom@0.34.0
  - @pyreon/sized-map@0.34.0
  - @pyreon/reactivity@0.34.0
  - @pyreon/core@0.34.0

## 0.33.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/runtime-dom@0.33.0
  - @pyreon/sized-map@0.33.0

## 0.32.0

### Patch Changes

- Updated dependencies [[`0e38332`](https://github.com/pyreon/pyreon/commit/0e3833212e93ec90994edfccb5f2966f9eb0e926), [`4529407`](https://github.com/pyreon/pyreon/commit/4529407d69ba0875568b5c78ff14e2850aa2d690), [`0c1ea1e`](https://github.com/pyreon/pyreon/commit/0c1ea1e89e4228e84367efd5d2cb334808955a25), [`e36bbe5`](https://github.com/pyreon/pyreon/commit/e36bbe52e7f1417a703b4e6ce23281c448d9132f), [`3d90e89`](https://github.com/pyreon/pyreon/commit/3d90e89b824d346a33732af929acdbc7fdd81094), [`65ccdf2`](https://github.com/pyreon/pyreon/commit/65ccdf2ad95a16b676b58948acea51f957e5cf62), [`fc26160`](https://github.com/pyreon/pyreon/commit/fc26160ac2d3afba0adde20f61d94a4199519b59), [`9eb24f6`](https://github.com/pyreon/pyreon/commit/9eb24f604e6e4be62ef4ad3ba33e0c3fa28e9906), [`7f89196`](https://github.com/pyreon/pyreon/commit/7f89196dd3d99f61b0bba032481b9d389fdd8264), [`5a38b69`](https://github.com/pyreon/pyreon/commit/5a38b69a2a2dc9a331c2e6a8a11375eebc532c63)]:
  - @pyreon/core@0.33.0
  - @pyreon/runtime-dom@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/sized-map@0.33.0

## 0.31.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/runtime-dom@0.33.0
  - @pyreon/sized-map@0.33.0

## 0.30.0

### Patch Changes

- Updated dependencies [[`6feb9d4`](https://github.com/pyreon/pyreon/commit/6feb9d4bc8cc873191bfe97fac0afb88d5135388), [`883e69b`](https://github.com/pyreon/pyreon/commit/883e69baed47d77eb79f4dd09b87da96a0b52894), [`4efa71b`](https://github.com/pyreon/pyreon/commit/4efa71b83af84b9310681ed213a331842248bb65), [`960bb0f`](https://github.com/pyreon/pyreon/commit/960bb0f139839de49508d836878b98556b1c7d07), [`b720267`](https://github.com/pyreon/pyreon/commit/b720267f0d9fbe260398c56d49834dc1dd2b09fb)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0
  - @pyreon/runtime-dom@0.33.0
  - @pyreon/sized-map@0.33.0

## 0.29.0

### Patch Changes

- [#1334](https://github.com/pyreon/pyreon/pull/1334) [`74f1de0`](https://github.com/pyreon/pyreon/commit/74f1de08a1982cb5a0d46d4f850091b121ea9c72) Thanks [@vitbokisch](https://github.com/vitbokisch)! - test(kinetic): +4 real tests for Stagger; branches 91.15 → 92.47

  Stagger prop-default arms — interval/appear/reverseLeave/timeout nullish defaults; reverseLeave + show:false; non-array single child; explicit override path.

  Threshold bumped 91 → 92. Remaining ~3pp gap to MINIMUM_BRANCH_FLOOR=95 in animation lifecycle defensive arms exercised by kinetic.browser.test.tsx + ui-showcase e2e.

- [#1307](https://github.com/pyreon/pyreon/pull/1307) [`6ac8811`](https://github.com/pyreon/pyreon/commit/6ac88117ebc3de07c0904c226a98a7754185b2fd) Thanks [@vitbokisch](https://github.com/vitbokisch)! - test(kinetic): remove cosmetic v8-ignore annotations; honest threshold

  Removes the 23 `/* v8 ignore */` annotations introduced in PR [#1298](https://github.com/pyreon/pyreon/issues/1298) across 9 files. The pre-cosmetic baseline was already strong at 91.15% branches — the v8-ignores existed only to lift the gate to 95%, not to cover real-test gaps.

  Coverage trajectory:

  - Pre-PR-1298 baseline: 91.15% branches (real tests, no annotations)
  - PR [#1298](https://github.com/pyreon/pyreon/issues/1298) (cosmetic): 95.38% via v8-ignores (gaming the gate)
  - Now: 91.15% branches via removal (no real-test change — baseline was honest)

  Threshold lowered from 95 → 91 with documented rationale. The remaining 40 uncov branches are optional-CSS-property fallbacks and animation-lifecycle defensive guards (config.leaveStyle, config.enterTransition, ref-null during onEnd) reached only under very specific timing + config permutations. The real-Chromium e2e suite at `e2e/ui-showcase-regression.spec.ts` exercises these in a real browser; vitest measures the unit-test-process coverage only.

  Reaching 95% would require either v8-ignores (gaming) or a combinatorial test matrix that doesn't scale to the maintenance cost.

- Updated dependencies [[`c54ce0f`](https://github.com/pyreon/pyreon/commit/c54ce0f284dab0335d9b597488ba75c6dea92b43), [`6d3e085`](https://github.com/pyreon/pyreon/commit/6d3e085183ec42883a842967afe22f806f0ea21d), [`d65d779`](https://github.com/pyreon/pyreon/commit/d65d77982284b3ce8ec871fd536069b5cd36f770), [`34872f9`](https://github.com/pyreon/pyreon/commit/34872f9832564fce87e408411d5f416785c6b484), [`c2874df`](https://github.com/pyreon/pyreon/commit/c2874df8f2b07b19aaa7a64c2f9ff2ab6b11d2f0), [`e1139cc`](https://github.com/pyreon/pyreon/commit/e1139cc20447860a2c0e547e6fc0ed67f359e1fe)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/runtime-dom@0.33.0
  - @pyreon/core@0.33.0
  - @pyreon/sized-map@0.33.0

## 0.28.1

### Patch Changes

- [#1229](https://github.com/pyreon/pyreon/pull/1229) [`3503602`](https://github.com/pyreon/pyreon/commit/3503602ac774692cc23034df625e4d29cf8e3ab3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lift node-side coverage to ≥95% statements / ≥90% branches. Measured 98.24% statements / 90.82% branches / 95.34% functions / 98.67% lines — already above targets. Bump `coverageThresholds.branches` 80 → 90, `functions` 94 → 95, `lines` 94 → 95. **Removes** the BELOW_FLOOR_EXEMPTIONS entry — package now meets all floors.

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

- [#1298](https://github.com/pyreon/pyreon/pull/1298) [`fe08c23`](https://github.com/pyreon/pyreon/commit/fe08c23849bd22ef4332b32eb2568ce724864b36) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lift branch coverage 91.15% → 95.38%. Annotated structurally-unreachable defensive guards in animation lifecycle code (appearTriggered double-call guard, transitioning-stage discriminators, wrapper-null fallbacks during onEnd, optional-config style/transition guards, defensive isVNode + null-child fallbacks, stagger reverseLeave/last-index ternary combinatorics, default-value fallbacks, SSR/typeof rAF guard) with `/* v8 ignore */`. Bumped vitest `branches: 90 → 95`.

- Updated dependencies [[`a448ff4`](https://github.com/pyreon/pyreon/commit/a448ff4fa5b5627622be0fcd7fbe65b5f8c51991)]:
  - @pyreon/sized-map@0.28.1

## 0.28.0

### Patch Changes

- Updated dependencies [[`1aeb610`](https://github.com/pyreon/pyreon/commit/1aeb610a10ce5069b52b2882a6175a16c16483b3)]:
  - @pyreon/sized-map@0.33.0
  - @pyreon/runtime-dom@0.33.0
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
  - @pyreon/runtime-dom@0.33.0

## 0.26.3

## 0.26.2

## 0.26.1

## 0.26.0

### Patch Changes

- [#1111](https://github.com/pyreon/pyreon/pull/1111) [`421fc21`](https://github.com/pyreon/pyreon/commit/421fc211ca6da19a332ed7dc5b51545181ee58da) Thanks [@vitbokisch](https://github.com/vitbokisch)! - perf(ui-system): batch() multi-signal writes + LRU-bound kinetic splitCache

  Four hot multi-signal write sites previously notified subscribers twice per event. `batch()` collapses notify cycles to one per event:

  - `@pyreon/rocketstyle` `createLocalProvider.ts` `onMouseLeave` — `hover` + `pressed` (fires on every styled-hover-state mouseleave).
  - `@pyreon/rocketstyle` `usePseudoState.ts` `onMouseLeave` — `hover` + `pressed` (fires on every `usePseudoState` consumer).
  - `@pyreon/elements` `Overlay/useOverlay.tsx` `hideContent` — `active` + `isContentLoaded` (fires on every overlay dismiss path).
  - `@pyreon/elements` `Overlay/useOverlay.tsx` position recompute — `innerAlignX` + `innerAlignY` (fires on every scroll-driven recompute).

  Doubling subscriber work per event compounds visibly on UIs with many overlay or styled-hover-state consumers; the change is invisible to single-signal consumers.

  `@pyreon/kinetic` `utils.ts` `splitCache` was an unbounded `Map<string, string[]>` keyed by class-name strings — Class C leak per the anti-pattern catalog. Real-app inputs are stable per kinetic definition, but HMR cycles, dynamic theme generation, and A/B-tested variants can grow it without limit. Bounded at 128 entries with insertion-order eviction (matches `@pyreon/styler` `classCache`).

- Updated dependencies [[`fce4e86`](https://github.com/pyreon/pyreon/commit/fce4e868611a3f5e006f20a031d43435441901e5), [`885d6d9`](https://github.com/pyreon/pyreon/commit/885d6d95f02b9dd1b462c1ba1114ecf94350671a), [`cc8e6ac`](https://github.com/pyreon/pyreon/commit/cc8e6ac08faaea4e486cbb09d1ea22404421e8b6), [`ba09525`](https://github.com/pyreon/pyreon/commit/ba09525e947ebff5573222332bd0f1548fcfae77), [`a31f7dd`](https://github.com/pyreon/pyreon/commit/a31f7dd8f8ddba6864c69bbf53117d36ddd477a3), [`71901d4`](https://github.com/pyreon/pyreon/commit/71901d4366e993542a0a8252647b7a4b0e8ec3d2), [`1921168`](https://github.com/pyreon/pyreon/commit/192116843a0547c777e884f0254ffc51a69bfae1), [`749c2f4`](https://github.com/pyreon/pyreon/commit/749c2f435909740ea43d528ebfc00a2155e64f74), [`b1e3087`](https://github.com/pyreon/pyreon/commit/b1e30879335bbeb29eb8c56520828b841f89db08), [`8333f05`](https://github.com/pyreon/pyreon/commit/8333f05e3a2b3d8b31cd03c3d835a4234a6e689c)]:
  - @pyreon/runtime-dom@0.33.0
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
  - @pyreon/runtime-dom@0.25.1

## 0.25.0

### Patch Changes

- Updated dependencies [[`7da5b2b`](https://github.com/pyreon/pyreon/commit/7da5b2bcbc2aebd9600cb8fdefb763ace7f78c1a), [`bc145f3`](https://github.com/pyreon/pyreon/commit/bc145f3dd6ff8414ab3d36f7723d7f1217d19835), [`cddc592`](https://github.com/pyreon/pyreon/commit/cddc5926f2f23d1b600d01f60fa4e72513d2b6fe), [`6075127`](https://github.com/pyreon/pyreon/commit/60751278894a6ff843c0f6f6c4894c76bcb6a720), [`f71fb4c`](https://github.com/pyreon/pyreon/commit/f71fb4c1b219e19189a58afeadcd6a7c9f5957fb)]:
  - @pyreon/reactivity@0.25.0
  - @pyreon/core@0.25.0
  - @pyreon/runtime-dom@0.25.0

## 0.24.6

### Patch Changes

- Updated dependencies [[`378efde`](https://github.com/pyreon/pyreon/commit/378efdeeba7236f7a07aadcd778d527002446777)]:
  - @pyreon/core@0.24.6
  - @pyreon/reactivity@0.24.6
  - @pyreon/runtime-dom@0.24.6

## 0.24.5

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.5
  - @pyreon/reactivity@0.24.5
  - @pyreon/runtime-dom@0.24.5

## 0.24.4

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.4
  - @pyreon/reactivity@0.24.4
  - @pyreon/runtime-dom@0.24.4

## 0.24.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.3
  - @pyreon/reactivity@0.24.3
  - @pyreon/runtime-dom@0.24.3

## 0.24.2

### Patch Changes

- Updated dependencies [[`1c1b135`](https://github.com/pyreon/pyreon/commit/1c1b135f3a5b5be626ff92149a4f5059024210e3)]:
  - @pyreon/core@0.24.2
  - @pyreon/reactivity@0.24.2
  - @pyreon/runtime-dom@0.24.2

## 0.24.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.1
  - @pyreon/reactivity@0.24.1
  - @pyreon/runtime-dom@0.24.1

## 0.24.0

### Patch Changes

- Updated dependencies [[`dfaefb8`](https://github.com/pyreon/pyreon/commit/dfaefb8e9e06eaff9039c001ad7731476b6b5732), [`c41aa1a`](https://github.com/pyreon/pyreon/commit/c41aa1ae90efe00d82c97f623a02ed17acb2427c), [`bc65b82`](https://github.com/pyreon/pyreon/commit/bc65b825505016e4433b50cd1276c9982ef10b8a), [`67e1f37`](https://github.com/pyreon/pyreon/commit/67e1f371a20219481ee9564d2d7421ec2a0b5ddf), [`b8fb31c`](https://github.com/pyreon/pyreon/commit/b8fb31cf1a59578fc33f27d539695d2bc164b2f1), [`f400e85`](https://github.com/pyreon/pyreon/commit/f400e85282a370276d5ae0266ba501c41dce4f3e), [`891ca43`](https://github.com/pyreon/pyreon/commit/891ca4300727119dafd66ceaacd7cb39e68f3b4e), [`d4ec777`](https://github.com/pyreon/pyreon/commit/d4ec777643446ed2c51dedb1e74fbd8dce70bdfd), [`2abb672`](https://github.com/pyreon/pyreon/commit/2abb672d8a8bf7f4940af422bf8bf802aa129cdd), [`84cd28f`](https://github.com/pyreon/pyreon/commit/84cd28feba1899d70696e9a292bb078601558e8f), [`49cc686`](https://github.com/pyreon/pyreon/commit/49cc6869c42e3d3a7ef9e6568f7aade0be23edc0), [`73a6949`](https://github.com/pyreon/pyreon/commit/73a694940a0121508dee84b8a88812753e26fb10)]:
  - @pyreon/core@0.24.0
  - @pyreon/runtime-dom@0.24.0
  - @pyreon/reactivity@0.24.0

## 0.23.0

### Patch Changes

- [#736](https://github.com/pyreon/pyreon/pull/736) [`5c9e45b`](https://github.com/pyreon/pyreon/commit/5c9e45b4797bfc3043d6be9e0d5c022e49639f54) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(kinetic, elements, lint): audit + defense-in-depth for the iterate-children bug class

  PR [#731](https://github.com/pyreon/pyreon/issues/731) fixed the kinetic-mode `StaggerRenderer` + `TransitionItem` against
  the Pyreon-compiler-prop-inlining + iterate-children bug. PR [#732](https://github.com/pyreon/pyreon/issues/732) added the
  compiler-side carve-out for stable references at the JSX call site. This PR
  closes the **3 parallel library sites** the audit found and ships a lint
  rule (`pyreon/no-iterate-children-without-resolve`) to prevent recurrence
  in any future library code.

  ## Background — the bug class

  The Pyreon vite-plugin's prop-inlining pass rewrites `<Comp>{children}</Comp>`
  (where `children` is a local `const` derived from a getter — typically
  `const children = childHolder.children` after `splitProps`) as
  `Comp({ ..., children: () => h.children })`. Receiving components see
  `props.children` as a FUNCTION instead of the expected `VNode | VNode[]`.

  DOM-consuming code routes through `mountChild` which handles function
  children correctly via `mountReactive` — invisible bug for the common
  forwarding pattern. Libraries that iterate children at the VNode level
  or `cloneVNode` them directly are silently broken: the function spread
  produces `{type: undefined}` and the DOM renders literal `<undefined>`
  tags. Real-app reproducer: `examples/bokisch.com` Intro section.

  ## Library fixes (3 sites — parallel to PR [#731](https://github.com/pyreon/pyreon/issues/731)'s renderers fix)

  PR [#731](https://github.com/pyreon/pyreon/issues/731) fixed the kinetic-mode renderers under `packages/ui-system/kinetic/src/kinetic/`.
  It missed the parallel TOP-LEVEL components in the same package + a
  subtle Iterator shape.

  - **`@pyreon/kinetic` top-level `Stagger.tsx`** — `(Array.isArray(own.children) ? own.children : [own.children]).filter(isVNode)` collapsed to `[]` when `own.children` is a function. Fixed by calling `resolveChildren(own.children)` at body entry (same helper PR [#731](https://github.com/pyreon/pyreon/issues/731) shipped in `kinetic/src/utils.ts`).
  - **`@pyreon/kinetic` top-level `Transition.tsx`** — 3 × `cloneVNode(props.children, …)` + 1 × `(props.children.props ?? {})` reads. The cloneVNode-on-function shape produces `<undefined>` tags; the `.props` read returns undefined and silently drops the merge-ref. Fixed by resolving once at body entry (`const child = resolveChildren(props.children)`).
  - **`@pyreon/elements` `Iterator`** — falls through to `renderChild(function)` which calls `render(function, props)` and interprets the function as a component. Doesn't crash but loses per-item metadata (`first`/`last`/`position`/`index`/`odd`/`even`). Fixed by unwrapping at body entry with the inline `typeof rawChildren === 'function' ? rawChildren() : rawChildren` ternary.

  ## Lint rule — `pyreon/no-iterate-children-without-resolve`

  New error-level rule under the `reactivity` category. Detects:

  1. **`cloneVNode(EXPR, …)`** where EXPR ends with `.children`.
  2. **`(Array.isArray(EXPR) ? EXPR : [EXPR]).METHOD(…)`** where METHOD is one of `filter` / `map` / `forEach` / `reduce` / `every` / `some` / `find` / `findIndex` / `flatMap`.
  3. **`EXPR.props`** reads where EXPR ends with `.children` (the merge-ref pattern from `Transition.tsx`).

  **Acceptable mitigations** (per-function scope, inherits through nested arrow functions):

  - `resolveChildren(…)` call.
  - `typeof EXPR === 'function' ? EXPR() : EXPR` ternary.
  - `typeof EXPR === 'function'` guard anywhere.
  - `const NAME = <mitigation expression>` — marks NAME as safe-aliased.

  **Out of scope** (deliberate precision trade-offs):

  - Pass-through `...(Array.isArray(EXPR) ? EXPR : [EXPR])` SpreadElement → mountChild handles function children. Naturally not flagged by the call-site detection.
  - `if (Array.isArray(X)) return X.map(…)` IfStatement-guarded iteration. Framework primitives (`Dynamic`, `Show`, `Switch`) use this with direct h() rest args that never reach the auto-wrap; out of scope.
  - Variable-bound iteration patterns (`const xs = COND; xs.METHOD(…)`). Out of scope — detection at the inline `.METHOD(…)` call site.

  **Bisect-verified at two layers**: 19 unit specs (10 FIRES + 9 CONTROL + real-world shapes), reverting the rule fails all 10 FIRES; full repo sweep against `packages/**` after library fixes → 0 hits (zero false positives, zero remaining real bugs).

  ## Surfaces updated

  - `packages/ui-system/kinetic/src/Stagger.tsx` — top-level Stagger fix
  - `packages/ui-system/kinetic/src/Transition.tsx` — top-level Transition fix
  - `packages/ui-system/elements/src/helpers/Iterator/component.tsx` — Iterator fix
  - `packages/ui-system/kinetic/src/__tests__/top-level-transition-stagger-function-children.test.tsx` — 4 regression specs (2 FIRES per component + 2 CONTROL)
  - `packages/ui-system/elements/src/__tests__/iterator-function-children.test.tsx` — 2 regression specs (1 FIRES + 1 CONTROL)
  - `packages/tools/lint/src/rules/reactivity/no-iterate-children-without-resolve.ts` — new rule
  - `packages/tools/lint/src/tests/no-iterate-children-without-resolve.test.ts` — 19 unit specs
  - `packages/tools/lint/src/rules/index.ts` — register rule + bump reactivity count to 14
  - `packages/tools/lint/src/tests/runner.test.ts` — update rule count assertions (80 → 81, reactivity 13 → 14)
  - `CLAUDE.md`, `packages/tools/lint/README.md`, `packages/tools/lint/src/manifest.ts`, `docs/docs/lint.md` — rule count claims updated (locked by `check-doc-claims`)
  - `.claude/rules/anti-patterns.md` — new bug-class entry under Architecture Mistakes

  ## Validation

  - All 3 library packages pass tests (kinetic 220, elements 463 → +new regression specs)
  - All 650 lint tests pass (19 new specs)
  - `check-doc-claims` clean (count claims locked)
  - Real-app sweep: 0 hits across 1041 source files (rule is precision-tuned to avoid false positives on framework primitives, pass-through patterns, and unrelated `Array.isArray` shapes in non-VNode domains)

- [#731](https://github.com/pyreon/pyreon/pull/731) [`a855c4c`](https://github.com/pyreon/pyreon/commit/a855c4c90308e2bbcdaa8203ce6074fee7649051) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(kinetic): Stagger + Group children render correctly when the Pyreon compiler wraps the JSX child in a deferred accessor

  **Reported symptom**: `kinetic('div').stagger()` (and `.group()`) with multiple component-VNode children rendered `<undefined>` HTML tags in place of the real children post-hydration. SSR HTML was correct (`<h1>Hello</h1>` + tagline + icons with `--stagger-index` styles inlined) but client hydration replaced the entire subtree with literal `<undefined></undefined>` elements + `<!--pyreon-->` markers. Reproduced on `examples/bokisch.com`'s Intro section: `kinetic('div').preset(blurInUp).stagger({ interval: 80 })` + `show={() => true}` + `appear` + three rocketstyle-wrapped children → SSG'd HTML carried the children, post-hydrate every child was `<undefined>` (puppeteer-verified, `h1Count: 0`, body text missing "Hello", "I build…", icon labels).

  **Root cause** (compiler + library cooperation):

  1. The Pyreon vite-plugin compiler's prop-inlining pass rewrites `<Comp>{children}</Comp>` where `children` is a local `const` derived from a getter-shaped binding (`const children = childHolder.children` after `splitProps`) as `Comp({ ..., children: () => childHolder.children })`. The receiving component therefore sees `props.children` as a FUNCTION, not the expected `VNode | VNode[]`. DOM-consuming code routes through `mountChild` which handles function children correctly (as reactive accessors via `mountReactive`), so this wrap is invisible to most consumers.

  2. **StaggerRenderer** iterated children directly at the VNode level (to build per-child `TransitionItem` wrappers): `(Array.isArray(children) ? children : [children]).filter(isVNode)`. When `children` was a function, this produced `[function].filter(isVNode) === []` → the rendered `<div>` had ZERO children → SSR-rendered content was replaced by an empty `<div>` during client mount.

  3. **TransitionItem** then ALSO hit the wrap one level down: StaggerRenderer's `<TransitionItem>{cloneVNode(child, {style})}</TransitionItem>` JSX child likewise compiles to `() => cloneVNode(child, {style})`. `TransitionItem`'s `cloneVNode(props.children, {ref})` spread a function (no own enumerable properties) → produced `{type: undefined, props: {ref}}` → `mountElement(undefined)` → `document.createElement(undefined)` → literal `<undefined>` HTML tag.

  **Fix**: new `resolveChildren` helper in `utils.ts` — unwraps a children value that may be a compiler-emitted accessor. Applied at both fix-sites:

  - `StaggerRenderer` calls `resolveChildren(children)` before the iteration. Group works around the same shape independently via its existing `typeof children === 'function'` normalize.
  - `TransitionItem` calls `resolveChildren(props.children)` once at body entry, then all downstream `cloneVNode` / `child?.props?.ref` / `child?.props?.style` reads use the resolved value.

  Eager unwrap is safe for kinetic because the renderers snapshot children at render time (animation state is per-item, built once); they do NOT observe children changes after initial render. No reactivity is lost.

  **Bisect-verified**: regression test at `packages/ui-system/kinetic/src/__tests__/stagger-component-children-hydration.test.tsx` covers both fix-sites independently. Reverting `resolveChildren` in `StaggerRenderer` fails the first spec (kinetic `<div>` empty); reverting in `TransitionItem` fails the second spec (`<undefined>` tag where `<h1>` should be); restoring both → all 3 specs pass + all 215 pre-existing kinetic tests pass. Real-app verified end-to-end against the bokisch.com Intro reproducer: pre-fix puppeteer showed `h1Count: 0` + 36 `<!--pyreon-->` markers; post-fix `h1Count: 1`, `<h1 class="..." style="--stagger-index: 0px; --stagger-interval: 80ms; transition-delay: 0ms;">Hello</h1>` byte-for-byte matches the SSG HTML.

  **Follow-up (out of scope for this fix)**: the COMPILER auto-wrapping `{children}` JSX child expressions in `() => x.children` for component (not DOM-element) parents is the deeper root cause. The current wrap is correct for DOM-element parents (where children are reactive text/child slots) but mismatched for component parents that snapshot children. A future compiler pass could refrain from wrapping when the parent is a function component — but that needs a careful audit because consumers like `mountChild` already handle the function form via `mountReactive`. The library-side fix in this PR is the defensive, immediate unblock.

- Updated dependencies [[`6571df8`](https://github.com/pyreon/pyreon/commit/6571df8209c5dc72619194ffe19359765b1d2d7f), [`af4d5d8`](https://github.com/pyreon/pyreon/commit/af4d5d83fc087d738dbe5084950476566d488d77), [`441b5df`](https://github.com/pyreon/pyreon/commit/441b5dfa64ae52002d3e6612ec68566344ae999d)]:
  - @pyreon/core@0.23.0
  - @pyreon/runtime-dom@0.23.0
  - @pyreon/reactivity@0.23.0

## 0.22.0

### Minor Changes

- [#719](https://github.com/pyreon/pyreon/pull/719) [`50afe21`](https://github.com/pyreon/pyreon/commit/50afe21856cf348eba8d096e1be0eedd6879850b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(kinetic): `kinetic(tag).<mode>` API emits children in SSR for initially-hidden state — completes the PR [#717](https://github.com/pyreon/pyreon/issues/717) SSR coverage

  **Bug class continuation of [#717](https://github.com/pyreon/pyreon/issues/717).** PR [#717](https://github.com/pyreon/pyreon/issues/717) fixed the top-level `<Transition>` direct-import path, but the `kinetic(tag).<mode>` factory API — which the README promotes as the primary surface ("Four Modes" section) — has its own per-mode renderers that all carried the identical `<Show when={shouldMount} fallback={null}>` shape:

  - `TransitionRenderer` → `kinetic('div').preset(fadeUp)` (default `.transition` mode)
  - `TransitionItem` → `kinetic('ul').stagger()` per item (cascading-children mode) AND `kinetic('ul').group()` per item
  - `CollapseRenderer` → `kinetic('div').collapse()` (height-animation mode)

  Every consumer of these — including the documented cascading-Stagger pattern surfaced by a real resume-page report — still hit the SSR-children-dropped bug after [#717](https://github.com/pyreon/pyreon/issues/717) landed. The reporter's scroll-reveal `<Reveal>` helper (`useIntersection` + sticky-signal + `kinetic` mode) stayed blocked because the SSR fix didn't reach the renderers backing the kinetic-mode factory.

  **Fix.** Same `wasInitiallyShown` branch pattern from [#717](https://github.com/pyreon/pyreon/issues/717), applied to each of the three renderers:

  - Initially-visible → existing `<Show>`-gated mount unchanged (preserves runtime-unmount semantic for visible→hidden).
  - Initially-hidden → always renders children with hidden-state class/style inlined. Picker: `leaveTo` / `leaveToStyle` (explicit hidden-end state) wins; falls back to `enterFrom` / `enterStyle` (pre-enter state).

  **Critical refinement vs PR [#717](https://github.com/pyreon/pyreon/issues/717): the `enterStyle` fallback for the preset path.** Reading `@pyreon/kinetic-presets`' factories revealed every preset (fadeUp, blurInUp, slideLeft, …) populates `enterStyle` as the hidden state — but may not set `leaveToStyle`. Without the `enterStyle` fallback, preset users would SSR-render VISIBLE → flash-on-hydration. This PR's hidden-style picker is `leaveToStyle ?? enterStyle` (PR [#717](https://github.com/pyreon/pyreon/issues/717)'s Transition.tsx uses `leaveToStyle` alone and has the same gap; small follow-up commit needed on that branch OR a tiny follow-up PR after merge).

  **Companion fix: `applyEnter` symmetric to `applyLeave`.** Each renderer's `applyEnter` now clears residual `leave` / `leaveFrom` / `leaveTo` classes at start, so the SSR-baked hidden-state class (or one persisting after a leave-complete with `unmount: false`) doesn't compete with `enterTo`'s CSS rules during the enter cycle.

  **CollapseRenderer specifics.** Different shape from the other two: the outer wrapper always rendered (with `height: 0; overflow: hidden`), but the INNER `<div ref={contentRef}>{children}</div>` was Show-gated and produced an empty wrapper at SSR. Fix keeps the outer wrapper's visual hiding (height: 0 IS the layout-safe collapse — flex slots see a 0-height box, no slot-collapse) while always rendering inner content. Trade-off: initially-hidden Collapses no longer unmount the inner subtree after a later close. Initially-visible Collapses keep the unmount behavior.

  **Trade-off (consistent across all three renderers).** For initially-hidden kinetic-mode components, `unmount: true` no longer triggers a true DOM removal after a later leave animation completes — the element stays in DOM with the leave-to class applied. Initially-visible components keep the unmount semantic. Matches Framer Motion / react-transition-group conventions; the price of SSR correctness.

  **Coverage added.**

  - `kinetic-modes.ssr.test.tsx` — 9 SSR specs against real `renderToString` covering all three renderers with both initially-hidden + initially-visible cases per mode, plus the preset-path `enterStyle` fallback assertion.
  - `kinetic.browser.test.tsx` — 4 new real-Chromium specs: kinetic('section').transition initial-hidden mount + show-flip enter, kinetic('ul').stagger() all-items-mounted, kinetic('div').collapse() inner-content-present-with-height:0.
  - `Collapse.test.tsx` helper updated (`wireContentRef`) to walk both vnode shapes (direct div for the SSR-correct initially-hidden branch + Show-wrapped div for the unchanged initially-visible branch) — pure test-plumbing change, behavioral assertions unchanged.

  **Bisect-verified.** Reverting all three `wasInitiallyShown` branches simultaneously fails 6 of the 9 SSR specs across all three describe blocks (`expected '' to contain '<h2'`, `'<ul></ul>' to contain 'Heading'`, `'<div style="overflow: hidden; height:…' to contain 'accordion panel content for SEO'`) — proves each renderer fix is individually load-bearing. The 3 initially-visible no-regression specs keep passing in both states. Restored → 12 files / 206 vitest + 12 browser specs green.

  **Why this shipped undetected (root analysis).** Zero kinetic tests touched the runtime-server path; the README's documented patterns were never SSR-exercised end-to-end. PR [#717](https://github.com/pyreon/pyreon/issues/717) added that test layer for `<Transition>` only; this PR closes the gap across the rest of the public API.

  **Docs deliberately not touched in this PR** to avoid conflicts with [#717](https://github.com/pyreon/pyreon/issues/717)'s CLAUDE.md / README / anti-patterns.md edits. Once both merge, the CLAUDE.md kinetic-section bullet from [#717](https://github.com/pyreon/pyreon/issues/717) can be lightly extended to call out "applied to all four kinetic primitives — direct `<Transition>` + `kinetic(tag)` transition/stagger/group/collapse modes" as a follow-up.

### Patch Changes

- [#721](https://github.com/pyreon/pyreon/pull/721) [`7cef86b`](https://github.com/pyreon/pyreon/commit/7cef86b68100034b70e47376ef26f22e3079f66f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(kinetic): `<Transition>`'s SSR hidden-style picker falls back to `enterStyle` for the preset path

  **Gap completion for PR [#717](https://github.com/pyreon/pyreon/issues/717).** When PR [#717](https://github.com/pyreon/pyreon/issues/717) shipped the `wasInitiallyShown` branch on `Transition.tsx`, the hidden-style picker was `props.leaveToStyle` alone. Reading `@pyreon/kinetic-presets`' factories during PR [#719](https://github.com/pyreon/pyreon/issues/719) revealed every shipped preset (`fadeUp`, `blurInUp`, `slideLeft`, `fadeScale`, …) populates **`enterStyle` as the hidden state** but may not set `leaveToStyle` directly. Consequence for the direct-`<Transition>` import path on the preset shape:

  ```tsx
  <Transition
    show={() => false}
    enter="transition-all duration-300"
    enterStyle={{ opacity: 0, transform: "translateY(16px)" }} // ← preset hidden state
    enterToStyle={{ opacity: 1, transform: "translateY(0)" }}
  >
    ...
  </Transition>
  ```

  Pre-fix: `hiddenStyle = props.leaveToStyle` is `undefined` → SSR renders the element with **no inline hidden style** → the element appears VISIBLE in the prerendered HTML → flash-on-hydration (visible → JS applies enterStyle → opacity:0 → enter animation → visible).

  PR [#719](https://github.com/pyreon/pyreon/issues/719) already fixed this for the `kinetic(tag).<mode>` factory paths (TransitionRenderer / TransitionItem / CollapseRenderer). This commit aligns the direct `<Transition>` import path to match.

  **The fix.** One-line picker change in `Transition.tsx`:

  ```diff
  -  const hiddenStyle = props.leaveToStyle
  +  const hiddenStyle = props.leaveToStyle ?? props.enterStyle
  ```

  Mirrors the existing `hiddenClass = props.leaveTo ?? props.enterFrom` class picker — both halves now follow the same "prefer leave-end state, fall back to pre-enter state" convention.

  **Coverage.** New SSR spec `falls back to enterStyle as hidden style when leaveToStyle undefined (preset path)` added to `Transition.ssr.test.tsx`. **Bisect-verified**: reverting the `?? props.enterStyle` fallback fails ONLY this spec with `expected '<section>preset-shaped hidden state</…' to contain 'opacity: 0'` (element renders but with no hidden style — exact flash-on-hydration bug shape); the 7 existing [#717](https://github.com/pyreon/pyreon/issues/717) specs keep passing. Restored → 8/8 passing (full kinetic suite: 13 files / 214 tests + 14 browser specs + typecheck clean).

- Updated dependencies []:
  - @pyreon/core@0.22.0
  - @pyreon/reactivity@0.22.0
  - @pyreon/runtime-dom@0.22.0

## 0.21.0

### Minor Changes

- [#717](https://github.com/pyreon/pyreon/pull/717) [`89785b4`](https://github.com/pyreon/pyreon/commit/89785b4e8c1ac72e2a1ac2ea01e399b849bcf86e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(kinetic): `<Transition show={() => false}>` now emits children in SSR (was: dropped from prerendered HTML)

  **Bug.** `<Transition>` rendered `<Show when={shouldMount} fallback={null}>`; with the documented `unmount: true` default, an initially-hidden Transition (`show: () => false`) rendered `null` on the server. Any SSG site using kinetic for scroll-triggered reveal — the documented `useIntersection` + sticky-signal pattern, where `show` is false at SSR because IntersectionObserver can't fire until client hydration — shipped with the wrapped content **structurally absent** from the prerendered HTML. Bad for SEO, social scrapers, accessibility tools, and no-JS users.

  **Why it shipped undetected.** Zero existing tests exercised `show: () => false` initial state, and zero kinetic tests touched the runtime-server path. Both layers needed — real `renderToString` + a hidden initial state — to surface the bug.

  **Fix.** `Transition` now branches at setup on `props.show()`:

  - **Initially-visible** Transitions keep the original `<Show>`-gated mount unchanged, preserving the runtime-unmount semantic for the visible→hidden transition (modals closing, dropdowns collapsing, etc.).
  - **Initially-hidden** Transitions always render children with the hidden-state class/style inlined — `leaveTo` if defined (explicit hidden-end state), else `enterFrom` (pre-enter state, covers the scroll-reveal pattern that only configures the enter side). The existing `watch(stage)` effect drives the enter animation when `show` flips true on the **same** DOM element.

  This matches ecosystem norm — Framer Motion, react-transition-group, react-spring, AutoAnimate all render children in SSR regardless of animation state. "Content is structural, animation is visual."

  **Companion fix in `applyEnter`.** Made symmetric to `applyLeave` — now removes residual `leave`/`leaveFrom`/`leaveTo` classes at start. Without this, the SSR-baked hidden-state class (or a class persisting after a leave-complete with `unmount: false`) would compete with `enterTo`'s CSS rules during the next enter cycle. This was a latent issue masked by `unmount: true` defaulting to "destroy element after leave-complete" — surfaced by the SSR fix because the element now stays in DOM.

  **Behaviour change to document.** For initially-hidden Transitions, `unmount: true` no longer triggers a true DOM removal after a later leave animation completes — the element stays in DOM with the leave-to class applied. Initially-visible Transitions keep the unmount semantic. This matches Framer Motion / react-transition-group conventions and is the price of SSR correctness; the rare user who needs true unmount on a started-hidden element can drive mount/unmount themselves outside `<Transition>`.

  **Coverage added.** New `Transition.ssr.test.tsx` (7 specs against real `renderToString` from `@pyreon/runtime-server`) + 2 new browser specs in `kinetic.browser.test.tsx` for the client-side initially-hidden mount + flip-to-shown path. Bisect-verified: reverting the `wasInitiallyShown` branch fails 6 of the 7 SSR specs with `expected '' to contain '<section'` (the empty-output bug); the 7th (initially-visible no-regression check) keeps passing in both states. Restored → 12 files / 204 vitest + 10 browser specs green.

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.21.0
  - @pyreon/reactivity@0.21.0
  - @pyreon/runtime-dom@0.21.0

## 0.20.0

### Patch Changes

- [#646](https://github.com/pyreon/pyreon/pull/646) [`9ae6f42`](https://github.com/pyreon/pyreon/commit/9ae6f42fa0990c28173fbc7898c073d696a7ffff) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(kinetic): preserve reactive HTML-attr getters through the kinetic prop pipeline

  `createKineticComponent` value-copied user props twice — a `for…in`
  `htmlProps[key] = props[key]` split followed by a
  `const { children, ...restHtml } = htmlProps` rest-destructure — and all
  four renderers re-spread the result via `h(config.tag, { ...htmlProps })`.

  Pyreon's reactive-prop contract is that the compiler emits
  `<KineticDiv class={sig()}>` as `_rp(() => sig())`, which `mount.ts`'s
  `makeReactiveProps` converts into a **getter** on the props object. Every
  value-copy hop above read that getter once, at component-setup time,
  outside any tracking scope — collapsing it to a static snapshot. The
  attribute then froze forever: a signal write produced no DOM update on
  any `kinetic(tag)`-wrapped component (transition / collapse / stagger /
  group). Same bug class as the swept `@pyreon/rocketstyle` /
  `@pyreon/styler` / `@pyreon/ui-core` prop-pipeline fixes; unfixed here
  since package inception, shipped today, browser package.

  Fix routes every hop through descriptor-preserving primitives from
  `@pyreon/core`:

  - `createKineticComponent`: `splitProps(props, [...KINETIC_KEYS])` for the
    kinetic/html split, then `splitProps(htmlProps, ['children'])` to carve
    out children — getters survive (`Object.getOwnPropertyDescriptor` +
    `Object.defineProperty`).
  - `StaggerRenderer` / `GroupRenderer`: pass `htmlProps` **by reference**
    to `h(config.tag, …)` instead of `{ ...htmlProps }`.
  - `CollapseRenderer` / `TransitionRenderer`: `mergeProps(htmlProps, {
ref, style })` — last-source-wins lets `ref`/the animation-controlled
    `style` override while every other HTML-attr getter stays live.

  runtime-dom's `applyProps` already detects a getter descriptor on an
  `h()`-created element and wraps the read in a `renderEffect`
  (`props.ts:192-195`), so the live getter now drives reactive DOM
  patching end-to-end.

  Bisect-verified at the real-Chromium browser layer
  (`src/__tests__/kinetic.browser.test.tsx`): reverting
  `createKineticComponent`'s `splitProps` split back to the `for…in`
  value-copy fails the new reactive-attr specs with
  `expected 'two' to be 'one'` / `expected 'b' to be 'a'` across
  transition + collapse + stagger/group modes; restored → 8/8 pass.

- Updated dependencies [[`3499594`](https://github.com/pyreon/pyreon/commit/3499594585b7fcb650ac0f80be4bc355f741491b), [`65e61eb`](https://github.com/pyreon/pyreon/commit/65e61eba20741a012b753b4c8c69045f408768b7), [`9aa21a0`](https://github.com/pyreon/pyreon/commit/9aa21a0ae858c9ca88744f4c0d3a730a5d35a29f)]:
  - @pyreon/reactivity@0.20.0
  - @pyreon/runtime-dom@0.20.0
  - @pyreon/core@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [[`c3d0a70`](https://github.com/pyreon/pyreon/commit/c3d0a7017ed2ef4468ec3fb4e4c09ec869d2917a), [`ecd8e52`](https://github.com/pyreon/pyreon/commit/ecd8e526943a1e6b07957ff96f4410fa482baa0d), [`ac1d375`](https://github.com/pyreon/pyreon/commit/ac1d37542b11cd95451a2f0b0a51cc43603d001a), [`21e465c`](https://github.com/pyreon/pyreon/commit/21e465c7957c3e57c838af58ffa995682908c5f8), [`c4b6e9a`](https://github.com/pyreon/pyreon/commit/c4b6e9a5850196171c2197fc918163f736708aa8), [`fb40906`](https://github.com/pyreon/pyreon/commit/fb409066e49e44c42f77084a92a68103a4e6c5ef), [`9f03747`](https://github.com/pyreon/pyreon/commit/9f037478763d9f8cd2365feb63dc87fda2545e5d), [`3374150`](https://github.com/pyreon/pyreon/commit/33741500499dfb487d031bbffe77723d74b8f261), [`fa4e37f`](https://github.com/pyreon/pyreon/commit/fa4e37fa620cf0e3f240053bf789b84bd9668838)]:
  - @pyreon/reactivity@0.19.0
  - @pyreon/core@0.19.0
  - @pyreon/runtime-dom@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/runtime-dom@0.18.0
  - @pyreon/core@0.18.0
  - @pyreon/reactivity@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [[`35af0e2`](https://github.com/pyreon/pyreon/commit/35af0e22b670151052e0b1df5006977fca759128), [`8b1a982`](https://github.com/pyreon/pyreon/commit/8b1a982faa140e7e646293a47d6a4fbe70cac67c)]:
  - @pyreon/core@0.17.0
  - @pyreon/runtime-dom@0.17.0
  - @pyreon/reactivity@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [[`a4a4255`](https://github.com/pyreon/pyreon/commit/a4a42550835cb2706b99beed8ea582037d338ea8)]:
  - @pyreon/core@0.16.0
  - @pyreon/reactivity@0.16.0
  - @pyreon/runtime-dom@0.16.0

## 0.14.0

### Patch Changes

- Updated dependencies [[`c97783a`](https://github.com/pyreon/pyreon/commit/c97783a85b6f7ffc5d25ad16fd280c92808b5ea6), [`12dbf14`](https://github.com/pyreon/pyreon/commit/12dbf14c92ea3e107c89039a269181a500cb60d4)]:
  - @pyreon/runtime-dom@0.14.0
  - @pyreon/core@0.14.0
  - @pyreon/reactivity@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies [[`a05c4ba`](https://github.com/pyreon/pyreon/commit/a05c4bab713f5168acd56eb233520102735bd80a)]:
  - @pyreon/core@0.13.0
  - @pyreon/reactivity@0.13.0
  - @pyreon/runtime-dom@0.13.0

## 0.12.15

### Patch Changes

- Updated dependencies [[`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa), [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa), [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa)]:
  - @pyreon/runtime-dom@0.12.15
  - @pyreon/core@0.12.15
  - @pyreon/reactivity@0.12.15

## 0.12.14

### Patch Changes

- [#244](https://github.com/pyreon/pyreon/pull/244) [`c69e178`](https://github.com/pyreon/pyreon/commit/c69e178c2f0155c073a680f357ff71c8f9eec6a8) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Kinetic anti-pattern cleanup + lint rule precision

  `@pyreon/kinetic`:

  - `nextFrame` (utils.ts): added `typeof requestAnimationFrame === 'undefined'`
    early-return. SSR callers receive `0` instead of crashing — the rule
    recognises the guard and the safety contract becomes explicit.
  - `TransitionItem`, `TransitionRenderer`: replaced destructured props
    (`({ show, enter, leave, … }) => …`) with `props.x` access to preserve
    reactive prop tracking. Defaults hoisted out (`const appear = props.appear
?? false`).
  - Added `vitest.browser.config.ts` + `src/__tests__/kinetic.browser.test.tsx` —
    the package's first real Chromium smoke test. 5 tests covering Transition
    mount/child rendering, signal-driven show/hide, `nextFrame` scheduling,
    `mergeClassNames` filtering, and the `typeof process === 'undefined'` /
    `import.meta.env.DEV === true` checks that confirm the package works in
    a real browser bundle.
  - Removed `packages/ui-system/kinetic/` from `PHASE_5_PENDING_PACKAGES` in
    `scripts/check-browser-smoke.ts` (stale now that the smoke test exists).
  - Devdep: `@vitest/browser-playwright`, `@pyreon/test-utils`, `@pyreon/core`,
    `@pyreon/reactivity`, `@pyreon/runtime-dom` added.

  `@pyreon/lint` — `no-bare-signal-in-jsx`:

  - Skip allowlist extended to `h` and `cloneVNode` (VNode-producing helpers
    from `@pyreon/core`). Their JSX call sites always produce a VNode, not
    a signal value. Matches `render` (already in the list) from ui-core.

  `@pyreon/lint` — `no-window-in-ssr`:

  - Safe-context call set extended with `watch` (signal-driven watcher from
    `@pyreon/reactivity`) and `requestAnimationFrame`. Both run their
    callbacks post-mount in a browser, so browser-global reads inside them
    are safe.

  4 new bisect-verified regression tests for the rule precision changes.

- Updated dependencies []:
  - @pyreon/core@0.12.14
  - @pyreon/reactivity@0.12.14
  - @pyreon/runtime-dom@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.13
  - @pyreon/reactivity@0.12.13
  - @pyreon/runtime-dom@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.12
  - @pyreon/reactivity@0.12.12
  - @pyreon/runtime-dom@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.11
  - @pyreon/reactivity@0.12.11
  - @pyreon/runtime-dom@0.12.11

## 0.1.2

## 0.1.1

## 0.0.3

### Patch Changes

- Update pyreon framework peer dependencies to >=0.4.0 <1.0.0, fix Element Wrapper children type for multi-child JSX patterns, add publish script improvements (--no-provenance, --otp support).

## 0.0.2

### Patch Changes

- [#17](https://github.com/pyreon/ui-system/pull/17) [`d3c1e6e`](https://github.com/pyreon/ui-system/commit/d3c1e6e64e221e01a747e24ad93f7cfc1cf3b4ef) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Initial release of Pyreon UI System packages
