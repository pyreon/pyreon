# @pyreon/i18n

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
  - @pyreon/core@1.0.0
  - @pyreon/reactivity@1.0.0

## 0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@1.0.0
  - @pyreon/reactivity@1.0.0

## 0.26.3

## 0.26.2

## 0.26.1

## 0.26.0

### Patch Changes

- [#942](https://github.com/pyreon/pyreon/pull/942) [`a470388`](https://github.com/pyreon/pyreon/commit/a470388ea2184afec824f9da900b98c5d90f2ded) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `createI18n({ messages })` now applies the same flat-key expansion that
  `addMessages()` does (W9). Previously, dotted keys in the INITIAL messages
  loop were stored verbatim — so `createI18n({ messages: { en: { 'nav.top':
'top' } } })` stored the value un-nested, and `t('nav.top')` split on `.`,
  missed, and fell back to returning the key as the value. The bug was
  invisible because `addMessages()` (the runtime API called dynamically)
  DID nest flat keys; only the canonical initialization shape was broken.

  Discovered during the HN-clone walls audit — every `t()` call in the UI
  returned its key verbatim. Fixed by calling `nestFlatKeys(dict)` in the
  initial-messages loop, matching `addMessages` behavior. Four regression
  specs added to `tests/hardening.test.ts` (F6 describe block) covering
  flat-only, mixed flat+nested, non-dotted passthrough, and merge-survival
  shapes.

- Updated dependencies [[`885d6d9`](https://github.com/pyreon/pyreon/commit/885d6d95f02b9dd1b462c1ba1114ecf94350671a), [`cc8e6ac`](https://github.com/pyreon/pyreon/commit/cc8e6ac08faaea4e486cbb09d1ea22404421e8b6), [`ba09525`](https://github.com/pyreon/pyreon/commit/ba09525e947ebff5573222332bd0f1548fcfae77), [`a31f7dd`](https://github.com/pyreon/pyreon/commit/a31f7dd8f8ddba6864c69bbf53117d36ddd477a3), [`71901d4`](https://github.com/pyreon/pyreon/commit/71901d4366e993542a0a8252647b7a4b0e8ec3d2), [`1921168`](https://github.com/pyreon/pyreon/commit/192116843a0547c777e884f0254ffc51a69bfae1), [`749c2f4`](https://github.com/pyreon/pyreon/commit/749c2f435909740ea43d528ebfc00a2155e64f74)]:
  - @pyreon/reactivity@1.0.0
  - @pyreon/core@1.0.0

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

- [#883](https://github.com/pyreon/pyreon/pull/883) [`6075127`](https://github.com/pyreon/pyreon/commit/60751278894a6ff843c0f6f6c4894c76bcb6a720) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Singleton sentinel default-on across every `@pyreon/*` package with module-level state (PR A of the bullet-proof cross-module-instance plan, `.claude/plans/jaunty-herding-kazoo.md`).

  Each package's `src/index.ts` now calls `registerSingleton('@pyreon/<name>', <version>, import.meta.url)` at module load. The first registration records a marker on `globalThis`; a second registration with a DIFFERENT normalized location triggers detection. Default mode throws an actionable Error naming both file paths and three concrete fixes (Vite `resolve.dedupe`, `npm ls`, `bun ls`). `PYREON_SINGLE_INSTANCE=warn` demotes to `console.error`; `PYREON_SINGLE_INSTANCE=silent` opts out entirely (browser extensions, micro-frontends, nested SSR via `rocketstyle-collapse`).

  **HMR-aware.** Vite re-evaluates modules with the SAME path but possibly different query params (`?v=12345`, `?t=12345`, `?import`). The sentinel normalizes the location (strips query string) before comparing — same normalized location → HMR re-eval → silently allowed; different location → genuine dual-instance → throws.

  **Per-package detection.** The earlier prototype put the sentinel only in `@pyreon/reactivity` — insufficient because `@pyreon/core` (and every other package) has its own module-level state that can be silently corrupted under dual-load. The full plan requires per-package registration, which this PR ships.

  **Zero behavior change in correct setups.** Apps that already have a single instance of each `@pyreon/*` package (the overwhelmingly common case) see no runtime change. Apps with silently-tolerated duplicates today (sub-dep version mismatch, custom bundler config) will see their app throw at startup after upgrading with an error message naming the fix. `PYREON_SINGLE_INSTANCE=warn` is the immediate mitigation for any consumer surprised by the change.

  **Test coverage.** Contract tests at `packages/core/reactivity/src/tests/singleton-sentinel.test.ts` (57 specs) exercise the sentinel directly with synthetic `file://` URLs: default-mode throw + actionable error message, HMR re-eval allowance, `PYREON_SINGLE_INSTANCE=warn` / `=silent` escape hatches, per-package coverage across all 24 registered packages, and cross-package isolation. Bisect-verified — neutralizing the throw branch fails 49 positive-case tests; restored passes all 57. The synthetic-URL approach replaces the heavier filesystem dual-load reproducer (it's the sentinel's normalized-string comparison that matters, not Node's ESM loader behaviour).

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

- [#612](https://github.com/pyreon/pyreon/pull/612) [`c3d0a70`](https://github.com/pyreon/pyreon/commit/c3d0a7017ed2ef4468ec3fb4e4c09ec869d2917a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Security / memory-leak / correctness hardening sweep across core, fundamentals, and zero. 12 source-grounded defects fixed; every fix has a bisect-verified regression test (revert → fail → restore → pass).

  **Security (prototype pollution / XSS / DoS)**

  - `@pyreon/reactivity` `reconcile()` + `createStore` set trap — a documented "apply an untrusted API response into a store" path (`reconcile(JSON.parse(body), store)`) had no `__proto__`/`constructor`/`prototype` guard. Added on both the write and stale-key-removal passes + defense-in-depth in the proxy set trap.
  - `@pyreon/i18n` `addMessages` — `nestFlatKeys` (dotted-key expansion) ran BEFORE `deepMerge`, so deepMerge's own pollution filter never saw the dotted form; `__proto__.x` walked into `Object.prototype` and wrote onto it. Message JSON is routinely CDN/community-sourced. Guarded.
  - `@pyreon/document` HTML renderer — `language` was interpolated raw into `<html lang="…">` and `styleStr` emitted string values raw into `style="…"`; a CMS/author-supplied value containing `"><script>` broke out → stored XSS. `lang` is now charset-restricted + escaped; style values route through the renderer's existing `sanitizeCss`.
  - `@pyreon/zero` rate-limit — `MAX_STORE_SIZE` was a declared-but-unenforced constant; the cleanup only evicted EXPIRED entries, so a flood of unique keys within one window (spoofable `X-Forwarded-For`) grew the Map unbounded — an unauthenticated memory-exhaustion DoS. Added a hard cap with oldest-first eviction (mirrors the ISR cache's proven `set()`).
  - `@pyreon/zero` ISR — the cache stored ANY response and replayed it as a 200 for the whole revalidate window: a transient 5xx/3xx became a self-inflicted outage, and a `Set-Cookie` response was replayed cross-user. Now only 2xx, cookie-free responses are cached; everything else passes through verbatim with its original status (`x-isr-cache: BYPASS`).
  - `@pyreon/server` `prerender` + `@pyreon/zero` SSG plugin (3 sites) — the path-traversal guard used a bare `startsWith(resolve(outDir))` (string-prefix, not path containment): a `getStaticPaths` slug resolving to the SIBLING `dist-evil/` passed and wrote outside the output root. Now separator-terminated containment (`isInsideDist`).
  - `@pyreon/zero` API-route matcher — dangerous param names from the route pattern guarded (defense-in-depth; consistent with the reconcile / i18n guards).

  **Memory leaks**

  - `@pyreon/reactivity` `signal._d` — direct-updater disposal nulled an array slot but never compacted, so a long-lived signal (theme/locale/auth, or signals read in `<For>` rows) bound by churning components accumulated one permanent dead slot per ever-mounted binding — an app-lifetime leak that ALSO degraded the signal-write hot path (`notifyDirect` iterated O(total-ever), not O(live)). Switched to a `Set` (same as `_s`): O(1) disposal, O(live) iteration, bounded growth. Proven structurally — `_d.size` stays 0 after 10 000 register/dispose cycles.
  - `@pyreon/dnd` `useSortable` — `itemRef` pushed every pdnd registration onto a shared array and the unmount (`ref(null)`) branch was a no-op, so a churning `<For>` sortable (todo list / kanban — the documented usage) leaked every removed item's draggable/dropTarget registration until the whole sortable unmounted. Now per-key disposal on unmount and re-register.
  - `@pyreon/zero` ISR — a hung revalidation handler pinned its key in the in-flight set forever (`finally` never ran), so the entry could never recover from stale. Background revalidation is now timeout-bounded (`ISRConfig.revalidateTimeoutMs`, default 30 s).

  **Correctness / silent-failure**

  - `@pyreon/router` `stringifyLoaderData` — the cycle detector used an all-seen `WeakSet` that was never pruned, so a shared (DAG) reference — extremely common, e.g. `{ author: user, lastEditor: user }` from an ORM — falsely threw "circular reference" and 500'd the SSR response. Replaced with true ancestor-path detection (the original code's own comment anticipated exactly this remedy). **Behaviour change (bug fix, strictly more permissive):** payloads that previously 500'd now serialize; real cycles still throw.
  - `@pyreon/server` `processTemplate` — used `String.prototype.replace` with string replacements, so rendered HTML containing literal `$&` / `$$` / `` $` `` / `$'` (prices, code, math) was corrupted by regex-pattern substitution. Switched to function replacements.
  - `@pyreon/i18n` `interpolate` — a serialization failure (circular value, throwing `toString`) was swallowed silently, rendering `{{key}}` to end users with no signal. Now dev-warns (fallback behaviour unchanged).
  - `@pyreon/query` `useSSE` — the reactive effect unconditionally reset `intentionalClose = false`, so an explicit `close()` was silently overridden by any later reactive `url`/`enabled` change. Now respects `intentionalClose` (mirrors `useSubscription`); `reconnect()` is the explicit resume.

  **Disclosures (honest scope)**

  - **An attempted SWR-swallow fix (surface the empty `.catch` via `__DEV__` warn + `_onError`) was REVERTED from this PR.** Probing empirically proved `revalidateSwrLoaders` is invoked **0 times** even by the canonical `staleWhileRevalidate` nav pattern: `resolveRoute` returns fresh `RouteRecord` objects per resolution, so `runLoaders`' `r.staleWhileRevalidate && router._loaderData.has(r)` gate is never true across navigations — the SWR branch is **dead code**, and the existing "revalidates in background" test's count actually comes from the blocking path running twice. Adding error-surfacing to provably-unreachable code is not hardening (and it dropped router coverage). **The real bug — `staleWhileRevalidate` is effectively non-functional for the nav-away/back case (record-identity-keyed gate)** — is a distinct, significant finding whose correct fix (key the gate by a stable path/loaderKey) is a non-trivial router behaviour change deserving its own focused, aligned PR. Documented in `router/src/tests/loader.test.ts` as a flagged follow-up; deliberately not bundled here (scope/risk).
  - One audit finding (`decodeKeyFromMarker`) was investigated and **dropped as a false positive** — `%2D` never appears in `encodeURIComponent` output, so the manual substitution is uniquely reversible.
  - Z5 (API-route param guard) is defense-in-depth: a string param value assigned to `__proto__` is a silent JS no-op (not exploitable); the guard prevents the real own-prop shadow for `constructor`/`prototype` and matches the repo-wide convention.

  Validation: lint 0 errors; typecheck clean (8 touched packages); gen-docs in sync; audit-types `--all --strict` 0 HIGH; bundle-budgets 54/54 within budget. Per-package suites all green (reactivity 294, router 520, server 78, i18n 155, document 269, dnd 111, query 151, zero 884).

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
