---
'@pyreon/zero': patch
---

`closeBundle` resets `_mkdirCache` in a finally block (defense-in-depth) (PR-S13)

**Pattern A from the deep-audit campaign** — module-global state with eviction-on-success-only. Pre-PR-S13 `_resetMkdirCache()` was called at the START of `closeBundle` — fresh state for THIS build. But if the render loop threw mid-build, the cache stayed populated for any subsequent in-process consumer (e.g. another SSG plugin instance, a test harness running multiple builds in the same Node process). The next build's start-of-build reset would catch it in the common case, but a build that aborts BEFORE reaching `closeBundle` (e.g. a build error in a prior plugin) leaves the cache dirty.

**The fix**: wrap the entire `closeBundle` body in `try { ... } finally { _resetMkdirCache() }`. Symmetric with the start-of-build reset (already present pre-PR-S13) — defense in depth so the cache is guaranteed clean after EVERY build attempt, regardless of crash. Structurally analogous to PR I's `try { ... } finally { delete process.env[SSG_BUILD_FLAG] }` pattern that wraps the inner SSR sub-build.

The mkdirOnce cache exists to deduplicate concurrent `fs.mkdir` calls during the per-path write loop (with `concurrency: 4` (PR D) up to 4 paths can ask for the same dist subdirectory concurrently). Stale entries are unsafe because `dist/` may have been wiped between builds (CI pipelines, `vite build --watch` + manual clean) and the resolved Promise would point at a no-longer-existing directory creation.

**Regression coverage**: 4 new tests in `ssg-plugin.test.ts` under the `mkdirOnce cache (PR-S13)` describe block — 3 contract tests for the cache primitive (`deduplicates per directory string`, `_resetMkdirCache() clears every entry`, `repopulates after reset`) + 1 source-level regression catcher (`closeBundle structure: finally-block reset is present`) that asserts the `try { ... } finally { _resetMkdirCache() }` pattern appears in the source. Bisect-verified: reverting `ssg-plugin.ts` fails all 4 tests (3 because the new `_internal` exports are missing, 1 because the source-level pattern is absent); restored → 115 ssg-plugin tests + 1026 zero tests pass.

The source-level test is the load-bearing regression catcher — the contract tests cover the cache primitive's behavior; a regression that removes the finally block would leave the cache primitive correct but the closeBundle wiring broken. The source pattern check catches the wiring regression directly.

**No public API change**: `_mkdirCache` / `mkdirOnce` / `_resetMkdirCache` are internal. The new `_internal` exports (`mkdirOnce`, `_resetMkdirCache`, `_peekMkdirCacheSize`) are `@internal` testing surface only.
