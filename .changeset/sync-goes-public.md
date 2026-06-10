---
'@pyreon/sync': minor
---

**`@pyreon/sync` is now public.** The local-first / CRDT-backed sync layer ships as a published package after the engine + transport + relay story is complete and hardened.

A synced value is a normal `Signal` (built via `wrapSignal`), so a remote change becomes one `signal.set` → one fine-grained DOM update — never a re-render. Three entry points:

- `@pyreon/sync` — the engine-neutral reactive bridge: `syncedSignal`, `syncedStore`, the `CrdtAdapter` / `CrdtDoc` / `CrdtMap` seam, the `LOCAL_ORIGIN` / `REMOTE_ORIGIN` tags, and an in-memory `FakeCrdtAdapter` + `connectFakeDocs` for dependency-free tests. Depends only on `@pyreon/reactivity`.
- `@pyreon/sync/yjs` — the real Yjs engine (`createYjsDoc`), IndexedDB persistence (`persistViaIndexedDB`), same-origin cross-tab (`connectViaBroadcastChannel`) and cross-device WebSocket (`connectViaWebSocket`) transport, and collaborative text + lists (`syncedText` / `syncedList`). Keeps `yjs` out of the core entry.
- `@pyreon/sync/server` — a Node/Bun relay (`createSyncServer`) with a per-room/per-doc `authorize` gate. Server-only.

v1 syncs scalar map fields plus collaborative `Y.Text` / `Y.Array`. CRDTs prevent lost updates, not semantic conflicts; a synced app adds ~60KB+ gz (`yjs` + `y-indexeddb` + WS client) off the core hot path; the relay's authorization gate is required in production.
