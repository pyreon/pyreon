---
'@pyreon/router': patch
---

Fix: `staleWhileRevalidate` route loaders now actually work for the realistic navigate-away-and-back case.

**The bug.** `commitNavigation` pruned `router._loaderData` on every navigation — deleting any entry whose `RouteRecord` was not in the *new* matched chain. Navigating away from a `staleWhileRevalidate` route therefore deleted its loader data, so on return `runLoaders`' `r.staleWhileRevalidate && router._loaderData.has(r)` gate was always false and the route went through the **blocking** loader path every time. `revalidateSwrLoaders` never ran; SWR was effectively a no-op (it only worked if you re-navigated to the route *without* navigating away first — never the real-world pattern).

**The fix.** The prune now skips `staleWhileRevalidate` records (`!to.matched.includes(record) && !record.staleWhileRevalidate`), so their last-loaded data survives navigating away — which is exactly SWR's contract: on return, serve the stale value immediately and revalidate in the background. Retained data is bounded by the number of SWR route *records* (a developer-declared set; param routes share one record); per-key freshness/LRU is still handled by `_loaderCache`.

**Behaviour change (bug fix, not breaking).** Returning to a `staleWhileRevalidate` route now resolves the navigation instantly with stale data + a background revalidation, instead of blocking on a fresh fetch — i.e. the documented behaviour, which previously never happened. No app could have depended on SWR being broken.

**Note (corrects a prior disclosure).** PR #612 hypothesised the cause was `resolveRoute` returning fresh `RouteRecord` objects (identity-keyed gate never matching). That was **wrong** — record identity is stable. An instrumented probe pinned the true cause to the `commitNavigation` prune (SWR fires for `/data → /data`, but not `/data → / → /data`).

**Verification.** The pre-existing `staleWhileRevalidate` test was strengthened into a load-bearing regression guard: the revalidation (2nd) loader call now takes a real ~40 ms delay, and the test asserts that immediately after the return navigation the served data is still the STALE `data-v1` (SWR returned without blocking) — pre-fix that navigation went through the blocking path and the data was already `data-v2`. Bisect-verified (revert the prune-skip → the stale-window assertion fails with `expected 'data-v2' to be 'data-v1'`, and the nav even takes ~45 ms because it blocked on the 40 ms loader; restore → 520/520 router tests pass). `bun run coverage` exits 0 with `@pyreon/router` at 91.19 % (the strengthened test now exercises the real `revalidateSwrLoaders` path).
