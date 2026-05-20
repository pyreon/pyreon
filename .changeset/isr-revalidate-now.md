---
'@pyreon/zero': minor
---

`createISRHandler` now exposes imperative cache invalidation via `revalidateNow(key)` and `revalidateAll()`. The returned handler is still callable for `Bun.serve({ fetch: handler })` — these are methods attached to the callable, not a return-shape change. Non-breaking.

The pluggable store (#742) already supported `delete?(key)` on the interface, but there was no public surface to invoke it. Runtime ISR previously relied purely on TTL-based stale-while-revalidate, which means a CMS update → ISR cache reflection always has a stale window (the TTL). The new methods close that window: a webhook fires → `revalidateNow(path)` → the very next visitor sees fresh content.

**New surface**:

```ts
import { createISRHandler } from '@pyreon/zero/server'

const isr = createISRHandler(ssrHandler, { revalidate: 60 })

// As before — Bun.serve({ fetch: isr }) still works
Bun.serve({ fetch: isr })

// CMS webhook → drop one cache entry, next request renders fresh
const result = await isr.revalidateNow('/posts/123')
// → { dropped: true } if entry existed AND store supports delete
// → { dropped: false } otherwise (honest signal for TTL-only stores)

// Admin "purge cache" endpoint → drop everything
await isr.revalidateAll()
// throws clear error if store has no clear() method
```

**Honest no-store-support behavior**: external stores (Redis TTL-only, custom shapes) may omit `delete?` or `clear?` on the `ISRStore` interface. `revalidateNow` returns `{ dropped: false }` when the store can't physically drop the entry (instead of lying about success). `revalidateAll` throws a clear error pointing at the missing `clear()` method when called against an incompatible store.

**`ISRStore` interface gains `clear?()`** — optional, non-breaking. The default `createMemoryStore` implements it.

**Internal hygiene**: both methods also clear the in-flight `revalidating` flag for the dropped key(s) so the next request re-renders fresh rather than short-circuiting on the stale-revalidate guard.

**Tests**: 7 new specs in `isr.test.ts` under `revalidateNow + revalidateAll` covering:
1. drops a cached entry — next request MISSes
2. dropped:false for keys that never existed
3. idempotent (call twice — sensible flags)
4. clears in-flight revalidation flag (the subtle one — prevents a stale-then-evicted entry's flag from blocking the next request)
5. revalidateAll drops every entry
6. revalidateAll throws against a store without clear()
7. revalidateNow against a store without delete() returns dropped:false honestly

**Bisect-verified**: replaced `revalidateNow` body with a no-op `return { dropped: false }` → 3 of 7 specs failed (the real ones — `drops a cached entry`, `idempotent`, `clears in-flight flag`); the 4 edge-case specs still passed (they were testing shapes that happen to fall through identically to a no-op). Restored → all 27 isr tests pass, full zero suite **969/969** (1 skipped pre-existing), MCP suite **497/497** (api-reference regen didn't break anything). Lint + typecheck clean. No lockfile drift. No `TEMP BISECT` remnants.

Manifest entry for `createISRHandler` updated to document the new surface + the 5 foot-guns. `gen-docs --check` clean.
