---
'@pyreon/compiler': patch
---

Release pipeline: `scripts/publish.ts` now includes the 7 `@pyreon/compiler-<triple>` native stub packages in `versionMap`, so `@pyreon/compiler`'s `optionalDependencies` resolve.

`publish.ts` discovers packages at `packages/*/*` (2 levels). The 7 native stub packages live one level deeper — `packages/core/compiler/npm/<triple>` — so they were never added to `versionMap`. This was latent until #644 correctly started routing `optionalDependencies` through `resolveWorkspaceDeps()`: with the stubs absent from `versionMap`, `resolveWorkspaceDeps` hit `Cannot resolve @pyreon/compiler-darwin-arm64` and `process.exit(1)` **mid-release**, after ~N packages had already published at the new version (immutable partial release: e.g. `@pyreon/core`/`@pyreon/reactivity` shipped 0.19.0 while `@pyreon/compiler` and everything sorted after it stayed 0.18.0; no `v0.19.0` tag; native never triggered).

Fix: after the `packages/*/*` `versionMap` build, also scan `packages/core/compiler/npm/*` and add each stub's `name@version`. The stubs are still NOT published by `publish.ts` (the existing `PLATFORM_STUB_PACKAGES` skip + they're not in the publish list — `release-native.yml` publishes them); their versions just need to be *known* so the parent's `optionalDependencies` resolve to `^X.Y.Z` (they version-lock to the parent via changesets). Wrapped in try/catch so a non-monorepo checkout (no `npm/` dir) is a no-op.

Proven against the real tree: stub scan populates `versionMap` with all 7 at the current version; `@pyreon/compiler.optionalDependencies` → `^0.19.0` for all 7; no `Cannot resolve`; the #644 guard passes. oxlint clean.

`publish.ts` skips already-published versions, so merging this and re-running the release **resumes**: it skips the packages already at 0.19.0 and publishes `@pyreon/compiler@0.19.0` + the remainder, then the tag + native trigger fire.

**Recommended follow-up (named, not silently deferred):** `publish.ts` resolves+publishes per-package in one loop, so *any* resolve failure on package N leaves 1..N-1 published (the partial-release failure mode seen here). Hardening it to resolve **all** manifests up front and fail fast *before any publish* would make a mid-run resolve error non-destructive. Out of scope for this urgent recovery; tracked as a follow-up.
