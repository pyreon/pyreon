---
title: "Local-First Sync — API Reference"
description: "Local-first CRDT-backed sync for signals — a synced signal IS a signal, so a remote op drives ONE fine-grained DOM update, not a re-render"
---

# @pyreon/sync — API Reference

> **Generated** from `sync`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [sync](/docs/sync).

A local-first / collaborative sync layer for Pyreon. A synced value is a normal `Signal` (built via `wrapSignal`), so a remote change becomes one `signal.set` → one surgical fine-grained DOM update — never a VDOM re-render + diff. The engine-neutral `CrdtAdapter` seam keeps the reactive bridge engine-free; the real engine (raw Yjs) lives behind `@pyreon/sync/yjs` so importing the core never pulls in `yjs`. Covers offline persistence (IndexedDB), same-origin cross-tab + cross-device WebSocket transport, collaborative text + lists, and a Node/Bun relay with per-room/per-doc authz at `@pyreon/sync/server`. v1 syncs scalar map fields + collaborative `Y.Text` / `Y.Array`.

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`syncedSignal`](#syncedsignal) | function | Bind a Signal&lt;T&gt; to a single scalar entry in a CRDT map. |
| [`syncedStore`](#syncedstore) | function | Build a flat store of synced fields from a plain initial object — the ergonomic layer over syncedSignal. |
| [`SyncedSignal`](#syncedsignal) | type | A Signal&lt;T&gt; bound to a CRDT entry. |
| [`SyncedStore`](#syncedstore) | type | A mapped type — each key of the initial object becomes a SyncedSignal of that field's type, plus a store-level `dispose( |
| [`CrdtAdapter`](#crdtadapter) | type | The engine-neutral seam. |
| [`LOCAL_ORIGIN`](#local-origin) | constant | Transaction-origin tag for a LOCAL write (a `.set` originating on this client). |
| [`REMOTE_ORIGIN`](#remote-origin) | constant | Transaction-origin tag for a REMOTE-applied update (received from a peer/relay). |
| [`FakeCrdtAdapter`](#fakecrdtadapter) | class | An in-memory, dependency-free CrdtAdapter for unit-testing synced stores without standing up a real engine. |
| [`connectFakeDocs`](#connectfakedocs) | function | Link two in-memory FakeCrdtDocs so a write to one propagates to the other — the test analog of a transport. |
| [`createYjsDoc`](#createyjsdoc) | function | Create a CrdtDoc backed by a real Yjs Y.Doc (or wrap an existing one). |
| [`syncedText`](#syncedtext) | function | Bind a Signal&lt;string&gt; to a Yjs Y.Text — a COLLABORATIVE string with character-level CRDT merge. |
| [`syncedList`](#syncedlist) | function | Bind a Signal&lt;T[]&gt; to a Yjs Y.Array — a COLLABORATIVE list with positional CRDT merge. |
| [`syncedAwareness`](#syncedawareness) | function | Reactive EPHEMERAL presence — who's online + their live cursor — over the Yjs awareness protocol, a SEPARATE channel fro |
| [`SyncedAwareness`](#syncedawareness) | type | The reactive presence handle from syncedAwareness. |
| [`PeerState`](#peerstate) | type | One peer's presence entry: its awareness `clientId` (use it as the `<For>` key), its published `state`, and `isLocal` (w |
| [`connectViaBroadcastChannel`](#connectviabroadcastchannel) | function | Same-origin CROSS-TAB sync over BroadcastChannel — edits in one tab appear in another tab of the same origin, no server. |
| [`connectViaWebSocket`](#connectviawebsocket) | function | Sync a YjsCrdtDoc to a relay over WebSocket — the CROSS-DEVICE transport. |
| [`persistViaIndexedDB`](#persistviaindexeddb) | function | Persist a YjsCrdtDoc to IndexedDB so edits survive a reload and the app works offline (thin wrapper over y-indexeddb). |
| [`createSyncServer`](#createsyncserver) | function | Start a Node/Bun WebSocket relay that brokers Yjs sync between clients sharing a room. |
| [`AuthorizeContext`](#authorizecontext) | type | Context passed to the relay's `authorize` hook: the `room` parsed from the URL path, the `token` query-string param (bro |

## API

### syncedSignal `function`

```ts
<T>(options: SyncedSignalOptions<T>) => SyncedSignal<T>
```

Bind a Signal&lt;T&gt; to a single scalar entry in a CRDT map. The return value is a NORMAL signal (via wrapSignal — reads / `_v` / `.direct` all delegate), so the compiler's `_bindText`/`_bindDirect` fast paths and every effect treat it like any signal: a remote op becomes one `base.set` → one fine-grained DOM update. The update loop has a single writer — `.set(v)` writes ONLY the CRDT; the map observer is the one path that writes the base signal (for local AND remote commits); the local echo is an `Object.is` no-op.

**Example**

```tsx
const title = syncedSignal({ doc, key: "title", initial: "Untitled" })
// <h1>{title()}</h1>  — patches in place when any peer edits the title
title()              // "Untitled"  (reactive read)
title.set("Roadmap") // writes the CRDT; the observer drives the DOM update
title.dispose()      // detach observer (auto on onCleanup inside a scope)
```

**Common mistakes**

- Calling `title(newValue)` to write — that reads and ignores the arg like any signal. Use `title.set(newValue)`
- Expecting `initial` to win when the key already exists — it is create-if-missing only; a persisted / peer value is authoritative and `initial` is ignored (the local-first convention)
- Storing an object/array and expecting per-field surgical updates — v1 is scalar (string/number/boolean); whole-value replace works but re-fires per replace. Use `syncedText`/`syncedList` for collaborative collections
- Forgetting `.dispose()` for a module-scope synced signal that outlives any reactive scope (inside a scope it auto-disposes via onCleanup)

**See also:** `syncedStore` · `syncedText` · `syncedList`

---

### syncedStore `function`

```ts
<T extends Record<string, unknown>>(initial: T, options: SyncedStoreOptions) => SyncedStore<T>
```

Build a flat store of synced fields from a plain initial object — the ergonomic layer over syncedSignal. Each field becomes its own SyncedSignal over one shared map, so `store.title()` reads reactively and `store.title.set(v)` writes through the CRDT. A single-key change still produces exactly one base-signal write: every field's observer runs, but only the field whose key changed calls `base.set` (the rest early-return on a cheap `Set.has`).

**Example**

```tsx
const store = syncedStore({ title: "Untitled", done: false }, { doc })
store.title()            // "Untitled"
store.title.set("Ship")  // one CRDT write → one DOM update
store.done.set(true)
store.dispose()          // tear down all fields (or rely on onCleanup in-scope)
```

**Common mistakes**

- Adding a key at runtime — the store's fields are fixed from the `initial` object's keys at construction; reshape by creating a new store
- Sharing one map across two unrelated stores — `{ map }` names the map; one map = one store, or fields collide
- Reading `store` as a plain object snapshot — each field is a SyncedSignal; call it (`store.title()`) to read reactively

**See also:** `syncedSignal`

---

### SyncedSignal `type`

```ts
interface SyncedSignal<T> extends Signal<T> { dispose(): void }
```

A Signal&lt;T&gt; bound to a CRDT entry. Identical to a normal Signal for reads/writes/tracking, plus `dispose()` to detach the CRDT observer (idempotent; auto-called via onCleanup when created inside a reactive scope).

**Example**

```tsx
const s: SyncedSignal<number> = syncedSignal({ doc, key: "n", initial: 0 })
```

**See also:** `syncedSignal`

---

### SyncedStore `type`

```ts
type SyncedStore<T> = { readonly [K in keyof T]: SyncedSignal<T[K]> } & { dispose(): void }
```

A mapped type — each key of the initial object becomes a SyncedSignal of that field's type, plus a store-level `dispose()` that tears down every field's observer.

**Example**

```tsx
const store: SyncedStore<{ title: string }> = syncedStore({ title: "x" }, { doc })
```

**See also:** `syncedStore`

---

### CrdtAdapter `type`

```ts
interface CrdtAdapter { createDoc(): CrdtDoc }  // + CrdtDoc.getMap → CrdtMap, CrdtMap.observe/transact
```

The engine-neutral seam. `CrdtAdapter` / `CrdtDoc` / `CrdtMap` abstract the CLIENT reactive bridge so syncedSignal/syncedStore never import a concrete engine. The bridge depends ONLY on this seam (+ @pyreon/reactivity); the Yjs implementation lives behind `@pyreon/sync/yjs`. Note: the seam ports the bridge, NOT the wire format — persistence/transport/relay are Yjs-coupled, so swapping engines re-platforms the infrastructure, not the bridge.

**Example**

```tsx
function bindTitle(adapter: CrdtAdapter) {
  const doc = adapter.createDoc()
  return syncedSignal({ doc, key: "title", initial: "Untitled" })
}
```

**See also:** `FakeCrdtAdapter` · `createYjsDoc`

---

### LOCAL_ORIGIN `constant`

```ts
const LOCAL_ORIGIN: unique symbol
```

Transaction-origin tag for a LOCAL write (a `.set` originating on this client). The bridge tags its CRDT writes with this; transports use the origin to prevent the NETWORK loop — they re-broadcast LOCAL-origin updates but NEVER a REMOTE-origin one. The bridge observer itself applies every change regardless of origin (the local echo is an Object.is no-op).

**Example**

```tsx
doc.getMap("m").transact(() => map.set("k", v), LOCAL_ORIGIN)
```

**See also:** `REMOTE_ORIGIN`

---

### REMOTE_ORIGIN `constant`

```ts
const REMOTE_ORIGIN: unique symbol
```

Transaction-origin tag for a REMOTE-applied update (received from a peer/relay). Transports apply inbound updates with this origin so they are NOT echoed back, which is what prevents the network loop. Gating the bridge OBSERVER on origin would be a bug — it must apply remote changes to drive the local UI; the loop guard belongs in the transport.

**Example**

```tsx
doc.yDoc.transact(() => Y.applyUpdate(doc.yDoc, bytes), REMOTE_ORIGIN)
```

**See also:** `LOCAL_ORIGIN`

---

### FakeCrdtAdapter `class`

```ts
class FakeCrdtAdapter implements CrdtAdapter { createDoc(): FakeCrdtDoc }
```

An in-memory, dependency-free CrdtAdapter for unit-testing synced stores without standing up a real engine. Pair docs with `connectFakeDocs(a, b)` to simulate two peers in-process. It does NOT do state-vector reconciliation, so it can't model offline-reconnect convergence — use the Yjs adapter (`createYjsDoc` + a transport) for that.

**Example**

```tsx
const a = new FakeCrdtAdapter().createDoc()
const b = new FakeCrdtAdapter().createDoc()
connectFakeDocs(a, b)
const sa = syncedSignal({ doc: a, key: "k", initial: 0 })
const sb = syncedSignal({ doc: b, key: "k", initial: 0 })
sa.set(5) // sb() becomes 5
```

**Common mistakes**

- Using the fake adapter to test offline-reconnect convergence — it has no state-vector merge; use the Yjs adapter for that scenario
- Shipping the fake adapter to production — it is a test double with no persistence or real conflict resolution

**See also:** `connectFakeDocs` · `createYjsDoc`

---

### connectFakeDocs `function`

```ts
(a: FakeCrdtDoc, b: FakeCrdtDoc) => { disconnect(): void }
```

Link two in-memory FakeCrdtDocs so a write to one propagates to the other — the test analog of a transport. Returns a `disconnect()` to simulate going offline.

**Example**

```tsx
const link = connectFakeDocs(a, b)
link.disconnect() // simulate offline
```

**See also:** `FakeCrdtAdapter`

---

### createYjsDoc `function`

```ts
(yDoc?: Y.Doc) => YjsCrdtDoc
```

Create a CrdtDoc backed by a real Yjs Y.Doc (or wrap an existing one). Exported from `@pyreon/sync/yjs` — importing it pulls in `yjs`, which is why it is NOT on the core entry. `.yDoc` exposes the underlying Y.Doc for the transports / persistence helpers.

**Example**

```tsx
import { createYjsDoc, connectViaWebSocket } from "@pyreon/sync/yjs"
const doc = createYjsDoc()
const title = syncedSignal({ doc, key: "title", initial: "Untitled" })
connectViaWebSocket(doc, "wss://sync.example.com/my-room?token=abc")
```

**See also:** `persistViaIndexedDB` · `connectViaWebSocket` · `syncedText`

---

### syncedText `function`

```ts
(doc: YjsCrdtDoc, key: string) => SyncedText
```

Bind a Signal&lt;string&gt; to a Yjs Y.Text — a COLLABORATIVE string with character-level CRDT merge. Unlike syncedSignal (scalar last-writer-wins, which drops the loser's value), two peers editing different regions BOTH keep their edits. Use `.insert(i, s)` / `.delete(i, n)` (positional ops Y.Text merges faithfully) for true concurrent editing; `.set(full)` applies a minimal prefix/suffix diff (one replace) — handy for a controlled `<textarea>` but not a positional merge. Engine-specific (in `@pyreon/sync/yjs`, not behind the seam — collab text is coupled to the CRDT's text type).

**Example**

```tsx
const body = syncedText(doc, "body")
// <textarea value={body()} onInput={e => body.set(e.currentTarget.value)} />
body.insert(0, "Hello ")  // positional — merges with a concurrent peer edit
body.delete(0, 6)
```

**Common mistakes**

- Using `syncedSignal` for a collaboratively-edited string — scalar LWW drops one peer's edit; use `syncedText` so both are kept
- Relying on `.set(fullText)` for concurrent multi-region editing — it is a single prefix/suffix-diff replace, not a positional merge; use `.insert`/`.delete` where concurrency matters

**See also:** `syncedList` · `syncedSignal`

---

### syncedList `function`

```ts
<T>(doc: YjsCrdtDoc, key: string) => SyncedList<T>
```

Bind a Signal&lt;T[]&gt; to a Yjs Y.Array — a COLLABORATIVE list with positional CRDT merge. Concurrent `push`/`insert` from two peers are BOTH kept (no item dropped). Render with a keyed `<For each={() => list()} by={…}>` so a remote change reconciles O(changed). `.push` / `.insert(i, items)` / `.delete(i, count?)` are positional; `.set(next)` does a coarse whole-list replace. Engine-specific (in `@pyreon/sync/yjs`).

**Example**

```tsx
const items = syncedList<string>(doc, "todos")
items.push("buy milk", "walk dog")  // merges with a concurrent peer push
items.insert(0, ["first"])
items.delete(1, 1)
// <For each={() => items()} by={(t) => t}>{(t) => <li>{t}</li>}</For>
```

**Common mistakes**

- Calling `.set(newArray)` for concurrent edits — whole-list replace resolves by that coarse op, not a positional merge; use `.push`/`.insert`/`.delete`
- Rendering with `.map()` instead of a keyed `<For>` — you lose the O(changed) reconcile a remote list change should give

**See also:** `syncedText`

---

### syncedAwareness `function`

```ts
<T extends Record<string, unknown>>(doc: YjsCrdtDoc, initial?: T) => SyncedAwareness<T>
```

Reactive EPHEMERAL presence — who's online + their live cursor — over the Yjs awareness protocol, a SEPARATE channel from the document CRDT (awareness is never merged into the doc and never persisted). Returns read signals (`local` / `others` / `states`) that recompute when any peer joins, leaves, or moves, plus `setLocal` / `setLocalField` to publish your own presence. Wired automatically to whatever transports are (or later get) connected to the doc — they share the doc's single Awareness. The relay is awareness-stateful, so a new client sees existing peers INSTANTLY and a crashed peer is purged on disconnect. Create it BEFORE connecting a transport (the transport peeks for the doc's awareness at connect time).

**Example**

```tsx
import { createYjsDoc, syncedAwareness, connectViaWebSocket } from "@pyreon/sync/yjs"
const doc = createYjsDoc()
const presence = syncedAwareness<{ name: string; cursor?: { x: number; y: number } }>(
  doc, { name: "Vít" },
)
connectViaWebSocket(doc, "wss://sync.example.com/room?token=abc")
// live cursors: window.addEventListener("mousemove", e =>
//   presence.setLocalField("cursor", { x: e.clientX, y: e.clientY }))
// <For each={() => presence.others()} by={p => p.clientId}>
//   {p => <Cursor color={p.state.color} at={p.state.cursor} />}</For>
```

**Common mistakes**

- Putting durable data in awareness — it is EPHEMERAL and never persisted; a peer state vanishes on disconnect. Use syncedSignal/syncedStore/syncedText for data that must survive
- Creating it AFTER connecting a transport — the transport peeks for the doc awareness at connect, so presence created later is not wired. Create syncedAwareness BEFORE connectViaWebSocket / connectViaBroadcastChannel
- Reading `others()` / `local()` outside a reactive scope and expecting it to update — they are signals; read them inside JSX / an effect / a computed so the UI tracks presence changes
- Treating cursor coordinates as exact across clients — they are raw viewport points with no scroll / window-size normalization (good enough for v1; map to content coordinates if you need pixel parity)
- Expecting `dispose()` to announce your departure / tear down the shared awareness — it only detaches THIS view's observer. The TRANSPORT announces departure on disconnect, and the DOC owns teardown (doc.destroy()). So dispose the view freely (a second view + the transports keep working); call doc.destroy() for a full local teardown
- Assuming presence scales to hundreds of peers cheaply — every awareness change rebuilds the full peers snapshot (O(N) in peer count) and re-runs each `others()` consumer; fine for the typical handful-to-dozens of collaborators, but a large cursor swarm will re-render on every mouse move (throttle cursor publishes; this is a v1 limit, not free)

**See also:** `SyncedAwareness` · `PeerState` · `connectViaWebSocket` · `createSyncServer`

---

### SyncedAwareness `type`

```ts
interface SyncedAwareness<T> { setLocal(s: T): void; setLocalField<K extends keyof T>(k: K, v: T[K]): void; local: Signal<T | null>; others: Signal<PeerState<T>[]>; states: Signal<PeerState<T>[]>; awareness: Awareness; dispose(): void }
```

The reactive presence handle from syncedAwareness. `others` is every peer EXCEPT you (the avatars / cursors to render); `states` includes you; `local` is your own published state. `setLocal` / `setLocalField` publish; `awareness` is the raw y-protocols escape hatch; `dispose()` detaches ONLY this view's observer (idempotent; auto-called via onCleanup in a reactive scope) — it does NOT destroy the doc-shared awareness (the doc owns that via doc.destroy()) and does NOT announce departure (the transport does, on disconnect).

**Example**

```tsx
const p: SyncedAwareness<{ name: string }> = syncedAwareness(doc, { name: "Vít" })
p.others()  // PeerState<{ name: string }>[] — other people here
```

**See also:** `syncedAwareness` · `PeerState`

---

### PeerState `type`

```ts
interface PeerState<T> { clientId: number; state: T; isLocal: boolean }
```

One peer's presence entry: its awareness `clientId` (use it as the `<For>` key), its published `state`, and `isLocal` (whether it is you). `others()` returns only `isLocal: false` entries; `states()` returns all.

**Example**

```tsx
<For each={() => presence.others()} by={p => p.clientId}>
  {p => <Avatar name={p.state.name} />}
</For>
```

**See also:** `syncedAwareness` · `SyncedAwareness`

---

### connectViaBroadcastChannel `function`

```ts
(doc: YjsCrdtDoc, channelName: string) => { disconnect(): void }
```

Same-origin CROSS-TAB sync over BroadcastChannel — edits in one tab appear in another tab of the same origin, no server. Includes a minimal state-vector handshake so a late-opening tab catches up. Follows the universal echo rule: a REMOTE-origin update is never re-broadcast, so there is no loop.

**Example**

```tsx
const doc = createYjsDoc()
const link = connectViaBroadcastChannel(doc, "my-doc-room")
// edit in tab A → the same <h1> patches in place in tab B
link.disconnect()
```

**Common mistakes**

- Expecting cross-DEVICE sync — BroadcastChannel is same-origin/same-browser only; use connectViaWebSocket + a relay for cross-device

**See also:** `connectViaWebSocket` · `persistViaIndexedDB`

---

### connectViaWebSocket `function`

```ts
(doc: YjsCrdtDoc, url: string, options?: WebSocketTransportOptions) => WebSocketTransport
```

Sync a YjsCrdtDoc to a relay over WebSocket — the CROSS-DEVICE transport. Sends our state vector on open (relay replies with the diff), then live updates; a REMOTE-origin update is never re-sent (no loop). Reconnects with exponential backoff by default. Uses the global WebSocket (browsers / Node 22+ / Bun / Deno); pass `WebSocketImpl` on older Node. Auth: put a token in the `url` query string — browser WebSockets can't set headers — which the relay's `authorize` hook reads.

**Example**

```tsx
import { connectViaWebSocket, createYjsDoc } from "@pyreon/sync/yjs"
const doc = createYjsDoc()
const t = connectViaWebSocket(doc, "wss://sync.example.com/my-room?token=abc", {
  onConnect: () => console.log("synced"),
})
t.disconnect() // close + stop reconnecting
```

**Common mistakes**

- Trying to set an Authorization header — browser WebSockets can't; pass the token in the URL query string and read it in the relay's `authorize`
- Using it on old Node without a global WebSocket and not passing `WebSocketImpl` — it throws; pass the `ws` package's WebSocket
- Treating a 4401 close as retryable — that is the relay's authz rejection and is terminal; reconnect won't help

**See also:** `createSyncServer` · `connectViaBroadcastChannel`

---

### persistViaIndexedDB `function`

```ts
(doc: YjsCrdtDoc, dbName: string) => YjsPersistence
```

Persist a YjsCrdtDoc to IndexedDB so edits survive a reload and the app works offline (thin wrapper over y-indexeddb). Browser-only — it opens the IndexedDB connection eagerly. AWAIT `.whenSynced` BEFORE creating syncedSignals so create-if-missing adopts the persisted value instead of racing the async load against a fresh seed.

**Example**

```tsx
const doc = createYjsDoc()
const persist = persistViaIndexedDB(doc, "my-app-doc")
await persist.whenSynced  // load persisted state FIRST
const title = syncedSignal({ doc, key: "title", initial: "Untitled" })
```

**Common mistakes**

- Creating syncedSignals before awaiting `.whenSynced` — the fresh seed can race the async load and clobber the persisted value
- Calling it under Node/SSR — it constructs an IndexedDB connection eagerly; importing is safe, calling is browser-only

**See also:** `createYjsDoc` · `syncedSignal`

---

### createSyncServer `function`

```ts
(options: SyncServerOptions) => Promise<SyncServer>
```

Start a Node/Bun WebSocket relay that brokers Yjs sync between clients sharing a room. Keeps one authoritative Y.Doc per room (so a late-joiner catches up), applies each inbound update, and broadcasts to the room's OTHER clients. Server-only (`@pyreon/sync/server` — imports `ws` + `node:http`, never enters a client bundle). The `authorize(ctx)` hook is the per-room/per-doc access gate: return false (or throw) to reject with close code 4401 before any data flows. Rooms are GC'd when the last client leaves — the relay is ephemeral (no persistence); clients keep their own copy. Pass `server` to attach to an existing http.Server instead of opening a port.

**Example**

```tsx
import { createSyncServer } from "@pyreon/sync/server"
const relay = await createSyncServer({
  port: 1234,
  authorize: ({ room, token }) => token === secretFor(room), // REQUIRED in prod
})
// later: await relay.close()
```

**Common mistakes**

- Deploying without an `authorize` hook — the default allows EVERY connection (dev-only); a real deployment MUST supply it or anyone with the room id can read/write
- Importing `@pyreon/sync/server` into client code — it pulls `ws` + `node:http`; it is the server-only subpath by design
- Expecting the relay to persist data — it is ephemeral; durability lives on the clients (persistViaIndexedDB) or an external store

**See also:** `connectViaWebSocket` · `AuthorizeContext`

---

### AuthorizeContext `type`

```ts
interface AuthorizeContext { room: string; token: string | null; req: IncomingMessage }
```

Context passed to the relay's `authorize` hook: the `room` parsed from the URL path, the `token` query-string param (browser WebSockets can't set headers, so auth rides the query string), and the raw HTTP upgrade `req` (read cookies / headers here if you prefer).

**Example**

```tsx
authorize: ({ room, token, req }) => verify(room, token)
```

**See also:** `createSyncServer`

---

## Package-level notes

> **Subpath layout:** `@pyreon/sync` (core bridge — engine-free, universal), `@pyreon/sync/yjs` (real Yjs engine + transports + persistence + collaborative text/lists — pulls in `yjs`), `@pyreon/sync/server` (Node/Bun relay — pulls in `ws` + `node:http`, never import into client code).

> **CRDTs prevent lost UPDATES, not semantic conflicts:** Never market this as 'never lose data'. Scalar `syncedSignal` is last-writer-wins — the loser's value is silently dropped. `syncedText`/`syncedList` keep both peers' ops but the merged result may be semantically nonsensical (interleaved sentences). Real apps still need conflict UX (presence, indicators, optional locking).

> **Bundle weight:** A synced app ships `yjs` (~40KB min+gz) + `y-indexeddb` + the WebSocket client on TOP of the core runtime — realistically ~60KB+ gz. It is off the core hot path (opt-in `/yjs` import) and justified by the capability, but a synced Pyreon app is NOT a 'smaller than Solid' app.

> **Awareness is ephemeral + the relay is stateful for it:** Presence (syncedAwareness — who's here + cursors) rides a SEPARATE channel from doc updates, is NEVER persisted, and is purged the moment a peer disconnects. The relay tracks per-room awareness (a deliberate departure from its otherwise-stateless doc relay) so a new client sees existing peers instantly and a crashed client is cleaned up on socket close. Don't store anything durable in awareness, and create syncedAwareness BEFORE connecting a transport.

> **Authorization is table-stakes:** The relay's `authorize` default ALLOWS everything (dev only). Production MUST gate reads + writes per room/doc. Whole-doc CRDTs make partial (per-field) access genuinely hard — use per-doc rooms or permission-scoped sub-docs.

> **Native / PMTC sync is out of near-term scope:** The `CrdtAdapter` seam keeps a future Loro-via-FFI native engine door open, but compiler WS-emit + a native WS runtime + a CRDT-via-FFI engine are not in scope yet.
