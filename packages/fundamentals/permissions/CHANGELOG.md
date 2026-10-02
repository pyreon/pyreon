# @pyreon/permissions

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

- [#2790](https://github.com/pyreon/pyreon/pull/2790) [`ed6518a`](https://github.com/pyreon/pyreon/commit/ed6518a68ec678e546713abf4e2551a3297a794f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Co-locate native runtimes into their own packages.

  The Swift/Kotlin runtimes for form, store, state-tree, machine, i18n, permissions,
  and query move out of the `@pyreon/native-runtime-*` monolith into each package's
  `native/{swift,kotlin}/` (declared via the `pyreon.native` package.json field,
  aggregated by `pyreon-native wire`). Framework-base runtimes (reactivity/styling/JSON
  helpers) stay in the monolith. A new `scripts/check-native-cosource.ts` gate compiles
  and smoke-runs every co-located `.swift`/`.kt` against the stub harness so a relocated
  runtime can't rot silently. No API change — this is a source-location move.

- [#3056](https://github.com/pyreon/pyreon/pull/3056) [`07f0ac8`](https://github.com/pyreon/pyreon/commit/07f0ac84535bec7386db08d4ffedf83e4de5e6a0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `usePermissions(['posts.edit'])` works on the web, so a permission-gated screen can be written once

  The seeded form is what `@pyreon/native-compiler` lowers to — it becomes a
  `PyreonPermissions` seeded with the same literal keys, and the compiler's own
  diagnostics point authors at it. On the web that identical call threw
  `usePermissions() must be used within <PermissionsProvider>`, so a screen using
  it ran on iOS and Android and died in a browser.

  A seeded call is self-contained by definition: it says what it grants, so there
  is nothing for a provider to contribute. It now builds a local instance and
  needs no provider. The bare `usePermissions()` contract is unchanged — it still
  reads the nearest provider and still throws without one, and the message now
  names the seeded form as the other way out.

  Found by rendering a shared multi-target source in a real browser.

### Patch Changes

- [#2704](https://github.com/pyreon/pyreon/pull/2704) [`1d74edc`](https://github.com/pyreon/pyreon/commit/1d74edc1b85c22714b9ee4b86e8fa9228be2ca93) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Update external dependencies to latest across the workspace: tanstack query/virtual patches, tiptap 3.29.2, codemirror view 6.43.8, shiki 4.4.2, elkjs 0.12, yjs 13.6.32, MCP SDK 1.30, oxc 0.143, magic-string 1.1.0, pragmatic-drag-and-drop 2.0.2, and tooling (vite 8.2.0, playwright 1.62.1 — both previously held back by upstream bugs now fixed). `@pyreon/testing` widens its `@testing-library/jest-dom` peer to `^6.0.0 || ^7.0.0` (v7 verified). TypeScript stays capped `<7.0.0` (TS7 removed the classic Compiler API); `@tanstack/table-core` stays on v8 (v9 is a structural API rewrite that would break `@pyreon/table`'s public options surface — tracked as its own migration).

- [#2922](https://github.com/pyreon/pyreon/pull/2922) [`8aeffe0`](https://github.com/pyreon/pyreon/commit/8aeffe09bf62ea08af1278c45ecdaf26d1a04cb6) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Ship the MIT LICENSE file in the package tarball

  These eight published packages were missing a `LICENSE` file. The repo's
  own rule has always been that every package carries one ("Every package
  MUST have `LICENSE` (MIT) and `README.md` — no exceptions"), but nothing
  enforced it, so the gap went unnoticed.

  No runtime change. It matters anyway: consumers, vendoring tools and
  licence scanners read the file from the tarball, and its absence makes an
  MIT-licensed package look unlicensed at the point where that question is
  actually asked. A gate now keeps every workspace covered.

- [#2820](https://github.com/pyreon/pyreon/pull/2820) [`4be7791`](https://github.com/pyreon/pyreon/commit/4be7791afaf86864ce03a4548c30b295292e7833) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Native `.*` granted more than the web did

  `PyreonPermissions.can()` resolved a `"prefix.*"` grant with a bare prefix
  match on both platforms, so granting `"posts.*"` also granted
  `"posts.comments.edit"` — a key the web **denies**. A permission check that
  grants more on device than in the browser, from the same source, is the wrong
  direction to be wrong in. Neither runtime recognised `.**` or `*` at all, so
  the two wildcards that _should_ widen a grant were silently ignored.

  The two native runtimes agreed with each other and disagreed with the web:
  both were written from one belief about what `.*` means. `can()` now resolves
  in the web's order — exact, then one-segment `.*`, then recursive `.**`
  most-specific-ancestor-first, then global `*`.

  Measured three ways rather than mirrored: the web resolver via
  `native-parity.test.ts`, and both runtimes compiled and **run** against the
  same nine cases.

  ## The call site was inverted too

  Web `usePermissions()` takes no arguments — the grants come from
  `<PermissionsProvider>`, which has no native lowering. So the correct web call
  emitted an empty native set in which every check denies, silently: guarded
  views simply never appeared on device. The only way to get a non-empty native
  set is `usePermissions([...])`, a call the web API rejects.

  Seeding the provider natively is a larger arc. What changes here is the
  silence — the empty-set case now says so and names the shape that works, and
  the provider's own advice no longer tells an author already holding the hook
  to "use the hook instead", which changed nothing.

  Still web-only: predicate permissions (`(context) => boolean`) and explicit
  `false` values, both of which need a value-carrying granted set rather than
  the current `Set<String>`. The web arm pins them so the gap is visible.

  ## `<PermissionsProvider>` now lowers

  Web `usePermissions()` takes no arguments — the grants come from the provider
  above it, which had no native lowering. A literal
  `<PermissionsProvider permissions={{ 'posts.*': true }}>` now injects them
  into the SwiftUI environment / Compose `CompositionLocal` that a bare
  `usePermissions()` reads, so the web-correct call works unchanged instead of
  denying everything.

  The plumbing is emitted INLINE rather than shipped in the co-located runtime,
  for the reason `PyreonUrlState` already is: it needs SwiftUI's environment
  machinery / Compose's CompositionLocal, and a runtime that pulls those in
  stops being self-contained (and stops verifying against the compile gate's
  stub set).

  A NON-literal map (`permissions={fromServer}`) cannot be baked into the emit
  and declines from the emitter, which is the only layer that knows whether the
  injection happened — the blanket import warning is suppressed once the tag is
  present, so without this a provider that injects nothing would have gone
  silent.

  One more silent drop fixed on the way: an object literal with a STRING key
  (`{ 'posts.*': true }` — ordinary TS) was dropped by the parser with no field
  and no warning, unlike the computed-key case beside it which warns. String
  keys are now preserved.

- [#2817](https://github.com/pyreon/pyreon/pull/2817) [`c9f3c6c`](https://github.com/pyreon/pyreon/commit/c9f3c6c832167f72aafe54daa2ba6b6c58f9d666) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(permissions): predicate evaluation is fail-CLOSED — only an explicit `true` grants

  `evaluate()` returned the raw predicate result, so a predicate that returned a truthy NON-boolean granted access it should deny. A predicate is typed `(context?) => boolean`, but a body reading an `any`-typed context (`(u: any) => u.permissions.edit`) returns `any` with no type error — so at runtime it could yield a truthy string/number/object, or (worst) a `Promise`, which is ALWAYS truthy, so an accidentally-async predicate ALWAYS granted. `can()` now returns `true` only when the predicate returns exactly `true` (matching the fail-closed posture the throw path already uses). A genuine `false` deny and all boolean predicates are unchanged. Bisect-verified.

- [#3750](https://github.com/pyreon/pyreon/pull/3750) [`5f5bedf`](https://github.com/pyreon/pyreon/commit/5f5bedf81133dc6128486b083cdf59b8496c7c29) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Native `usePermissions()` with no `<PermissionsProvider>` above it now warns once per process instead of silently denying every check. The SwiftUI environment default and the Compose CompositionLocal default are a distinguished deny-all instance (`isUnprovidedFallback`); the first `can()` against it prints a warning naming the missing provider (Swift: `#if DEBUG` only; Kotlin: once via `System.err`, since a library cannot read the host app's `BuildConfig`). An explicit `usePermissions([])` is unchanged and never warns. Web already threw on a missing provider. Validation stubs mirrored.

- [#3750](https://github.com/pyreon/pyreon/pull/3750) [`5f5bedf`](https://github.com/pyreon/pyreon/commit/5f5bedf81133dc6128486b083cdf59b8496c7c29) Thanks [@vitbokisch](https://github.com/vitbokisch)! - PMTC no longer emits per-file helper declarations that collide when two files share a Swift module or Kotlin package. `PyreonUrlState`, the number-string helper and the permissions environment key/CompositionLocal moved into the runtimes (stubs mirrored, parity-tested); synthesized `__ObjN` structs carry a per-module suffix. A `<PermissionsProvider>` with no readers in its file now compiles, and a bare `usePermissions()` no longer warns per file since the provider is app-wide.

- [#3557](https://github.com/pyreon/pyreon/pull/3557) [`5c60743`](https://github.com/pyreon/pyreon/commit/5c60743c32bac8c46279fccacc5a51126b183832) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Stop publishing the build's bundle-analysis report.

  `vl_rolldown_build` writes an HTML treemap per entry into `lib/analysis/`, and
  54 packages published it: every install downloaded a build report (258 KB for
  `@pyreon/charts`) that is not part of the package. Their `files` now exclude
  `lib/analysis`, as ten packages already did. `pyreon doctor`'s distribution
  gate enforces it twice: a `vl_rolldown_build` package that publishes `lib`
  must exclude the report, and the live `npm pack --dry-run` probe fails if the
  tarball carries one.

- Updated dependencies [[`2ac084f`](https://github.com/pyreon/pyreon/commit/2ac084f5c3c762902e38004b3787f806d155d338), [`d5f19b9`](https://github.com/pyreon/pyreon/commit/d5f19b9700962305b1cc4fd0e5da603ec884e759), [`8563e97`](https://github.com/pyreon/pyreon/commit/8563e97ee5fd91daa6d74547c712ae6b71cffb47), [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d), [`9045709`](https://github.com/pyreon/pyreon/commit/9045709020995c37692eb2a9a6ecd65f6b8c6e30), [`57b94ed`](https://github.com/pyreon/pyreon/commit/57b94ed8cd4b2aa9d5bd16e52d39edcdb7056c62), [`1c70f68`](https://github.com/pyreon/pyreon/commit/1c70f68b69a7e9f60eb7d565bf8797a155353743), [`99a1888`](https://github.com/pyreon/pyreon/commit/99a188821c005c4750c3daf98fd2d0863a0e3b58), [`e56abb6`](https://github.com/pyreon/pyreon/commit/e56abb6b44873164473b085e0e64838e7d9e7012), [`9f02726`](https://github.com/pyreon/pyreon/commit/9f0272677bd083fb50998335257e31e44766e85d), [`cc455e8`](https://github.com/pyreon/pyreon/commit/cc455e84d9ed7d682d963d44b25cd3c4bb89c7c8), [`6a7c0f1`](https://github.com/pyreon/pyreon/commit/6a7c0f1bb21f285fce47fe67492ce9a14c20fd6a), [`cf50c79`](https://github.com/pyreon/pyreon/commit/cf50c79668fa46510df17f76906520c53d6e0e4a), [`f2194d5`](https://github.com/pyreon/pyreon/commit/f2194d544ca7fc10dcc64b2aeb1c97dc923eabfe), [`e6b70a5`](https://github.com/pyreon/pyreon/commit/e6b70a5c80ed7c9f338a6a750296ebe89e9dd9c2), [`cbd6459`](https://github.com/pyreon/pyreon/commit/cbd6459970423b7f7d94883685ae7c753895f1d9), [`ea4e50a`](https://github.com/pyreon/pyreon/commit/ea4e50ab7d97d84f2bd5518ea747280c34805611), [`c8c47f7`](https://github.com/pyreon/pyreon/commit/c8c47f7c1b1853c4fde3247d5d7618cab03b6c4f), [`d114ff8`](https://github.com/pyreon/pyreon/commit/d114ff8c83ac98acb0c421d0ee3217e43d4d713b), [`50d9324`](https://github.com/pyreon/pyreon/commit/50d93245d8e28ba0a3c8217bd83a50d3dd6719d3), [`317367a`](https://github.com/pyreon/pyreon/commit/317367a9ade57b9aefd036441ebb397c8e3d1dc2), [`5c5e246`](https://github.com/pyreon/pyreon/commit/5c5e246832453a94e5ce112d11c9109d800d2889), [`384cb23`](https://github.com/pyreon/pyreon/commit/384cb23669ef897b74206c9441b8982a71729367), [`4f75a72`](https://github.com/pyreon/pyreon/commit/4f75a72ebbc4223a88d9ffc2ce950d962aa973a4), [`773f9df`](https://github.com/pyreon/pyreon/commit/773f9dfaafaed05a06b252b1f83a0f7d970dbb8d), [`3dba9dc`](https://github.com/pyreon/pyreon/commit/3dba9dceec5dc96c34686b70604b6d79939655a2), [`d98b60d`](https://github.com/pyreon/pyreon/commit/d98b60d48ec42e1cf4cc6f22e20262000384676a), [`e44dcc7`](https://github.com/pyreon/pyreon/commit/e44dcc7124a5617f95ddb69786be262a35280d5f), [`768f104`](https://github.com/pyreon/pyreon/commit/768f104018ced7568dde1c99990a21c273e924ec), [`87b581a`](https://github.com/pyreon/pyreon/commit/87b581a6a28433116c9a6c8364fbb8e3cab15760), [`9593fbc`](https://github.com/pyreon/pyreon/commit/9593fbc44375cc00f57865790a798bd53e479551), [`24c4019`](https://github.com/pyreon/pyreon/commit/24c4019d3e2527bf063d65d62bf574b00965d1e4), [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d), [`d0e57b2`](https://github.com/pyreon/pyreon/commit/d0e57b27ccbf9b4b90521235186a003f3d6bc3ca), [`fabd888`](https://github.com/pyreon/pyreon/commit/fabd888ac865155a5af687f1706bf918c6419f19), [`5c60743`](https://github.com/pyreon/pyreon/commit/5c60743c32bac8c46279fccacc5a51126b183832), [`5438e9a`](https://github.com/pyreon/pyreon/commit/5438e9a7496e4c6e5dac43bc03ab90459d147a59), [`5af143d`](https://github.com/pyreon/pyreon/commit/5af143d746be81a4a0d688243f123d532c455553), [`2bef24d`](https://github.com/pyreon/pyreon/commit/2bef24df3d5c86d709509906d4d1e831357b41c6), [`f4e9268`](https://github.com/pyreon/pyreon/commit/f4e9268a750318ceb5f7d2dc40c185a53e6b5299), [`c26fcef`](https://github.com/pyreon/pyreon/commit/c26fcef861ec794ca7f0e0b2163d84f7b58c0866), [`127e5d6`](https://github.com/pyreon/pyreon/commit/127e5d65cd2a3cea8457a1bd6f397b75c0ad4597), [`50caf2d`](https://github.com/pyreon/pyreon/commit/50caf2d3f97fefa7afa6105e38c7f5940c427b5d), [`c7feb0b`](https://github.com/pyreon/pyreon/commit/c7feb0b726ea78ef7b6a4d3a17e8ae85df471a67)]:
  - @pyreon/core@0.52.0
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

- [#2369](https://github.com/pyreon/pyreon/pull/2369) [`9b5cb93`](https://github.com/pyreon/pyreon/commit/9b5cb9312fc46ddeaede34df600e63ef4ce16023) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Whole-class bundle-size fix: every module-level `nativeCompat(X)` STATEMENT (28 sites across 16 packages) converted to the `/* @__PURE__ */` assignment form. Inside a built lib's shared chunk the bare statement is an unremovable side effect that retains the component's body in every consumer bundle that never imports it — measured ~1.2KB gz of dead transition machinery in a mount-only app from runtime-dom's three sites alone; the sweep applies the same fix to ErrorBoundary, HeadProvider, Router components, RouteAnnouncer, Form components, providers across i18n/permissions/query (6 sites)/toast's Toaster, and the ui-system providers. Marker semantics are unchanged (`nativeCompat` returns the same fn; live-probed and locked by the existing native-marker suites). Two new locks: a lib-level tree-shake spec (mount-only bundle must not contain transition machinery, with a positive control) and a repo-wide census guard that fails on any new bare statement.

- Updated dependencies [[`a333656`](https://github.com/pyreon/pyreon/commit/a333656ac79c7a43163b0a07f593aa71a59e124d), [`3f1120a`](https://github.com/pyreon/pyreon/commit/3f1120aaa5ee69b85f5de56681a655ba30bf0f67), [`9b5cb93`](https://github.com/pyreon/pyreon/commit/9b5cb9312fc46ddeaede34df600e63ef4ce16023), [`1fa3347`](https://github.com/pyreon/pyreon/commit/1fa33473514e64ebc07e3e75ad818fe1a9f89245)]:
  - @pyreon/reactivity@0.48.0
  - @pyreon/core@0.48.0

## 0.47.0

### Patch Changes

- Updated dependencies [[`9799d6b`](https://github.com/pyreon/pyreon/commit/9799d6bfa1c3f99fa38f4375eebd330c2df0a715)]:
  - @pyreon/core@0.47.0
  - @pyreon/reactivity@0.47.0

## 0.46.0

### Patch Changes

- Updated dependencies [[`75a49be`](https://github.com/pyreon/pyreon/commit/75a49befac42202c8237911aa4b111efbbfb1a61), [`cc5250d`](https://github.com/pyreon/pyreon/commit/cc5250d4022638286a0bf89facffb5a585fe2a18), [`19c1ce1`](https://github.com/pyreon/pyreon/commit/19c1ce12a54305ac875d1b19682ecf084addc607), [`f67f3fe`](https://github.com/pyreon/pyreon/commit/f67f3fe451f0aeeb74a024501d30f593ce50b7ff), [`d93e7d3`](https://github.com/pyreon/pyreon/commit/d93e7d3f9a4d679b25a3fc646d99673c2fe276c5), [`3124522`](https://github.com/pyreon/pyreon/commit/31245225c087922575846fa644f93523ff6e1435)]:
  - @pyreon/reactivity@0.46.0
  - @pyreon/core@0.46.0

## 0.45.0

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

- [#1889](https://github.com/pyreon/pyreon/pull/1889) [`fc6057e`](https://github.com/pyreon/pyreon/commit/fc6057e2a7c26a76b2ccc56f0732783be5835e1d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - perf: pre-partitioned resolver index + per-key resolve memo. `resolve()` (run on every `can()` check) previously built candidate-key strings per check (`` `${parent}.*` ``, `` `${ancestor}.**` ``) while walking the most-specific-first fallback chain, so a deny/wildcard check cost ~5–7× a single exact lookup. Two layers now: (1) `createPermissions` keeps a derived index that pre-partitions keys into exact / `prefix.*` / `prefix.**` / `*` sub-maps (rebuilt on `set()`/`clear()`, incrementally on `patch()`) — direct prefix lookups, no per-check string allocation, early-out to one `Map.get` when the map has no wildcards; (2) a per-key `key→boolean` memo over `resolve` for the static-map / no-context case (the common repeated-check pattern), cleared on every `set()`/`patch()`/`clear()` and bypassed for predicate maps + context-bearing checks. Output is byte-identical (most-specific-first deny-override preserved; all 160 tests pass, incl. a dedicated memo-invalidation suite). Measured (Apple M3, median ns/op): Pyreon now faster than CASL on every benched op — exact-allow ~2.8×, deny ~2× (was ~5× slower), wildcard ~2.4× (was ~6–7× slower), multi-check ~2.5×. Surfaced + driven by the `bench:casl` objective benchmark.

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

### Minor Changes

- [#1701](https://github.com/pyreon/pyreon/pull/1701) [`41bd706`](https://github.com/pyreon/pyreon/commit/41bd706fe1ca57eb6b59682661e50a7c69fa386f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - API polish pass (breaking, pre-1.0 — clean over backward-compatible):

  - **`PermissionsProvider` prop renamed `instance` → `value`** — fixes a real code/docs mismatch: the component took `instance`, but the generated docs / llms / MCP always documented `value` (and it's the conventional context-provider prop). Anyone following the docs (`<PermissionsProvider value={can}>`) was silently getting `undefined` → `usePermissions()` threw. The code now matches the documented, conventional name. **Breaking** for any code that passed `instance`.
  - **`can.assert(key, context?, message?)`** — optional custom denial message: `can.assert('billing.export', undefined, 'Upgrade your plan to export')` throws `[Pyreon] Upgrade your plan to export` instead of the default `[Pyreon] permission denied: 'billing.export'`.
  - Drive-by: the `usePermissions()` out-of-provider error now uses the enforced `[Pyreon]` prefix (was `[@pyreon/permissions]`, a baselined `no-error-without-prefix` violation) — burns the pyreon-lint advisory baseline down 283 → 282.

  Tests: the provider-prop tests + the error-message assertion were updated to the new names; +1 `can.assert` custom-message test. 153 tests pass; coverage above the 98% floor.

- [#1695](https://github.com/pyreon/pyreon/pull/1695) [`25363e7`](https://github.com/pyreon/pyreon/commit/25363e7ac6e7424c1c43d1414e8c455173c5ac05) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fill the genuine gaps in the flat-key reactive permissions model vs CASL (staying in the predicate idiom — not adopting CASL's action/subject/condition DSL):

  - **Recursive subtree wildcard `prefix.**`** — `'posts.**'`matches any key at any depth below`posts` (`posts.read`, `posts.a.b.c`), where `'posts._'`matches only ONE segment. Resolution is now most-specific-first (exact →`parent._`→ nearest-ancestor`**`→ global`_`), so an exact or `**` deny overrides a broader subtree grant (`'posts.**': true`+`'posts.admin.\*\*': false`grants posts but denies the admin subtree — the CASL`cannot`-over-`can`shape). Non-breaking:`'_'`stays recursive-everything and`'prefix.\*'`stays one-segment;`\*\*` is the new primitive.
  - **`can.assert(key, context?)`** — throw-on-deny (`[Pyreon] permission denied: '<key>'`) for route loaders, navigation guards, and server actions; evaluates predicates + wildcards exactly like `can()`. The imperative companion to the reactive `can()` (CASL `ForbiddenError` parity).
  - **`can.clear()`** — wipe all permissions reactively (e.g. on logout); equivalent to `can.set({})`.

  Out of scope (the predicate model deliberately replaces): MongoDB-style condition matching → predicates; rule packing/serialization + subject-type detection → N/A for the flat-string-key model; async checks → resolve into a signal the predicate reads.

  Backward-compatible: all pre-existing tests pass unchanged.

### Patch Changes

- Updated dependencies [[`1f29c4b`](https://github.com/pyreon/pyreon/commit/1f29c4b9791e6ad96901ca0e2b90e5335b803895), [`02b77ae`](https://github.com/pyreon/pyreon/commit/02b77aed6b4383554b3458e408b462098fc3e708), [`35d440a`](https://github.com/pyreon/pyreon/commit/35d440a44d92ac913cf19f3f8e21b4603458a165)]:
  - @pyreon/core@0.35.0
  - @pyreon/reactivity@0.35.0

## 0.34.0

### Patch Changes

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
