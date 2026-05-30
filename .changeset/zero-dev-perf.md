---
'@pyreon/zero': patch
---

perf(zero): dev-mode renderSsr index.html cache + SSG mkdir dedup

Two independent zero-package optimizations:

**1. `vite-plugin.ts` — cache index.html across dev SSR requests.** `renderSsr` re-read + transformed `index.html` from disk on every dev request. The raw file rarely changes during a dev session; cache it at module level and invalidate via `handleHotUpdate` when the file actually changes. `transformIndexHtml` is NOT cached (its output may carry per-request timestamps/nonces from other plugins). Saves a disk read per dev SSR request (~0.5-2ms/request — perceptible on multi-page apps with fast navigation).

**2. `ssg-plugin.ts` — dedup `mkdir` across the SSG render loop.** Concurrent workers (default 4) often mkdir the SAME directory (sibling paths under `/blog/`, `/docs/`, etc.). New `mkdirOnce(dir)` helper caches the Promise per directory; first call launches mkdir, concurrent callers await the SAME Promise. After resolution the Promise stays cached — subsequent paths skip mkdir entirely. Cache reset at start of each `closeBundle` so a `vite build --watch` cycle that wipes `dist/` between builds doesn't reuse stale entries. For a 1000-page site with N shared parent dirs, saves up to N-1 mkdir syscalls per build.

No bench harness available for zero (server/build code, not browser runtime); changes are structural with documented expected impact. 1005/1006 zero tests pass (1 pre-existing skip); typecheck + lint clean.
