---
"@pyreon/sync": minor
---

feat(sync): dependency-free LWW CRDT engine + pure-JS client transport (`pyreonAdapter` / `connectPyreonSync`) — the foundation for multiplatform sync

A pure-TS last-writer-wins CRDT engine implementing the engine-neutral `CrdtAdapter` seam with **no `yjs` dependency**, plus a pure-JS client transport (JSON ops over any string duplex — WebSocket, WebView bridge, in-memory). Each register carries a Lamport-clock timestamp + the writing actor's id; merge is deterministic (higher clock wins, equal clock → higher actor id) — a state-based CvRDT, so merging full states or any op subset, in any order, with duplicates, always converges (offline-then-reconnect is just another merge). Scope matches the v1 seam: flat key → scalar registers; rich `Y.Text`/`Y.Array` stay on `@pyreon/sync/yjs`.

Why it matters: PMTC compiles UI + signals, not general algorithm code, so a CRDT engine can't cross by source compilation — the 1:1 path runs the SAME JS engine + transport in a native JS runtime (JavaScriptCore) bridged to native signals, and a tiny dependency-free engine is what embeds cleanly there. It also gives web apps a zero-`yjs` scalar-map option today. `pyreonAdapter()` / `connectPyreonSync(doc, channel)` are the entry points; convergence is bisect-covered at both the engine and wire levels.
