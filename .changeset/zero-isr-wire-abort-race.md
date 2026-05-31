---
'@pyreon/zero': patch
---

ISR lifecycle hygiene (PR-S5) — wire `mode: 'isr'` + AbortController + revalidation race fix + null-revalidate forever-stale fix

Four ISR correctness bugs bundled because they share the same surface (`isr.ts` revalidate path + `entry-server.ts` mode dispatch) and the same fix shape (lifecycle hygiene). Splitting into four PRs would add review overhead with no gain.

**1. `mode: 'isr'` was typed-but-not-wired** (Pattern D from the audit). `RenderMode` accepted `'isr'` and `ISRConfig` was fully exported, but `createServer` never inspected `config.mode` — apps that configured `mode: 'isr'` silently got plain SSR behavior with `config.isr` ignored and no signal pointing at the cause. The new `wireRenderMode(mode, baseHandler, config)` makes the dispatch explicit and exhaustive: `'isr'` wraps with `createISRHandler` (with a `revalidate: 60` default when `config.isr` is absent); `'ssr'` / `'spa'` / `'ssg'` pass-through. A compile-time `_AssertExhaustive` assertion fails typecheck if a new `RenderMode` value is added without a case, AND a runtime drift test in `entry-server.test.ts` enumerates the known modes to lock the behavior.

**2. Revalidation timeout did NOT abort the inner handler** (Pattern C). The pre-fix `Promise.race([handler(req), setTimeout-reject])` rejected the race promise on timeout but the inner handler kept running — DB queries, network calls, etc. all continued in the background, pinning request resources. Now an `AbortController` is created per revalidation, passed into the default revalidate Request as `signal`, and `controller.abort()` fires on timeout so handlers observing the signal can cancel their work.

**3. `revalidateNow()` had a get-then-delete race with concurrent in-flight revalidation** (Pattern C). Pre-fix: revalidate() in flight → revalidateNow() reads `existed` and calls `store.delete(key)` → meanwhile the revalidate's `handler(req)` completes and calls `store.set(key, ...)` AFTER our delete → cache is RE-POPULATED with the data we just tried to invalidate. The CMS-webhook caller saw `{ dropped: true }` but the next request served stale-thought-fresh content. Fix: per-key epoch counter (`_keyEpoch`). `revalidate()` snapshots `startEpoch` at entry, then checks `_currentEpoch(key) === startEpoch` before `store.set` — if `revalidateNow` (or `revalidateAll`) bumped the epoch mid-revalidation, the racing write is skipped. `revalidateNow` bumps the epoch BEFORE touching the store; `revalidateAll` bumps every in-flight key AND every previously-bumped key (the union of `revalidating ∪ _keyEpoch.keys()`).

**4. `revalidateRequest: () => null` left the entry forever-stale** (Pattern B — incomplete semantics). The auth-gated opt-out use case (return `null` to skip revalidation for logged-in users) used to bail without touching the cache — so every subsequent request triggered revalidate → null → bail → stale-served → loop forever. Fix: when `revalidateRequest` returns `null`, `store.delete(key)` runs before the bail so the next request MISSes and re-renders fresh.

**Regression coverage**: 4 new ISR tests + 10 new entry-server tests (7 `wireRenderMode` + 3 `createServer` integration). All bisect-verified — reverting `isr.ts` + `entry-server.ts` to the pre-fix state fails 12 of the new tests with the documented error messages; restoring passes all 42.

**No public API change**: `wireRenderMode` is `@internal` (exported only for the drift gate). The `mode: 'isr'` config field now behaves as documented.
