---
"@pyreon/sync": minor
---

Add `@pyreon/sync` — local-first, CRDT-backed sync for signals. A synced signal is just a signal (built on `wrapSignal`), so a remote change becomes one `signal.set` and drives one fine-grained DOM update instead of a re-render.

This first release ships the **engine-independent core**: the `syncedSignal` / `syncedStore` reactive bridge, the engine-neutral `CrdtAdapter` / `CrdtDoc` / `CrdtMap` seam, and an in-memory `FakeCrdtAdapter` + `connectFakeDocs` peer-link for tests and no-engine usage. The update loop has a single source of truth — writes go only to the CRDT and the map observer is the one writer of the base signal; the local echo is deduped by the signal's `Object.is` guard and the network loop is prevented in the transport (never the observer).

v1 binds scalar map fields. Real engine adapters (raw Yjs / a turnkey platform), IndexedDB persistence, a WebSocket transport, and a relay server are phased follow-ups.
