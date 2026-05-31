---
'@pyreon/vite-plugin': patch
---

Island registry hardening — Windows path normalization + dev HMR virtual-module invalidation (PR-S12)

Two correctness gaps in `pyreon({ islands: true })`'s auto-registry path:

**1. Windows path normalization.** `scanIslandDeclarations` resolved `loaderAbsPath` via `pathJoin(dirname(filePath), importPath)` — which uses the native path separator. On Windows that's `\`. The resolved path goes into a JSON string in `renderIslandsRegistry`, then into `import('${path}')` in the generated registry module. **Vite's resolver expects forward slashes regardless of OS**, so backslash paths fail to resolve and the auto-registry silently breaks on Windows dev. Fix: route the resolved path through `normalizeModuleId` (which already does `id.replace(/\\/g, '/')`) before storage in the registry. The forward-slash convention is then consistent across every OS.

**2. Dev HMR virtual-module invalidation.** When a user adds, renames, or removes an `island()` call in a `.tsx` / `.jsx` / `.pyreon` file, the transform hook re-scans declarations and updates `islandRegistry`. But the `virtual:pyreon/islands-registry` virtual module's `load` hook is only invoked on the FIRST request — Vite caches the emitted source, so subsequent requests get the STALE registry. The newly-added island silently fails to hydrate until a manual full reload. **Fix**: `scanIslandDeclarations` now returns a boolean indicating whether the registry changed (added/removed/renamed entries). The transform hook captures the dev server reference (`_devServer`) in `configureServer` and invalidates the virtual module via `_devServer.moduleGraph.invalidateModule(...)` when the scan reports a change. Identical-content scans return `false` — no spurious invalidations on every file touch.

A new internal helper `islandDeclsEqual(a, b)` does structural comparison of `IslandDecl[]` arrays (name + hydrate + loaderAbsPath per entry).

**Regression coverage**: 4 new tests in `islands-registry.test.ts` under the `PR-S12: hardening` describe block (Windows forward-slash assertion, simulated path normalization, transform-driven registry update, identical-content idempotence). The Windows path test asserts the absence of backslashes in the emitted source — on Linux this is trivially true for any code path, but the test serves as a Windows-shape regression catcher (a regression that re-introduces backslashes would fail on Windows even if Linux CI passes). The HMR invalidation wiring itself can't be unit-tested without a real dev server — the integration smoke is the `examples/islands-showcase` flow.

**Deferred from this PR**: the regex → AST scanner migration (the third item in the plan). The regex is functional today and migrating to oxc-parser AST visitor is a substantial change (mirroring the `@pyreon/lint/utils/imports.ts` precedent) that warrants its own PR with thorough false-positive coverage. Tracked as a follow-up.

**No public API change**: the plugin's user-facing surface (`pyreon({ islands: true })` + `hydrateIslandsAuto()`) is unchanged. The internal helper signatures changed (`scanIslandDeclarations` now returns `boolean`), but no external consumer references them.
