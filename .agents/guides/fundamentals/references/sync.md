# @pyreon/sync

## API

- `syncedSignal({ doc, key, initial })` binds a scalar CRDT entry (create-if-missing); `syncedStore(initial, { doc })` builds a flat store of synced fields. A synced signal is a normal signal (`wrapSignal`); write with `.set(v)`.
- Engine seam: `CrdtAdapter`/`CrdtDoc`/`CrdtMap`, with `FakeCrdtAdapter` as the test double.
- `PyreonCrdtAdapter`/`PyreonCrdtDoc` (main entry): a dependency-free last-writer-wins scalar-map engine (Lamport clock, actor-id tie-break) that PMTC can lower to native. `connectPyreonSync` is its JSON transport; `createNativeSyncHost` bridges it to a native runtime. Rich text/lists stay on Yjs.
- `@pyreon/sync/yjs`: `createYjsDoc`, `syncedText` (Y.Text), `syncedList` (Y.Array, render with keyed `<For>`), `syncedAwareness` (ephemeral presence/cursors), `persistViaIndexedDB`, `connectViaBroadcastChannel`, `connectViaWebSocket`.
- `@pyreon/sync/server`: `createSyncServer({ authorize? })` with a per-room authoritative Y.Doc. The default allows everything; production must supply `authorize`.

## Update loop

- `.set(v)` writes only the CRDT. The map `observe` callback is the single writer of the base signal, for local and remote changes alike.
- Loops are prevented in the transport (it re-broadcasts `LOCAL_ORIGIN` and applies inbound updates as `REMOTE_ORIGIN`), never by gating the observer.

## Seeding and ordering

- The create-if-missing seed defers until first sync when a transport is attached; it is immediate when there is no transport or the doc has already synced. Writing a default before sync lets it tie-break against a peer's real value on Yjs's random client id — a permanent lost update.
- `initial` is shown as the optimistic local value; the CRDT write lands only if the key is still absent after sync. The deferral is cancelled on dispose.
- The seam is doc-owned and engine-neutral: `src/crdt/doc-sync.ts` (`registerDocTransport`, `docHasUnsyncedTransport`, `whenDocSynced`).
- `WebSocketTransport` exposes a reactive `synced` signal and `whenSynced()` (true after the initial state-vector round trip; resets on disconnect).
- Attach the transport and persistence before creating synced signals. Create `syncedAwareness` before connecting.
- Limitation: two fresh peers seeding an empty room with different `initial` values still tie-break. Gate app-level defaults behind `await transport.whenSynced()`.
- Awareness lifecycle is owned by the doc. A view's `dispose()` only detaches its own listener; `doc.destroy()` tears the awareness down.

## Limits

- CRDTs prevent lost updates, not semantic conflicts. A synced app ships roughly 60 KB+ gzipped (Yjs).
