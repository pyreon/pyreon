---
"@pyreon/sync": minor
---

feat(sync): add a dependency-free LWW CRDT engine (`pyreonAdapter`) — the foundation for multiplatform sync

A pure-TS last-writer-wins CRDT engine implementing the engine-neutral `CrdtAdapter` seam, with **no `yjs` dependency**. Each register carries a Lamport-clock timestamp + the writing actor's id; merge is deterministic (higher clock wins, equal clock → higher actor id), so it is a state-based CvRDT — merging full states or any subset of ops, in any order, with duplicates, always converges (offline-then-reconnect is just another merge). Scope matches the v1 seam: flat key → scalar registers (whole-value replacement); rich `Y.Text`/`Y.Array` stay on `@pyreon/sync/yjs`.

Why it matters: it is tiny and dependency-free, so it is the engine a native JS-runtime bridge can embed for **1:1 multiplatform sync** (yjs is heavier and web-only as an engine), and it gives web apps a zero-`yjs` option for scalar-map sync today. `pyreonAdapter()` / `createActorId()` are the entry points. Convergence contract (concurrent-offline determinism, order/duplicate-insensitivity, no echo) is bisect-covered.
