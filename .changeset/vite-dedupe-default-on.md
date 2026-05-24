---
'@pyreon/vite-plugin': minor
---

Default-on `resolve.dedupe` for every `@pyreon/*` package (PR B of the bullet-proof cross-module-instance plan, `.claude/plans/jaunty-herding-kazoo.md`).

The plugin's `config()` hook now returns `resolve.dedupe: <all @pyreon/* + transitive>` unconditionally. New helper `scanPyreonDepsTransitive(root)` walks `node_modules/@pyreon` to capture the FULL transitive set — the previous `scanPyreonDeps()` read `package.json` only and missed anything a direct dep transitively pulled in (a user with only `@pyreon/zero` declared transitively pulls `@pyreon/core`, `@pyreon/router`, `@pyreon/runtime-dom`, etc. — none of which appear in their `package.json`).

This is the BUNDLER-LAYER prevention complementing PR A's runtime DETECTION (`registerSingleton` in every `@pyreon/*` package). Together they form defense-in-depth: bundler PREVENTS duplicate resolution by construction; sentinel DETECTS anything that slips through (consumer overrode dedupe, non-Vite bundler, intentional dual-load).

**Escape hatch**: `PYREON_DISABLE_DEDUPE=1` skips the injection — rare (browser extensions, micro-frontends).

**Zero behavior change in correct setups.** Apps that already had a single instance of each `@pyreon/*` package see no runtime change. Apps with silently-tolerated duplicates today (sub-dep version mismatch) will get them resolved to one copy automatically — fixes the bug class WITHOUT requiring the user to hit PR A's sentinel throw.

Test coverage: 7 new specs in `dedupe-default-on.test.ts` (transitive scan, sort order, walk-up to node_modules, conditions still set, dedupe absent when no @pyreon dir, escape hatch fires, regression spec for the transitive-coverage gap PR B closes). Bisect-verified — neutralizing the dedupe block fails 4 positive-case tests; restored passes 7/7.

Docs: `docs/docs/zero.md` gains a "Single-instance contract" section documenting the two layers (bundler + sentinel) and the equivalent config for non-Vite consumers (Webpack `resolve.alias`, Rollup `dedupe`, esbuild).
