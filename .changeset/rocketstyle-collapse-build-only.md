---
'@pyreon/vite-plugin': patch
---

`pyreon({ collapse: true })` is now correctly **build-only**. Pre-fix the rocketstyle-collapse `transform`-hook block was gated only `!isSsr`, so it also ran under `vite dev`: a leaked per-process nested Vite SSR server (its `closeBundle` teardown is a build-only Rollup hook) plus a class frozen against the user's theme-source HMR edits — strictly worse than the HMR-reactive normal mount.

The block is now gated `if (collapseEnabled && isBuild && !isSsr)`. `vite dev` keeps the normal rocketstyle mount and the resolver is never constructed; the plugin surfaces the build-only contract once per dev process via `this.info` so an opted-in consumer isn't left wondering why nothing collapsed. Production `vite build` is unchanged. No public API change — `collapse` already behaved this way in build; this makes the dev no-op explicit, leak-free, and tested (stub-resolver bisect-verified `rocketstyle-collapse-dev.test.ts`).
