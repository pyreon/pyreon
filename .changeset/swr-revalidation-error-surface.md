---
'@pyreon/router': patch
---

Fix: a failing `staleWhileRevalidate` background revalidation no longer fails silently.

`revalidateSwrLoaders`' rejection handler was an empty `.catch(() => {})`. A persistently-failing background revalidation loader (auth expiry, API outage, a bug thrown in the loader) therefore produced **zero signal** — the developer saw permanently-stale data with nothing pointing at the cause: exactly the silent-failure anti-pattern the project's own `anti-patterns.md` forbids ("Silent plugin/init error swallowing — always log in `__DEV__` and call the user `onError`").

Now the rejection is surfaced like every other loader error: a `__DEV__` `console.warn` plus the user-supplied `router.onError(err, route)` hook. It does **not** act on the return value — the navigation already settled on stale data and must not be cancelled/redirected, and a failed revalidation must not clobber the still-valid stale value.

**Context (why this wasn't fixed before).** This `.catch` was unreachable dead code until #617: the `commitNavigation` prune deleted SWR loader data on every nav-away, so `revalidateSwrLoaders` never ran for the realistic nav-away/back case. An earlier attempt to surface this error (in #612) was correctly **reverted** at the time precisely because the path was dead — adding error-surfacing to unreachable code is not hardening, and it couldn't be tested. #617 made the SWR path live; this PR is the now-worthwhile, now-**testable** completion.

**Verification.** New load-bearing regression test: `/data → / → /data` with the revalidation (2nd) loader call rejecting after a real 40 ms delay. Asserts the error reaches `onError` exactly once, the navigation is **not** cancelled (`currentRoute().path === '/data'`), and the stale value is retained (not clobbered by the failed revalidation). Bisect-verified: reverting the `.catch` to the empty body fails the test with `expected "vi.fn()" to be called 1 times, but got 0 times`; restored → 521/521 router tests pass. `bun run coverage` exit 0 (`@pyreon/router` 91.21 %); lint + typecheck clean.
