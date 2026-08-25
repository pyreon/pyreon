---
'@pyreon/sync': patch
---

`syncedSignal` / `syncedStore` now share ONE engine observer per (doc, map) instead of attaching two raw observers per field. A 20-field `syncedStore` previously installed 40 `Y.Map` observers (one on the data map and one on the defaults map per field), every committed transaction invoking all of them just to filter `changedKeys.has(key)`; the new per-(doc, map) dispatcher (`crdt/map-dispatch.ts`) installs 2 and routes each transaction's changed keys to the affected field handlers by key-indexed lookup — O(changed keys) instead of O(fields) per write.

Behavior is unchanged: handlers still fire synchronously at transaction commit for local and remote origins alike (the dispatcher never inspects origin — loop prevention stays in the transport plus the base signal's `Object.is` echo no-op), disposal is refcounted so two stores over one doc share an observer and disposing one never unhooks the other, and a `syncedSignal` created after a store routes through the existing dispatcher.

Measured (20-field store on the real Yjs engine, ratios over absolutes — machine under load, adjacent A/B arms, two samples each): ~1.47× faster per write (−32%, ~2.3µs → ~1.6µs) for both local sets and remote-origin applies, engine observers 40 → 2. An honest note on scale: the per-write win is O(N)-proportional — at a handful of fields it is small; the structural win (constant observer count per map) is the durable part.
