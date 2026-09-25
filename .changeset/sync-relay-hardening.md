---
'@pyreon/sync': minor
---

Harden the sync relay and transports.

- **Relay no longer loses frames sent during an async `authorize`.** The client sends its state vector the moment the socket opens; the relay only started listening after `authorize` resolved, so with any async check the frame was dropped, the relay never answered it, and the client's `synced()` stayed `false` forever. Frames are now buffered and replayed on allow, discarded on reject (a socket that sends more than 256 frames before the verdict is closed with 1008). A client that disconnects during `authorize` no longer leaks a room.
- **Heartbeat.** New `heartbeatIntervalMs` option (default `30_000`, `0` disables): the relay pings every socket and terminates one that missed the previous ping, so half-open connections no longer keep their presence and room alive forever.
- **Presence spoofing refused.** An awareness update naming a clientId owned by another connection is dropped — a client could previously overwrite a peer's presence, and by being recorded as its owner, get the peer's presence purged on its own disconnect.
- **New limits:** `maxPayload` (forwarded to `ws`) and `maxRooms` (a connection that would open a room past the cap is closed with 1013). A per-socket protocol error (e.g. an oversized frame) no longer crashes the relay process.
- **Read-only clients:** `authorize` may return `'read'` — the client receives the document and presence but its document updates are dropped. `AuthorizeResult` is exported.
- **Awareness created after connecting now syncs.** `connectViaWebSocket` and `connectViaBroadcastChannel` looked up the doc's awareness once at connect, so a `syncedAwareness` created later was never sent or received. They now wire it whenever it is created.
- **Behaviour change:** `whenSynced()` now REJECTS when the relay refuses the connection (4401) or after `disconnect()`, instead of never settling.
- **`PyreonCrdtDoc.applyOps` validates inbound ops.** An op whose clock is not a non-negative safe integer, or whose map/key/actor is not a string, is dropped (dev warning) — `Infinity`/`1e308`/string clocks previously out-ranked every future local write permanently. The Swift and Kotlin ports drop negative and overflowing clocks too.
- `syncedSignal.set(v)` skips the CRDT write when the real map already holds `v` (Yjs emitted and broadcast an update for every equal set).
