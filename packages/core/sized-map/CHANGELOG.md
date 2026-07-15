# @pyreon/sized-map

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
