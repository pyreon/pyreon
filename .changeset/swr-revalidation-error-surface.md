---
'@pyreon/router': patch
---

Fix: a failing `staleWhileRevalidate` background revalidation no longer fails silently.

`revalidateSwrLoaders`' `.catch` was an empty body — a persistently-failing revalidation loader (auth expiry, API outage, a bug thrown in the loader) produced **zero signal**: the developer saw permanently-stale data with nothing pointing at the cause (the silent-failure anti-pattern the project's own rules forbid). It now surfaces the error like every other loader error — a `__DEV__` `console.warn` naming the route + the user-supplied `router.onError` hook — **without** cancelling or redirecting the already-settled navigation (stale data legitimately stays on screen; revalidation is non-blocking by contract).

**Why now, and why it has a real test this time.** An earlier attempt at this exact fix (PR #612's "C5") was deliberately **reverted** because `revalidateSwrLoaders` was dead code — the SWR prune bug meant it never ran, so the `.catch` was unreachable and could not be load-bearing-tested (false confidence is forbidden). PR #617 fixed that prune bug, making the SWR background path actually execute. This PR re-applies the error-surfacing **now that the path is live**, with the regression test that was impossible before: a `/data → / → /data` SWR cycle whose background revalidation rejects after a real delay asserts `onError` is called exactly once with the error, the navigation is **not** cancelled, and the stale value is **retained** (a failed revalidation must not clobber it). Bisect-verified — revert the `.catch` to the empty swallow and the test fails with `expected vi.fn() called 1 times, got 0`; restore → 521/521 router tests pass. `bun run coverage` exit 0, `@pyreon/router` 91.21 %.

This supersedes the only non-duplicate content of the abandoned parallel-session hardening PR #613 (whose other 12 fixes are already in `main` via #612); #613 can be closed.
