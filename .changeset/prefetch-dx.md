---
'@pyreon/router': patch
---

`RouterLink` viewport-prefetch polish + prefetch discoverability docs.

**Code — `prefetch="viewport"` refinements** (`components.tsx`):

- IntersectionObserver now uses `rootMargin: '200px'` (was the implicit 0px). The prefetch starts *before* the link is fully on screen, so a fast scroll-then-click typically lands on already-resolved loader data instead of waiting. Matches the margin instant.page / Astro use.
- The prefetch is scheduled via `requestIdleCallback` (falls back to `setTimeout(1)` on Safari < 16.4 / jsdom) instead of running synchronously inside the observer callback — so it never contends with the scroll the user is actively performing. The observer disconnects *synchronously* on first intersection before the idle slice is queued, so scroll jitter can't double-schedule.

No behaviour change for `"intent"` (the default), `"hover"`, or `"none"`.

**Docs — closed a discoverability gap.** `docs/docs/router.md` previously:

- Omitted `'intent'` from the `prefetch` type entirely
- Documented the default as `"hover"` — the actual default is `'intent'` (hover **and** keyboard focus)

So readers couldn't discover that prefetch is on by default, and keyboard / screen-reader users' coverage (focus-triggered prefetch) was invisible. The Prefetch Strategies section is rewritten: corrected type + default, a strategy table, the accessibility rationale for why `"intent"` is the default, and a note on the viewport polish + dedup/eviction bound. CLAUDE.md's router prefetch line updated to match.

Bisect-verified: reverted the `components.tsx` polish to the pre-fix shape → the new regression test `viewport prefetch uses 200px rootMargin + idle scheduling` failed at `expect(capturedRootMargin).toBe('200px')`; restored → all 3 viewport-prefetch tests pass. Full `@pyreon/router` suite: 519 tests pass (518 prior + 1 new).
