# @pyreon/feature

## 0.37.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.37.0
  - @pyreon/reactivity@0.37.0
  - @pyreon/form@0.37.0
  - @pyreon/query@0.37.0
  - @pyreon/store@0.37.0
  - @pyreon/table@0.37.0
  - @pyreon/validation@0.37.0

## 0.36.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.36.0
  - @pyreon/core@0.36.0
  - @pyreon/reactivity@0.36.0
  - @pyreon/query@0.36.0
  - @pyreon/store@0.36.0
  - @pyreon/table@0.36.0
  - @pyreon/validation@0.36.0

## 0.35.0

### Patch Changes

- [#1670](https://github.com/pyreon/pyreon/pull/1670) [`80b404b`](https://github.com/pyreon/pyreon/commit/80b404b956c698510dccfaddf4afe1266672f5bd) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(feature): guard edit-mode auto-fetch against write-after-unmount. `useForm({ mode: 'edit', id })` could resolve its `getById` fetch after the component unmounted and write the server data into a disposed form (the stale-promise class). An `onUnmount` cancellation flag now skips both settle branches after unmount.

- Updated dependencies [[`1f29c4b`](https://github.com/pyreon/pyreon/commit/1f29c4b9791e6ad96901ca0e2b90e5335b803895), [`ce49268`](https://github.com/pyreon/pyreon/commit/ce49268f21615478fe5544ce5ab385b74704c75d), [`bf6865c`](https://github.com/pyreon/pyreon/commit/bf6865c815e2ee4499995f9aba91591fa26a86f3), [`ac75935`](https://github.com/pyreon/pyreon/commit/ac7593520f4467cd7ba362178ee00ca7029794da), [`02b77ae`](https://github.com/pyreon/pyreon/commit/02b77aed6b4383554b3458e408b462098fc3e708), [`35d440a`](https://github.com/pyreon/pyreon/commit/35d440a44d92ac913cf19f3f8e21b4603458a165), [`86424f9`](https://github.com/pyreon/pyreon/commit/86424f9ce9f52dfa978da28c8d16322fd302e977), [`87e8f97`](https://github.com/pyreon/pyreon/commit/87e8f97143c03a83add6bc6db3e23fbbac5aaab1)]:
  - @pyreon/form@0.35.0
  - @pyreon/core@0.35.0
  - @pyreon/query@0.35.0
  - @pyreon/validation@0.35.0
  - @pyreon/table@0.35.0
  - @pyreon/reactivity@0.35.0
  - @pyreon/store@0.35.0

## 0.34.0

### Patch Changes

- Updated dependencies [[`66d44c5`](https://github.com/pyreon/pyreon/commit/66d44c58920bf81848e9ba858c413a88727a3c65), [`038a58c`](https://github.com/pyreon/pyreon/commit/038a58c0f39a35ad4338f6d2596c33c47e4e30cc)]:
  - @pyreon/reactivity@0.34.0
  - @pyreon/core@0.34.0
  - @pyreon/validation@0.34.0
  - @pyreon/form@0.34.0
  - @pyreon/table@0.34.0
  - @pyreon/query@0.34.0
  - @pyreon/store@0.34.0

## 0.33.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/form@0.33.0
  - @pyreon/query@0.33.0
  - @pyreon/store@0.33.0
  - @pyreon/table@0.33.0
  - @pyreon/validation@0.33.0

## 0.32.0

### Patch Changes

- Updated dependencies [[`0e38332`](https://github.com/pyreon/pyreon/commit/0e3833212e93ec90994edfccb5f2966f9eb0e926), [`0c1ea1e`](https://github.com/pyreon/pyreon/commit/0c1ea1e89e4228e84367efd5d2cb334808955a25), [`e36bbe5`](https://github.com/pyreon/pyreon/commit/e36bbe52e7f1417a703b4e6ce23281c448d9132f), [`65ccdf2`](https://github.com/pyreon/pyreon/commit/65ccdf2ad95a16b676b58948acea51f957e5cf62), [`52bcecd`](https://github.com/pyreon/pyreon/commit/52bcecde43f58a48c3e1d3d0fd0b61d9e1956da9), [`7f89196`](https://github.com/pyreon/pyreon/commit/7f89196dd3d99f61b0bba032481b9d389fdd8264), [`48dd5e4`](https://github.com/pyreon/pyreon/commit/48dd5e4d2264f27a7fd39b796d4d518f05ef4043)]:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/query@0.33.0
  - @pyreon/store@0.33.0
  - @pyreon/form@0.33.0
  - @pyreon/table@0.33.0
  - @pyreon/validation@0.33.0

## 0.31.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/form@0.33.0
  - @pyreon/query@0.33.0
  - @pyreon/store@0.33.0
  - @pyreon/table@0.33.0
  - @pyreon/validation@0.33.0

## 0.30.0

### Patch Changes

- Updated dependencies [[`6feb9d4`](https://github.com/pyreon/pyreon/commit/6feb9d4bc8cc873191bfe97fac0afb88d5135388), [`883e69b`](https://github.com/pyreon/pyreon/commit/883e69baed47d77eb79f4dd09b87da96a0b52894), [`4efa71b`](https://github.com/pyreon/pyreon/commit/4efa71b83af84b9310681ed213a331842248bb65), [`960bb0f`](https://github.com/pyreon/pyreon/commit/960bb0f139839de49508d836878b98556b1c7d07), [`b720267`](https://github.com/pyreon/pyreon/commit/b720267f0d9fbe260398c56d49834dc1dd2b09fb)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0
  - @pyreon/form@0.33.0
  - @pyreon/query@0.33.0
  - @pyreon/store@0.33.0
  - @pyreon/table@0.33.0
  - @pyreon/validation@0.33.0

## 0.29.0

### Patch Changes

- Updated dependencies [[`c54ce0f`](https://github.com/pyreon/pyreon/commit/c54ce0f284dab0335d9b597488ba75c6dea92b43), [`6d3e085`](https://github.com/pyreon/pyreon/commit/6d3e085183ec42883a842967afe22f806f0ea21d), [`c2874df`](https://github.com/pyreon/pyreon/commit/c2874df8f2b07b19aaa7a64c2f9ff2ab6b11d2f0), [`e1139cc`](https://github.com/pyreon/pyreon/commit/e1139cc20447860a2c0e547e6fc0ed67f359e1fe)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0
  - @pyreon/form@0.33.0
  - @pyreon/store@0.33.0
  - @pyreon/query@0.33.0
  - @pyreon/table@0.33.0
  - @pyreon/validation@0.33.0

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

- Updated dependencies [[`63bdb95`](https://github.com/pyreon/pyreon/commit/63bdb956b9d1ac5db779672f0cd7314de672fac9), [`9be0265`](https://github.com/pyreon/pyreon/commit/9be0265553ff756383b21f9c0ab556949d7cadb0)]:
  - @pyreon/store@0.28.1
  - @pyreon/form@0.28.1
  - @pyreon/query@0.28.1
  - @pyreon/table@0.28.1
  - @pyreon/validation@0.28.1

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

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/form@0.33.0
  - @pyreon/query@0.33.0
  - @pyreon/store@0.33.0
  - @pyreon/table@0.33.0
  - @pyreon/validation@0.33.0

## 0.27.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.27.1
  - @pyreon/query@0.27.1
  - @pyreon/store@0.27.1
  - @pyreon/table@0.27.1
  - @pyreon/validation@0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/form@0.33.0
  - @pyreon/query@0.33.0
  - @pyreon/store@0.33.0
  - @pyreon/table@0.33.0
  - @pyreon/validation@0.33.0

## 0.26.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.26.3
  - @pyreon/query@0.26.3
  - @pyreon/store@0.26.3
  - @pyreon/table@0.26.3
  - @pyreon/validation@0.26.3

## 0.26.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.26.2
  - @pyreon/query@0.26.2
  - @pyreon/store@0.26.2
  - @pyreon/table@0.26.2
  - @pyreon/validation@0.26.2

## 0.26.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.26.1
  - @pyreon/query@0.26.1
  - @pyreon/store@0.26.1
  - @pyreon/table@0.26.1
  - @pyreon/validation@0.26.1

## 0.26.0

### Patch Changes

- [#960](https://github.com/pyreon/pyreon/pull/960) [`8333f05`](https://github.com/pyreon/pyreon/commit/8333f05e3a2b3d8b31cd03c3d835a4234a6e689c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix 4 more framework DX walls surfaced by deep-audit of the HN-clone ([#942](https://github.com/pyreon/pyreon/issues/942)) — all bisect-verified at the unit level.

  **W13 — `@pyreon/zero/client` strips URL query string on SPA cold-start.**
  `startClient` called `router.replace(router.currentRoute().path)` to kick
  off the loader pipeline, but `currentRoute().path` is the pathname ONLY
  (query + hash stripped by `resolveRoute`). The `router.replace(pathname)`
  then wrote the bare URL via `history.replaceState`, silently dropping any
  query params present on the initial-load URL. Direct-link sharing of
  `/search?q=react` was broken on cold-start — `useUrlState('q')` /
  `useTypedSearchParams` read empty `window.location.search` and fell back
  to defaults. Fix: pass the FULL URL (pathname + search + hash) instead.

  **W14 — `@pyreon/hotkeys` sequential combos (`'g t'`) didn't work.**
  CLAUDE.md documented vim/Gmail-style `g t` / `g n` combos but the
  implementation only split on `+`. So `'g t'` parsed as a single key
  literal `'g t'` (with space) that could never match a keystroke. Fix:
  `registerHotkey` now splits the shortcut on whitespace into a sequence
  of sub-combos. Each non-first combo is recorded as `entry.sequence[]`
  and matched against subsequent keystrokes within a 1-second timeout
  window. Three-step sequences (`a b c`) and combos with modifiers
  (`ctrl+k p`) both work. 9 new specs cover the contract.

  **W16 — `@pyreon/runtime-dom`'s `<Transition>` crashed with null ref**
  when wrapped inside `<Portal>`/`<Show>`/other reactive wrappers. The
  `appear: true` path queued `applyEnter(ref.current as HTMLElement)`
  in a microtask, but the child commit could be one or more microtasks
  behind. `applyEnter(null)` → `el.classList.remove(...)` → "Cannot read
  properties of null (reading 'classList')". Fix: `safeApplyEnter`
  retries up to 16 microtasks for the ref to populate before silently
  giving up. Bisect-verified spec.

  **W17 — `@pyreon/feature`'s `feature.useForm()` didn't invalidate the
  list query after submit.** `useForm`'s `onSubmit` called `http.create()`
  / `http.update()` DIRECTLY, bypassing the `useCreate()` / `useUpdate()`
  mutation pipeline that wires `client.invalidateQueries` in `onSuccess`.
  So after the form submitted, the list view didn't refetch and the UI
  silently failed to show the new/updated item until manual reload. Fix:
  `useForm`'s onSubmit now invalidates `queryKeyBase` (and the per-id key
  in edit mode), matching the behaviour of `useCreate()` / `useUpdate()`.
  96 feature tests still pass.

  Discovered by deep-auditing every interactive flow in the HN-clone
  (`[#942](https://github.com/pyreon/pyreon/issues/942)`) with Playwright. Each is bisect-verified — revert the source
  fix → the new test fails; restore → it passes.

- Updated dependencies [[`885d6d9`](https://github.com/pyreon/pyreon/commit/885d6d95f02b9dd1b462c1ba1114ecf94350671a), [`fd3422c`](https://github.com/pyreon/pyreon/commit/fd3422cfec1d48c8b382f8512ed44f8256887931), [`cc8e6ac`](https://github.com/pyreon/pyreon/commit/cc8e6ac08faaea4e486cbb09d1ea22404421e8b6), [`ba09525`](https://github.com/pyreon/pyreon/commit/ba09525e947ebff5573222332bd0f1548fcfae77), [`ec869c0`](https://github.com/pyreon/pyreon/commit/ec869c0fa7eefd16901daf382ff273b60350fe66), [`2d9acff`](https://github.com/pyreon/pyreon/commit/2d9acff27e9fd3c51468e98505a6a2334e2b5384), [`a31f7dd`](https://github.com/pyreon/pyreon/commit/a31f7dd8f8ddba6864c69bbf53117d36ddd477a3), [`71901d4`](https://github.com/pyreon/pyreon/commit/71901d4366e993542a0a8252647b7a4b0e8ec3d2), [`0fd9852`](https://github.com/pyreon/pyreon/commit/0fd98527ff7ea8a06ef0b470a2a6e84fcd9eba81), [`1921168`](https://github.com/pyreon/pyreon/commit/192116843a0547c777e884f0254ffc51a69bfae1), [`749c2f4`](https://github.com/pyreon/pyreon/commit/749c2f435909740ea43d528ebfc00a2155e64f74), [`814dd46`](https://github.com/pyreon/pyreon/commit/814dd4649c83f044ef5754b73fdc20e4e037524d), [`534696a`](https://github.com/pyreon/pyreon/commit/534696ab763a1cd045f822da4cec41bdf08c98be), [`745fd63`](https://github.com/pyreon/pyreon/commit/745fd63c3ce97d0eb7bab37fa85ae40ed8c1c9bd)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/form@0.33.0
  - @pyreon/core@0.33.0
  - @pyreon/query@0.33.0
  - @pyreon/store@0.33.0
  - @pyreon/validation@0.33.0
  - @pyreon/table@0.33.0

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
  - @pyreon/form@0.25.1
  - @pyreon/query@0.25.1
  - @pyreon/store@0.25.1
  - @pyreon/table@0.25.1
  - @pyreon/validation@0.25.1

## 0.25.0

### Patch Changes

- Updated dependencies [[`7da5b2b`](https://github.com/pyreon/pyreon/commit/7da5b2bcbc2aebd9600cb8fdefb763ace7f78c1a), [`bc145f3`](https://github.com/pyreon/pyreon/commit/bc145f3dd6ff8414ab3d36f7723d7f1217d19835), [`cddc592`](https://github.com/pyreon/pyreon/commit/cddc5926f2f23d1b600d01f60fa4e72513d2b6fe), [`6075127`](https://github.com/pyreon/pyreon/commit/60751278894a6ff843c0f6f6c4894c76bcb6a720), [`f71fb4c`](https://github.com/pyreon/pyreon/commit/f71fb4c1b219e19189a58afeadcd6a7c9f5957fb)]:
  - @pyreon/reactivity@0.25.0
  - @pyreon/core@0.25.0
  - @pyreon/store@0.25.0
  - @pyreon/form@0.25.0
  - @pyreon/query@0.25.0
  - @pyreon/table@0.25.0
  - @pyreon/validation@0.25.0

## 0.24.6

### Patch Changes

- Updated dependencies [[`378efde`](https://github.com/pyreon/pyreon/commit/378efdeeba7236f7a07aadcd778d527002446777)]:
  - @pyreon/core@0.24.6
  - @pyreon/reactivity@0.24.6
  - @pyreon/form@0.24.6
  - @pyreon/query@0.24.6
  - @pyreon/store@0.24.6
  - @pyreon/table@0.24.6
  - @pyreon/validation@0.24.6

## 0.24.5

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.5
  - @pyreon/reactivity@0.24.5
  - @pyreon/form@0.24.5
  - @pyreon/query@0.24.5
  - @pyreon/store@0.24.5
  - @pyreon/table@0.24.5
  - @pyreon/validation@0.24.5

## 0.24.4

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.4
  - @pyreon/reactivity@0.24.4
  - @pyreon/form@0.24.4
  - @pyreon/query@0.24.4
  - @pyreon/store@0.24.4
  - @pyreon/table@0.24.4
  - @pyreon/validation@0.24.4

## 0.24.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.3
  - @pyreon/reactivity@0.24.3
  - @pyreon/form@0.24.3
  - @pyreon/query@0.24.3
  - @pyreon/store@0.24.3
  - @pyreon/table@0.24.3
  - @pyreon/validation@0.24.3

## 0.24.2

### Patch Changes

- Updated dependencies [[`1c1b135`](https://github.com/pyreon/pyreon/commit/1c1b135f3a5b5be626ff92149a4f5059024210e3)]:
  - @pyreon/core@0.24.2
  - @pyreon/reactivity@0.24.2
  - @pyreon/form@0.24.2
  - @pyreon/query@0.24.2
  - @pyreon/store@0.24.2
  - @pyreon/table@0.24.2
  - @pyreon/validation@0.24.2

## 0.24.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.1
  - @pyreon/reactivity@0.24.1
  - @pyreon/form@0.24.1
  - @pyreon/query@0.24.1
  - @pyreon/store@0.24.1
  - @pyreon/table@0.24.1
  - @pyreon/validation@0.24.1

## 0.24.0

### Patch Changes

- Updated dependencies [[`dfaefb8`](https://github.com/pyreon/pyreon/commit/dfaefb8e9e06eaff9039c001ad7731476b6b5732), [`67e1f37`](https://github.com/pyreon/pyreon/commit/67e1f371a20219481ee9564d2d7421ec2a0b5ddf), [`b8fb31c`](https://github.com/pyreon/pyreon/commit/b8fb31cf1a59578fc33f27d539695d2bc164b2f1), [`f400e85`](https://github.com/pyreon/pyreon/commit/f400e85282a370276d5ae0266ba501c41dce4f3e), [`891ca43`](https://github.com/pyreon/pyreon/commit/891ca4300727119dafd66ceaacd7cb39e68f3b4e), [`d4ec777`](https://github.com/pyreon/pyreon/commit/d4ec777643446ed2c51dedb1e74fbd8dce70bdfd), [`2abb672`](https://github.com/pyreon/pyreon/commit/2abb672d8a8bf7f4940af422bf8bf802aa129cdd)]:
  - @pyreon/core@0.24.0
  - @pyreon/reactivity@0.24.0
  - @pyreon/form@0.24.0
  - @pyreon/query@0.24.0
  - @pyreon/store@0.24.0
  - @pyreon/table@0.24.0
  - @pyreon/validation@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [[`6571df8`](https://github.com/pyreon/pyreon/commit/6571df8209c5dc72619194ffe19359765b1d2d7f), [`af4d5d8`](https://github.com/pyreon/pyreon/commit/af4d5d83fc087d738dbe5084950476566d488d77), [`441b5df`](https://github.com/pyreon/pyreon/commit/441b5dfa64ae52002d3e6612ec68566344ae999d)]:
  - @pyreon/core@0.23.0
  - @pyreon/reactivity@0.23.0
  - @pyreon/form@0.23.0
  - @pyreon/query@0.23.0
  - @pyreon/store@0.23.0
  - @pyreon/table@0.23.0
  - @pyreon/validation@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.22.0
  - @pyreon/reactivity@0.22.0
  - @pyreon/form@0.22.0
  - @pyreon/query@0.22.0
  - @pyreon/store@0.22.0
  - @pyreon/table@0.22.0
  - @pyreon/validation@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.21.0
  - @pyreon/reactivity@0.21.0
  - @pyreon/form@0.21.0
  - @pyreon/query@0.21.0
  - @pyreon/store@0.21.0
  - @pyreon/table@0.21.0
  - @pyreon/validation@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [[`3499594`](https://github.com/pyreon/pyreon/commit/3499594585b7fcb650ac0f80be4bc355f741491b)]:
  - @pyreon/reactivity@0.20.0
  - @pyreon/core@0.20.0
  - @pyreon/form@0.20.0
  - @pyreon/query@0.20.0
  - @pyreon/store@0.20.0
  - @pyreon/table@0.20.0
  - @pyreon/validation@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [[`c3d0a70`](https://github.com/pyreon/pyreon/commit/c3d0a7017ed2ef4468ec3fb4e4c09ec869d2917a), [`ecd8e52`](https://github.com/pyreon/pyreon/commit/ecd8e526943a1e6b07957ff96f4410fa482baa0d), [`ac1d375`](https://github.com/pyreon/pyreon/commit/ac1d37542b11cd95451a2f0b0a51cc43603d001a), [`21e465c`](https://github.com/pyreon/pyreon/commit/21e465c7957c3e57c838af58ffa995682908c5f8), [`c4b6e9a`](https://github.com/pyreon/pyreon/commit/c4b6e9a5850196171c2197fc918163f736708aa8), [`fb40906`](https://github.com/pyreon/pyreon/commit/fb409066e49e44c42f77084a92a68103a4e6c5ef), [`fde0f41`](https://github.com/pyreon/pyreon/commit/fde0f41ad6312ad0ee45d8e70ece965d7c4fec41), [`9f03747`](https://github.com/pyreon/pyreon/commit/9f037478763d9f8cd2365feb63dc87fda2545e5d), [`3374150`](https://github.com/pyreon/pyreon/commit/33741500499dfb487d031bbffe77723d74b8f261), [`fa4e37f`](https://github.com/pyreon/pyreon/commit/fa4e37fa620cf0e3f240053bf789b84bd9668838)]:
  - @pyreon/reactivity@0.19.0
  - @pyreon/query@0.19.0
  - @pyreon/core@0.19.0
  - @pyreon/store@0.19.0
  - @pyreon/form@0.19.0
  - @pyreon/table@0.19.0
  - @pyreon/validation@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.18.0
  - @pyreon/reactivity@0.18.0
  - @pyreon/form@0.18.0
  - @pyreon/query@0.18.0
  - @pyreon/store@0.18.0
  - @pyreon/table@0.18.0
  - @pyreon/validation@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [[`35af0e2`](https://github.com/pyreon/pyreon/commit/35af0e22b670151052e0b1df5006977fca759128), [`8b1a982`](https://github.com/pyreon/pyreon/commit/8b1a982faa140e7e646293a47d6a4fbe70cac67c)]:
  - @pyreon/core@0.17.0
  - @pyreon/form@0.17.0
  - @pyreon/query@0.17.0
  - @pyreon/table@0.17.0
  - @pyreon/validation@0.17.0
  - @pyreon/reactivity@0.17.0
  - @pyreon/store@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [[`a4a4255`](https://github.com/pyreon/pyreon/commit/a4a42550835cb2706b99beed8ea582037d338ea8), [`7f26cd7`](https://github.com/pyreon/pyreon/commit/7f26cd78d74db8237aa6261a11965325d944f1ca)]:
  - @pyreon/core@0.16.0
  - @pyreon/form@0.16.0
  - @pyreon/validation@0.16.0
  - @pyreon/reactivity@0.16.0
  - @pyreon/query@0.16.0
  - @pyreon/store@0.16.0
  - @pyreon/table@0.16.0

## 0.14.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.14.0
  - @pyreon/reactivity@0.14.0
  - @pyreon/form@0.14.0
  - @pyreon/query@0.14.0
  - @pyreon/store@0.14.0
  - @pyreon/table@0.14.0
  - @pyreon/validation@0.14.0

## 0.13.0

### Patch Changes

- [#261](https://github.com/pyreon/pyreon/pull/261) [`72b2023`](https://github.com/pyreon/pyreon/commit/72b2023609bf539e804f64dbefcf2586edf7162f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Triaged safe changes from architecture review PR [#260](https://github.com/pyreon/pyreon/issues/260):

  - **hotkeys**: detach global `keydown` listener when last hotkey unregisters (prevents listener accumulation across component remounts)
  - **code**: new `useEditorSignal()` hook — wraps `bindEditorToSignal` with `onUnmount` auto-cleanup (eliminates manual `dispose()` calls)
  - **form**: `ValidateFn` accepts optional `AbortSignal`; `useForm` creates per-cycle `AbortController` cancelled on unmount (prevents orphaned async validators)
  - **validation**: `zodSchema()` / `valibotSchema()` / `arktypeSchema()` return `TypedSchemaAdapter<TValues>` with `.validator` and phantom `_infer` type for compile-time field name validation. `useForm({ schema })` accepts both the new adapter and plain `SchemaValidateFn` (backward compatible).

  Dropped from the original PR: onCleanup LIFO ordering change (breaking behavioral change), circular effect detection (redundant with batch), SSR streaming backpressure (architecturally wrong implementation).

- Updated dependencies [[`72b2023`](https://github.com/pyreon/pyreon/commit/72b2023609bf539e804f64dbefcf2586edf7162f), [`ec30b4e`](https://github.com/pyreon/pyreon/commit/ec30b4e2188fb493fdde77a77f521abe000beae0), [`a05c4ba`](https://github.com/pyreon/pyreon/commit/a05c4bab713f5168acd56eb233520102735bd80a)]:
  - @pyreon/form@0.13.0
  - @pyreon/validation@0.13.0
  - @pyreon/query@0.13.0
  - @pyreon/store@0.13.0
  - @pyreon/core@0.13.0
  - @pyreon/reactivity@0.13.0
  - @pyreon/table@0.13.0

## 0.12.15

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.15
  - @pyreon/reactivity@0.12.15
  - @pyreon/form@0.12.15
  - @pyreon/query@0.12.15
  - @pyreon/store@0.12.15
  - @pyreon/table@0.12.15
  - @pyreon/validation@0.12.15

## 0.12.14

### Patch Changes

- Updated dependencies [[`779f61f`](https://github.com/pyreon/pyreon/commit/779f61f99e1f403485871c1848fc82489d20960f)]:
  - @pyreon/query@0.12.14
  - @pyreon/core@0.12.14
  - @pyreon/reactivity@0.12.14
  - @pyreon/form@0.12.14
  - @pyreon/store@0.12.14
  - @pyreon/table@0.12.14
  - @pyreon/validation@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.13
  - @pyreon/reactivity@0.12.13
  - @pyreon/form@0.12.13
  - @pyreon/query@0.12.13
  - @pyreon/store@0.12.13
  - @pyreon/table@0.12.13
  - @pyreon/validation@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.12
  - @pyreon/reactivity@0.12.12
  - @pyreon/form@0.12.12
  - @pyreon/query@0.12.12
  - @pyreon/store@0.12.12
  - @pyreon/table@0.12.12
  - @pyreon/validation@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.11
  - @pyreon/reactivity@0.12.11
  - @pyreon/form@0.12.11
  - @pyreon/query@0.12.11
  - @pyreon/store@0.12.11
  - @pyreon/table@0.12.11
  - @pyreon/validation@0.12.11

## 0.9.0

### Minor Changes

- ### Improvements
  - Upgrade to pyreon 0.7.5 (jsx preset, all JSX types accept undefined)
  - Use @pyreon/typescript preset (no local jsx override needed)
  - Complete documentation: 18 package READMEs, 18 docs/ files, llms.txt
  - Update AI building rules with document generation patterns

### Patch Changes

- Updated dependencies []:
  - @pyreon/store@0.13.0
  - @pyreon/form@0.13.0
  - @pyreon/validation@0.13.0
  - @pyreon/query@0.13.0
  - @pyreon/table@0.13.0

## 0.8.0

### Minor Changes

- [`075dd4f`](https://github.com/pyreon/fundamentals/commit/075dd4fe4a325fe5a5637a68e209dffe665bb84e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - ### Improvements
  - Upgrade to TypeScript 6.0 and pyreon 0.7.3
  - Switch to @pyreon/typescript for tsconfig presets
  - Full exactOptionalPropertyTypes compliance
  - Security: add sanitization across all document renderers (XSS, XML injection, protocol validation)
  - Fix WebSocket.send() type for TS 6.0
  - Clean up conditional spreading now that core 0.7.3 accepts undefined on JSX attrs

### Patch Changes

- Updated dependencies [[`075dd4f`](https://github.com/pyreon/fundamentals/commit/075dd4fe4a325fe5a5637a68e209dffe665bb84e)]:
  - @pyreon/store@0.13.0
  - @pyreon/form@0.13.0
  - @pyreon/validation@0.13.0
  - @pyreon/query@0.13.0
  - @pyreon/table@0.13.0

## 0.7.0

### Minor Changes

- [`deb9834`](https://github.com/pyreon/fundamentals/commit/deb983456472cc685d80e97b21196588af53b502) Thanks [@vitbokisch](https://github.com/vitbokisch)! - ### New package

  - `@pyreon/document` — universal document rendering with 18 node primitives and 14 output formats (HTML, PDF, DOCX, XLSX, PPTX, email, Markdown, text, CSV, SVG, Slack, Teams, Discord, Telegram, Notion, Confluence/Jira, WhatsApp, Google Chat)

  ### Fixes

  - Fix DTS export paths — bump @vitus-labs/tools-rolldown to 1.15.4 (emitDtsOnly fix)
  - All packages now produce correct type declarations

### Patch Changes

- Updated dependencies [[`deb9834`](https://github.com/pyreon/fundamentals/commit/deb983456472cc685d80e97b21196588af53b502)]:
  - @pyreon/store@0.13.0
  - @pyreon/form@0.13.0
  - @pyreon/validation@0.13.0
  - @pyreon/query@0.13.0
  - @pyreon/table@0.13.0

## 0.6.0

### Minor Changes

- [`5610cdf`](https://github.com/pyreon/fundamentals/commit/5610cdffb69022aacd44419d7c71b97bdcf8403f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - ### New packages

  - `@pyreon/flow` — reactive flow diagrams with signal-native nodes, edges, pan/zoom, auto-layout via elkjs
  - `@pyreon/code` — reactive code editor with CodeMirror 6, minimap, diff editor, lazy-loaded languages

  ### Improvements

  - Upgrade to pyreon 0.6.0
  - Use `provide()` for context providers (query, form, i18n, permissions)
  - Fix error message prefixes across packages

### Patch Changes

- Updated dependencies [[`5610cdf`](https://github.com/pyreon/fundamentals/commit/5610cdffb69022aacd44419d7c71b97bdcf8403f)]:
  - @pyreon/store@0.13.0
  - @pyreon/form@0.13.0
  - @pyreon/validation@0.13.0
  - @pyreon/query@0.13.0
  - @pyreon/table@0.13.0

## 0.13.0

### Minor Changes

- Add @pyreon/permissions (reactive type-safe permissions) and @pyreon/machine (reactive state machines). Update AI building rules.

### Patch Changes

- Updated dependencies []:
  - @pyreon/store@0.13.0
  - @pyreon/form@0.13.0
  - @pyreon/validation@0.13.0
  - @pyreon/query@0.13.0
  - @pyreon/table@0.13.0

## 0.13.0

### Minor Changes

- Add @pyreon/storage (reactive localStorage, sessionStorage, cookies, IndexedDB) and @pyreon/hotkeys (keyboard shortcut management). Add useSubscription to @pyreon/query for WebSocket integration. Upgrade to pyreon core 0.5.4. Convert all tests and source to JSX.

### Patch Changes

- Updated dependencies []:
  - @pyreon/store@0.13.0
  - @pyreon/form@0.13.0
  - @pyreon/validation@0.13.0
  - @pyreon/query@0.13.0
  - @pyreon/table@0.13.0

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

### Patch Changes

- Updated dependencies [[`9fe5b51`](https://github.com/pyreon/fundamentals/commit/9fe5b51868c50c3bcab1961f94df27846921b739)]:
  - @pyreon/store@0.1.0
  - @pyreon/form@0.1.0
  - @pyreon/validation@0.1.0
  - @pyreon/query@0.1.0
  - @pyreon/table@0.1.0
