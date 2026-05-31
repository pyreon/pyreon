---
'@pyreon/zero': minor
---

fix(zero): ISR cross-user header leak — extend isCacheable + add responseFilter (PR 4)

**Bug**: ISR's `isCacheable` checked ONLY status code + presence of `Set-Cookie`. Responses carrying `Cache-Control: private | no-store | no-cache`, `Authorization`, or `Vary: Cookie | Authorization` were happily cached and replayed to OTHER users via the default `cacheKey: url.pathname`. Cross-user data leak — an auth-gated page rendered for user Alice could be served from cache to user Bob.

**Why security-shaped**: the default `cacheKey: url.pathname` makes this trivially exploitable. RFC 7234 explicitly lists these directives as "do not share across users"; honoring them is table-stakes for any HTTP cache.

**Fixes**:

1. **Extended `isCacheable` checks** (defense in depth at both cache-miss + revalidate sites):
   - `Cache-Control: private | no-store | no-cache` → refuse
   - `Authorization` response header → refuse
   - `Vary: Cookie | Authorization | *` without explicit `cacheKey` → refuse (with dev warning)
   - `Vary: Cookie | Authorization` WITH explicit `cacheKey` → ALLOW (user opted into per-cookie keying)
   - Case-insensitive directive matching throughout
2. **New `responseFilter?: (res: Response) => Response | null` config** — final-say override. Returns `null` to bypass cache, or a NEW Response to cache instead. Runs BEFORE body consumption so re-construction with `res.body` works.

**Bisect-verified**: 12 new regression tests in `isr.test.ts`; 9 fail with reverted source (`expected 'MISS' to be 'BYPASS'` across all the Cache-Control / Vary / Authorization disqualifiers). Restored → 1017/1018 zero tests pass.

The remaining items from the audit's ISR cluster (auto-wire `mode: 'isr'`, AbortController for revalidation timeout, get-then-delete race, null-revalidate forever-stale) are bundled into **PR 5** (week-2 SSR correctness sprint) per the campaign plan.
