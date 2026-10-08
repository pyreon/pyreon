# @pyreon/sized-map

## 0.53.0

### Minor Changes

- [#3854](https://github.com/pyreon/pyreon/pull/3854) [`b0d6ac0`](https://github.com/pyreon/pyreon/commit/b0d6ac0c32c0b678d97144f43e750683bf1225ae) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Native lowering for permissions, storage, url-state, sized-map, kinetic, elements, coolgrid, rx, feature and `useFetch` moves out of the compiler into package-owned plugins, and `@pyreon/hooks` is discovered like every other library: the compiler no longer carries a generated copy of the hooks service table, ships no built-in plugin, and `SERVICES` / `BUILT_IN_SERVICE_OWNER` are removed. A bare `transform()` / `createCompiler()` with no plugins now lowers only the core's own contract; a plugin package that fails to load is a hard error (the CLI's built-in fallback is gone) and `pyreon-native plugins` no longer prints a built-in section. New library-agnostic plugin members: `declCalls` (with `{ computed }` / `{ signal }` verdicts), `tier2Calls`, `persistence`, `rewriteElement`, `DeclEmitter.typing.member`, `ExprEmitter.reduce`, `typing.type(e, infer)`, and the `declarations` item slot. `@pyreon/native-compiler` is an optional peer of each plugin-bearing package.

### Patch Changes

- Updated dependencies [[`c933f92`](https://github.com/pyreon/pyreon/commit/c933f92e20104aba2807e229f03b9f0530135cb3), [`4d3fae3`](https://github.com/pyreon/pyreon/commit/4d3fae39e62d0fe71392990b878f2d94686a1c5f), [`068310d`](https://github.com/pyreon/pyreon/commit/068310dd9bd78663945348f579a7f5fd082c6944), [`c253ae2`](https://github.com/pyreon/pyreon/commit/c253ae23978b06904768d171f3eb7e2b7114e273), [`4d3fae3`](https://github.com/pyreon/pyreon/commit/4d3fae39e62d0fe71392990b878f2d94686a1c5f), [`87879d0`](https://github.com/pyreon/pyreon/commit/87879d0a04b5e221482693596cff0f7352c1e3ed), [`4b207a7`](https://github.com/pyreon/pyreon/commit/4b207a7c56938fc326b79dae1d381b7af53c8681), [`792e27e`](https://github.com/pyreon/pyreon/commit/792e27ef09c9b3dcc88c85a7ab6d969f60388848), [`0c95de5`](https://github.com/pyreon/pyreon/commit/0c95de5911873d56543a28acc0bb23e0ad5b299c), [`6df4450`](https://github.com/pyreon/pyreon/commit/6df4450bb57c834997796f8f37c59bae3e743d74), [`9fed8dc`](https://github.com/pyreon/pyreon/commit/9fed8dc5982d850bf09a0d0afa95b6d0fc7e8bae), [`1ce711d`](https://github.com/pyreon/pyreon/commit/1ce711d63e715110f614fcc423530eb13ceee43a), [`f7b64d9`](https://github.com/pyreon/pyreon/commit/f7b64d9164eb34d202e3d84b0c729a8d6918a359), [`3ec86b7`](https://github.com/pyreon/pyreon/commit/3ec86b7d4fce4c2c2c19ae233e5387d112b97a9a), [`4d3fae3`](https://github.com/pyreon/pyreon/commit/4d3fae39e62d0fe71392990b878f2d94686a1c5f), [`09839d5`](https://github.com/pyreon/pyreon/commit/09839d56f631df1743319211cd2c821c2f259990), [`a110468`](https://github.com/pyreon/pyreon/commit/a1104680b3cf44b9d062ee4906b76a3ff09b2634), [`b0d6ac0`](https://github.com/pyreon/pyreon/commit/b0d6ac0c32c0b678d97144f43e750683bf1225ae), [`cf21221`](https://github.com/pyreon/pyreon/commit/cf21221e4249823a8fd04be8601168817045f6eb), [`0c95de5`](https://github.com/pyreon/pyreon/commit/0c95de5911873d56543a28acc0bb23e0ad5b299c), [`09839d5`](https://github.com/pyreon/pyreon/commit/09839d56f631df1743319211cd2c821c2f259990), [`ed1e29d`](https://github.com/pyreon/pyreon/commit/ed1e29d20c98d7c6ae2c062c10aa73174afa35c3), [`9b84418`](https://github.com/pyreon/pyreon/commit/9b844189403ed062150edff9999d2cae7838f430), [`3de1c68`](https://github.com/pyreon/pyreon/commit/3de1c68b460f1f83deb9988192dfa4000ffb25b0)]:
  - @pyreon/native-compiler@0.53.0

## 0.52.0

### Minor Changes

- [#3755](https://github.com/pyreon/pyreon/pull/3755) [`489cba8`](https://github.com/pyreon/pyreon/commit/489cba8f7bb308ca26d27607a0c14c6dfa42da50) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Finish the Kotlin `Int` to `Long` move for the runtime APIs emitted code reaches. `PyreonToast.maxToasts`, `PyreonSortable.moveIndex`, `PyreonRateLimit` delays and scheduler, `PyreonSizedMap` (`maxEntries`, `size`), `PyreonScreenOrientation.angle`, `PyreonStream` (`maxEvents`, reconnect `attempts`) and the chart web-view selection indices now use `Long`, and the emit adds the `L` suffix to the literals it passes them. `PyreonChartPoints` takes `Long` counts, which fixes a real `gradle assembleDebug` failure in every chart-bearing Android example. `syncedSignal` and `PyreonCrdtMap.set` now accept `Long` (a `Long` signal previously threw `unsupported value type`).

- [#2805](https://github.com/pyreon/pyreon/pull/2805) [`5b93f4c`](https://github.com/pyreon/pyreon/commit/5b93f4cb70a6e210325aca3c79678b62383bc773) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Co-locate a native runtime for `@pyreon/sized-map`, and lower its constructor

  `@pyreon/sized-map` is 102 lines of pure logic with no platform edge, and it did
  not work natively at all: `new SizedMap(...)` fell through to the generic "class
  constructors are not supported" path and emitted `let m = ""` — an empty STRING
  where a bounded map was expected.

  It now ships `native/{swift,kotlin}/PyreonSizedMap` and
  `new SizedMap<K, V>({ maxEntries, lru })` lowers to it on both targets, so the
  tier moves from `web-only` to `shared`.

  The ordering is the whole of the work. JavaScript's `Map` preserves insertion
  order, so the web gets eviction for free from `map.keys().next()`. Kotlin's
  `LinkedHashMap` does too and mirrors it almost line for line; Swift's
  `Dictionary` is explicitly UNORDERED, so the Swift runtime carries the recency
  order in a parallel array — O(n) per touch against the web's O(1), which is a
  deliberate trade for a structure whose cap is small by construction, and is
  stated in the file rather than left to be discovered.

  Three semantics are easy to get wrong and are asserted one-for-one on both
  platforms: FIFO is the DEFAULT (a read does not rescue an entry from eviction),
  LRU is opt-in, and `set` ALWAYS refreshes position in BOTH modes — otherwise a
  just-written entry is evicted on the very next call.

  The constructor recognizer gates on the IMPORT, not the bare name: `SizedMap` is
  a plausible name for a user's own class. A non-literal `maxEntries` declines
  with a reason rather than baking in a wrong constant.

### Patch Changes

- [#3557](https://github.com/pyreon/pyreon/pull/3557) [`5c60743`](https://github.com/pyreon/pyreon/commit/5c60743c32bac8c46279fccacc5a51126b183832) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Stop publishing the build's bundle-analysis report.

  `vl_rolldown_build` writes an HTML treemap per entry into `lib/analysis/`, and
  54 packages published it: every install downloaded a build report (258 KB for
  `@pyreon/charts`) that is not part of the package. Their `files` now exclude
  `lib/analysis`, as ten packages already did. `pyreon doctor`'s distribution
  gate enforces it twice: a `vl_rolldown_build` package that publishes `lib`
  must exclude the report, and the live `npm pack --dry-run` probe fails if the
  tarball carries one.

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

## 0.50.0

## 0.49.0

## 0.48.0

## 0.47.0

## 0.46.0

## 0.45.0

## 0.44.0

## 0.43.1

## 0.43.0

## 0.42.0

## 0.41.2

## 0.41.1

## 0.41.0

## 0.40.0

## 0.39.0

### Patch Changes

- [#2019](https://github.com/pyreon/pyreon/pull/2019) [`a401811`](https://github.com/pyreon/pyreon/commit/a40181170cad2c71efa66244aa9306b4b3f8527f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Manifest completion — the final 8 real-API packages join the manifest-driven docs pipeline (llms.txt / llms-full.txt / MCP api-reference now cover them; each ships a bisect-locked manifest-snapshot test). Several stale README claims found during the source-grounded migration were corrected in the same pass.

## 0.38.0

## 0.37.1

## 0.37.0

## 0.36.0

## 0.35.0

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

## 0.33.0

## 0.32.0

## 0.31.0

## 0.30.0

## 0.29.0

## 0.28.1

### Patch Changes

- [#1225](https://github.com/pyreon/pyreon/pull/1225) [`a448ff4`](https://github.com/pyreon/pyreon/commit/a448ff4fa5b5627622be0fcd7fbe65b5f8c51991) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix coverage measurement gap. The package's logic lives entirely in `src/index.ts`; the `@pyreon/vitest-config` default excludes `src/**/index.ts`, so the package was reporting 0% coverage despite having a comprehensive test suite. Set `includeIndexInCoverage: true` — coverage now reports the true 100% statements / 90% branches.

## 0.28.0

### Patch Changes

- [#1194](https://github.com/pyreon/pyreon/pull/1194) [`1aeb610`](https://github.com/pyreon/pyreon/commit/1aeb610a10ce5069b52b2882a6175a16c16483b3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - chore: move @pyreon/sized-map to packages/core/ + enrich mcp/feature/storage manifests

  **@pyreon/sized-map** — package moved from `packages/internals/` to `packages/core/`
  alongside the other foundational primitives every Pyreon package depends on. The
  package is now published to npm at 0.27.1 with OIDC trusted publishing, so the
  "internal-by-convention" location no longer fits. Updated:

  - `repository.directory` in package.json → `packages/core/sized-map`
  - `bun.lock` workspace dep entry rewritten

  Zero source/runtime changes — every consumer imports `@pyreon/sized-map` by package
  name, never by path. This is a path-only repackage; the published artifact is
  byte-identical.

  **@pyreon/feature** — manifest enriched from 2 → 5 api[] entries:

  - Added `isReference`, `extractFields`, `defaultInitialValues` (helpers exported
    from the package but not in the MCP `get_api` surface before this PR)
  - Added `mistakes[]` to the existing `reference()` entry

  `get_api({ package: 'feature', symbol: 'extractFields' })` now returns a real
  entry instead of 404. No runtime change.

  **@pyreon/mcp** — manifest enriched: 9 of 14 tool entries lacked `mistakes[]`.
  Added foot-gun catalogs for `get_api`, `validate`, `migrate_react`, `get_routes`,
  `get_components`, `get_pattern`, `get_changelog`, `audit_test_environment`,
  `audit_islands`. All 14 tools now have 3-4 documented mistakes grounded in real
  failure modes. No runtime change.

  **@pyreon/storage** — manifest enriched from 4 → 7 api[] entries:

  - Added `useSessionStorage`, `useMemoryStorage`, `setCookieSource` (helpers exported
    but not in the MCP `get_api` surface before this PR)
  - Added `mistakes[]` to existing `useCookie`, `useIndexedDB`, `createStorage`
    entries (e.g. cookie maxAge unit traps, IDB async-init flash-of-default, custom
    backend `undefined` vs `null` return contract)

  No runtime change.

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
