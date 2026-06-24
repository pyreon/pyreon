---
title: Sync
description: Local-first, CRDT-backed sync for Pyreon signals — a synced signal is just a signal, so a remote change drives one surgical fine-grained DOM update.
---

`@pyreon/sync` is a local-first / collaborative sync layer built directly on Pyreon's reactivity. A synced value **is a normal `Signal`** — so when a remote peer changes it, the update becomes one `signal.set`, which drives **one fine-grained DOM update**. No virtual-DOM re-render, no diff. This is the architectural reason signals are the ideal substrate for sync: the surgical-update path you already get for local state is exactly the path a remote op rides.

<PackageBadge name="@pyreon/sync" href="/docs/sync" />

```ts
import { syncedSignal } from '@pyreon/sync'
import { createYjsDoc, connectViaWebSocket } from '@pyreon/sync/yjs'

const doc = createYjsDoc()
const title = syncedSignal({ doc, key: 'title', initial: 'Untitled' })
connectViaWebSocket(doc, 'wss://sync.example.com/my-room?token=abc')

// <h1>{title()}</h1>
// A peer edits the title → this exact <h1> text node patches in place.
title.set('Roadmap') // local edit relays to peers
```

A `syncedList` is a `Signal<T[]>` backed by a `Y.Array` CRDT — read it reactively, mutate it with positional ops, and the render stays fine-grained (adding one item patches one `<li>`):

<Example file="./examples/sync/synced-list-crdt" title="Synced list (CRDT) — a synced value is a signal" />

## What you get

- **`syncedSignal` / `syncedStore`** — bind a signal (or a flat store of signals) to a CRDT map. Indistinguishable from a normal signal to the compiler and every effect.
- **An engine-neutral seam** (`CrdtAdapter` / `CrdtDoc` / `CrdtMap`) so the reactive bridge never imports a concrete CRDT engine — plus an in-memory `FakeCrdtAdapter` for dependency-free unit tests.
- **A real Yjs engine** behind the `@pyreon/sync/yjs` subpath (so `import '@pyreon/sync'` never pulls in `yjs`).
- **Offline persistence** via IndexedDB (`persistViaIndexedDB`).
- **Transports**: same-origin cross-tab (`connectViaBroadcastChannel`), cross-device WebSocket (`connectViaWebSocket`, auto-reconnecting), and an in-memory peer link (`connectYDocs`) for tests / a single-page POC.
- **Collaborative text + lists** (`syncedText` / `syncedList`) with true positional merge — concurrent edits keep *both*.
- **Ephemeral presence + live cursors** (`syncedAwareness`) over the Yjs awareness protocol — a separate, never-persisted channel.
- **A relay server** (`createSyncServer`) for Node/Bun with a per-room/per-doc **authorization gate**.

## Installation

:::code-group

```bash [npm]
npm install @pyreon/sync
```

```bash [bun]
bun add @pyreon/sync
```

```bash [pnpm]
pnpm add @pyreon/sync
```

```bash [yarn]
yarn add @pyreon/sync
```

:::

Peer dependency: `@pyreon/reactivity`. The Yjs engine (`yjs`, `y-indexeddb`, `y-protocols`) and the relay (`ws`) ship as dependencies but are only pulled in when you import the `/yjs` or `/server` subpaths — the core entry stays engine-free.

### Three entry points

The package is split so you only pay for what you import. **Structure your imports around these three subpaths.**

| Import | Runs where | Pulls in | Use for |
| --- | --- | --- | --- |
| `@pyreon/sync` | anywhere (universal) | only `@pyreon/reactivity` | the reactive bridge — `syncedSignal`, `syncedStore`, the `CrdtAdapter` seam, the in-memory test adapter |
| `@pyreon/sync/yjs` | browser / Node 22+ / Bun / Deno | `yjs`, `y-indexeddb`, `y-protocols` | the real engine, transports, persistence, collaborative text/lists, presence |
| `@pyreon/sync/server` | Node / Bun only | `ws`, `node:http` | the relay server — **never import this into client code** |

:::tip
The split is the bundle contract: a component that only does `syncedSignal({ doc, … })` against a doc handed to it never imports `yjs`. Pull in `@pyreon/sync/yjs` at the edge where you actually create the doc and wire transports.
:::

## The mental model

Three layers, bottom to top:

1. **The engine-neutral seam** (`CrdtAdapter` → `CrdtDoc` → `CrdtMap`). A flat, scalar key→value register plus a transaction boundary and an observer. The whole reactive bridge is written against *only* this interface.
2. **The reactive bridge** (`syncedSignal` / `syncedStore`). Wraps a base signal (via `wrapSignal`) so reads/writes/tracking are indistinguishable from a plain signal, with a single CRDT-driven update loop underneath.
3. **The Yjs engine + infrastructure** (`@pyreon/sync/yjs`, `@pyreon/sync/server`). The concrete CRDT, the collaborative text/list/presence types, persistence, transports, and the relay.

The seam is what keeps the bridge engine-free. Note its boundary, though: it ports the **client bridge**, not the wire format. Persistence (`y-indexeddb`), the transports, and the relay are all coupled to the Yjs binary format, so swapping engines later re-platforms the *infrastructure*, not the bridge.

## Quick start — no engine (tests / learning)

The fastest way to understand the model is the in-memory adapter. It needs no server, no `yjs`, and connects two "peers" in-process:

```ts
import { syncedSignal, FakeCrdtAdapter, connectFakeDocs } from '@pyreon/sync'

const a = new FakeCrdtAdapter().createDoc()
const b = new FakeCrdtAdapter().createDoc()
connectFakeDocs(a, b) // simulate a transport between two peers

const titleA = syncedSignal({ doc: a, key: 'title', initial: 'Untitled' })
const titleB = syncedSignal({ doc: b, key: 'title', initial: 'Untitled' })

titleA.set('Roadmap')
titleB() // 'Roadmap' — propagated through the link
```

:::tip
The `FakeCrdtAdapter` is how you unit-test your own synced stores without standing up an engine. It does **not** do state-vector reconciliation, so it can't model offline-reconnect convergence — use the Yjs adapter (`createYjsDoc` + a transport) for that scenario.
:::

:::warning
Don't ship the `FakeCrdtAdapter` to production — it is a test double with no persistence and no real conflict resolution.
:::

## How the loop works (and why it can't echo)

This is the load-bearing design. Get it wrong and you get echo storms or dropped updates. The rule:

> **The observer applies *every* change. The transport prevents the *network* loop.**

A `syncedSignal` wraps a base signal (via `wrapSignal`) and runs a single update loop:

1. **`synced.set(v)` writes ONLY the CRDT** — `doc.transact(() => map.set(key, v), LOCAL_ORIGIN)`. It does **not** write the base signal directly (doing both would double-apply).
2. **The map observer is the one writer of the base signal.** It fires at the end of *every* committed transaction — local *and* remote — and calls `base.set(map.get(key))`.
3. **The local echo is harmless.** When the observer re-reports the value the base already holds, `base.set` is an `Object.is` no-op (true for scalar values).
4. **The network loop is prevented in the transport**, never in the observer: a transport applies inbound updates tagged `REMOTE_ORIGIN`, and it re-broadcasts only `LOCAL_ORIGIN` updates — so a received update is never echoed back to peers.

```ts
import { LOCAL_ORIGIN, REMOTE_ORIGIN } from '@pyreon/sync'
// LOCAL_ORIGIN  — a write originating on this client (re-broadcast by transports)
// REMOTE_ORIGIN — an update applied from a peer/relay (NEVER re-broadcast)
```

These origins are `unique symbol`s; transports compare them by identity. The bridge tags its writes with `LOCAL_ORIGIN`, and transports apply inbound updates under `REMOTE_ORIGIN` so the same tag also stops a *sibling* transport on the same doc from re-emitting a received change (the cross-transport WS↔BroadcastChannel loop guard).

:::warning
A tempting "fix" — *ignore observer callbacks whose origin is local* — is a **bug**: it would drop the local UI update entirely. The observer must apply local changes too; the origin guard belongs in the transport.
:::

## `syncedSignal` — scalar fields

A scalar field (string / number / boolean) syncs with **last-writer-wins** semantics:

```ts
import { syncedSignal } from '@pyreon/sync'

const count = syncedSignal({ doc, key: 'count', initial: 0 })
count()           // reactive read
count.set(5)      // one CRDT write → one DOM update
count.update((n) => n + 1)
count.dispose()   // detach the observer (auto via onCleanup inside a scope)
```

`SyncedSignalOptions` accepts:

- `doc` — the `CrdtDoc` holding the value.
- `key` — the key within the map.
- `initial` — the seed value (see below).
- `map?` — the named map within the doc (defaults to `'pyreon'`, exported as `DEFAULT_MAP`). One map = one logical store.

The `initial` value is **create-if-missing only**: if the key already exists (hydrated from persistence or received from a peer), the existing value wins and `initial` is ignored. This is the local-first convention — a fresh peer's default never clobbers established state.

:::warning
**Calling `count(5)` does not write.** Like any signal, calling it with an argument reads and ignores the arg. Use `count.set(5)` / `count.update(fn)`.
:::

:::warning
**`initial` is not "set to this value."** It is create-if-missing. A persisted or peer value is authoritative; `initial` only seeds an absent key. If you need to *force* a value, call `.set` after creation.
:::

:::note
Scalar `syncedSignal` is for strings, numbers, and booleans. You *can* store a whole object/array, but it is compared by reference, so any change is a coarse whole-value replace that re-fires per replace — and last-writer-wins drops the loser. For collaborative collections, reach for `syncedText` / `syncedList` (below).
:::

### Lifecycle

A `SyncedSignal<T>` is a `Signal<T>` plus a `dispose()` that detaches the CRDT observer (idempotent). Inside a reactive scope (a component body / effect) it **auto-disposes via `onCleanup`** — you only call `dispose()` manually for a module-scope synced signal that outlives any scope.

```ts
const s = syncedSignal({ doc, key: 'n', initial: 0 })
// ...later, for a module-scope signal:
s.dispose()
```

## `syncedStore` — a flat store of fields

The ergonomic layer over `syncedSignal`: build a store of synced fields from a plain initial object. Each field becomes its own `SyncedSignal` over one shared map.

```ts
import { syncedStore } from '@pyreon/sync'

const store = syncedStore({ title: 'Untitled', done: false }, { doc })
store.title()           // 'Untitled'
store.title.set('Ship') // one CRDT write → one DOM update
store.done.set(true)
store.dispose()         // tear down all fields (or rely on onCleanup in-scope)
```

A single-key change still produces exactly one base-signal write: every field's observer runs, but only the field whose key changed actually calls `base.set` — the rest early-return on a cheap `Set.has`. The "one op → one update" invariant holds across the whole store.

:::warning
The store's fields are **fixed from the `initial` object's keys at construction** — you can't add a key at runtime. Reshape by creating a new store. And `dispose` is a reserved field name (it tears down the store), so a field literally named `dispose` throws.
:::

:::warning
**`store` is not a plain snapshot.** Each property is a `SyncedSignal` — call it (`store.title()`) to read reactively, don't treat the store object as a value.
:::

## The engine seam

The bridge depends only on an engine-neutral interface, so `syncedSignal` / `syncedStore` never import a concrete CRDT:

```ts
import type { CrdtAdapter, CrdtDoc, CrdtMap } from '@pyreon/sync'

function bindTitle(adapter: CrdtAdapter) {
  const doc = adapter.createDoc()
  return syncedSignal({ doc, key: 'title', initial: 'Untitled' })
}
```

- `CrdtAdapter` — the factory: `createDoc(): CrdtDoc`.
- `CrdtDoc` — a collection of named maps plus the transaction boundary: `getMap(name)`, `transact(fn, origin?)`, `destroy()`.
- `CrdtMap` — a keyed scalar register: `get` / `set` / `has` / `keys` / `observe`. Writes must happen inside a `transact` callback so they carry an origin and fire observers once per transaction.

The Yjs implementation (`YjsAdapter` / `YjsCrdtDoc`) lives behind `@pyreon/sync/yjs`. The seam was shaped to match Yjs's own model exactly (`doc.transact(fn, origin)`, `Y.Map.observe` reporting the changed-key set + the transaction origin), so the bridge runs over a real `Y.Doc` unchanged.

:::note
**The seam ports the bridge, not the wire format.** Persistence, transport, and the relay are Yjs-coupled. Swapping engines later re-platforms the infrastructure, not the client bridge.
:::

## Real engine: Yjs

Everything beyond the in-memory adapter lives at `@pyreon/sync/yjs`:

```ts
import { createYjsDoc } from '@pyreon/sync/yjs'

const doc = createYjsDoc()        // fresh Y.Doc, wrapped as a YjsCrdtDoc
const wrapped = createYjsDoc(existingYDoc) // or wrap an existing Y.Doc
doc.yDoc                          // the underlying Y.Doc (for transports/persistence)
```

`createYjsDoc` returns a `YjsCrdtDoc` — a `CrdtDoc` whose `.yDoc` exposes the underlying Yjs document that the transports and persistence helpers wire onto. The class (`YjsCrdtDoc`), the adapter (`YjsAdapter`), and a shared instance (`yjsAdapter`) are also exported for advanced use, but `createYjsDoc()` is the entry point you'll reach for.

### Collaborative text — `syncedText`

For a string that two people edit at once, a scalar `syncedSignal` is wrong: last-writer-wins drops one editor's work. `syncedText` binds a `Signal<string>` to a Yjs `Y.Text` — a **character-level CRDT** where concurrent edits in different regions are *both* kept:

```ts
import { syncedText } from '@pyreon/sync/yjs'

const body = syncedText(doc, 'body')

// Positional ops — Y.Text merges these faithfully across peers:
body.insert(0, 'Hello ')
body.delete(0, 6)

// Or bind a controlled textarea (uses a minimal prefix/suffix diff):
// <textarea
//   value={body()}
//   onInput={(e) => body.set(e.currentTarget.value)}
// />
```

`SyncedText` is a `Signal<string>` plus `.insert(index, content)`, `.delete(index, length)`, and `.dispose()`.

:::warning
**Don't use `syncedSignal` for a collaboratively-edited string** — scalar LWW drops one peer's edit. Use `syncedText` so both are kept.
:::

:::tip
`.insert` / `.delete` are positional and merge concurrently with no lost characters. `.set(fullText)` applies a single minimal common-prefix/suffix-diff replace — convenient for a controlled `<textarea>`'s single-region edits, but it is not a positional merge, so prefer the positional ops where real concurrency matters.
:::

### Collaborative lists — `syncedList`

`syncedList` binds a `Signal<T[]>` to a Yjs `Y.Array` — positional merge, so concurrent `push` / `insert` from two peers are both kept:

```ts
import { syncedList } from '@pyreon/sync/yjs'

const todos = syncedList<string>(doc, 'todos')
todos.push('buy milk', 'walk dog')  // merges with a concurrent peer push
todos.insert(0, ['first'])
todos.delete(1, 1)                   // delete count defaults to 1
```

`SyncedList<T>` is a `Signal<T[]>` plus `.push(...items)`, `.insert(index, items)`, `.delete(index, count?)`, and `.dispose()`. Render it with a **keyed `<For>`** so a remote change reconciles `O(changed)`, not a full re-render — `Y.Array.toArray()` returns a fresh array on each change, which the keyed list diffs against:

```tsx
<For each={() => todos()} by={(t) => t}>
  {(t) => <li>{t}</li>}
</For>
```

:::warning
**`.set(nextArray)` is a coarse whole-list replace** (clear + insert), not a positional merge — a concurrent replace from two peers resolves by that coarse op. Use `.push` / `.insert` / `.delete` where concurrency matters. And render with a keyed `<For>`, not `.map()`, or you lose the `O(changed)` reconcile a remote list change should give.
:::

### Presence & live cursors — `syncedAwareness`

`syncedAwareness` gives you **ephemeral presence** — who's online and their live cursor — over the Yjs *awareness* protocol. This is a **separate channel** from the document: awareness is **never merged into the doc and never persisted**, and a peer's state is purged the moment it disconnects. It's the right tool for "3 people here" avatars and live collaborator cursors; it is the **wrong** tool for anything durable (use `syncedSignal` / `syncedStore` / `syncedText` for that).

```tsx
import { createYjsDoc, syncedAwareness, connectViaWebSocket } from '@pyreon/sync/yjs'

const doc = createYjsDoc()
// Create presence BEFORE connecting — the transport wires the doc's awareness at connect time.
const presence = syncedAwareness<{ name: string; color: string; cursor?: { x: number; y: number } }>(
  doc,
  { name: 'Vít', color: '#e8590c' },
)
connectViaWebSocket(doc, 'wss://sync.example.com/room?token=abc')

// Publish a live cursor (throttle the high-frequency write):
window.addEventListener('mousemove', (e) =>
  presence.setLocalField('cursor', { x: e.clientX, y: e.clientY }),
)

// Render everyone ELSE's cursors + avatars (`others` excludes you):
<For each={() => presence.others()} by={(p) => p.clientId}>
  {(p) => <Cursor color={p.state.color} name={p.state.name} at={p.state.cursor} />}
</For>
```

The handle is a `SyncedAwareness<T>`:

- `presence.others()` — every **other** peer (the avatars / cursors to render). `presence.states()` includes you; `presence.local()` is your own published state. All three are signals — read them inside JSX / an effect / a computed so the UI tracks presence changes.
- `setLocal(state)` replaces your whole presence; `setLocalField(key, value)` patches one field (ideal for a throttled cursor).
- `presence.awareness` is the raw `y-protocols` `Awareness` escape hatch for advanced use.
- Each peer entry is a `PeerState<T>`: `{ clientId, state, isLocal }`. Use `clientId` as the `<For>` key.

The relay is **awareness-stateful**: a client that joins sees existing peers **instantly** (the relay replays the room's presence on connect), and a client that **crashes** is purged on socket close — so no ghost cursor lingers.

#### Awareness lifecycle (read this)

The awareness is **owned by the doc**, shared by every transport and every `syncedAwareness` view (one `Awareness` per `Y.Doc`).

- `presence.dispose()` only detaches **that view's** observer (idempotent; auto-called via `onCleanup` in a reactive scope). You can safely dispose one view while another keeps tracking and the transports keep working — it does **not** tear down the shared awareness and does **not** announce your departure.
- The **transport** announces departure on disconnect (`disconnect()` / socket close), and the relay's socket-close cleanup is the real guarantee a crashed client's cursor disappears.
- `doc.destroy()` performs the full teardown (announces departure, destroys the shared awareness).

:::warning
**Create `syncedAwareness` *before* connecting a transport.** The transport peeks for the doc's awareness at connect time, so presence created afterwards isn't wired. (`connectViaWebSocket` / `connectViaBroadcastChannel` "peek, don't create" — a doc-only app pays zero awareness overhead.)
:::

:::warning
**Awareness is ephemeral** — don't store durable data in it; a peer's state vanishes on disconnect. Use `syncedSignal` / `syncedStore` / `syncedText` for anything that must survive.
:::

:::warning
**Cursor coordinates are raw viewport points** — there's no scroll / window-size normalization (fine for v1; map to content coordinates if you need pixel parity across differently-sized windows). And `dispose()` is view-only — it does *not* announce departure or destroy the shared awareness; the transport / `doc.destroy()` own those.
:::

:::warning
**Presence is O(N) in peer count.** Every awareness change rebuilds the full peers snapshot and re-runs each `others()` consumer — fine for the typical handful-to-dozens of collaborators, but throttle cursor publishes (above) so a large swarm doesn't re-render on every mouse move. This is a v1 limit, not free.
:::

## Offline persistence — IndexedDB

`persistViaIndexedDB` makes edits survive a reload and lets the app work offline (a thin wrapper over `y-indexeddb`). It is **browser-only** — it opens the IndexedDB connection eagerly (importing the module under Node/SSR is safe; only calling it touches IndexedDB).

```ts
import { createYjsDoc, persistViaIndexedDB } from '@pyreon/sync/yjs'
import { syncedSignal } from '@pyreon/sync'

const doc = createYjsDoc()
const persist = persistViaIndexedDB(doc, 'my-app-doc')

await persist.whenSynced // ← load persisted state FIRST
const title = syncedSignal({ doc, key: 'title', initial: 'Untitled' })

// ...later, to stop persisting and close the connection:
await persist.destroy()
```

`YjsPersistence` is `{ whenSynced: Promise<void>; destroy(): Promise<void> }`.

:::danger
Always `await persist.whenSynced` **before** creating any `syncedSignal`. Otherwise the fresh `initial` seed races the async load and can clobber the persisted value — create-if-missing only adopts the persisted value if it's already loaded.
:::

## Transports

Each transport wires a doc's update stream to a wire and follows the same handshake (exchange a state vector → reply with the diff → live updates) and the same echo rule (a `REMOTE`-origin update is never re-sent).

### Cross-tab — `connectViaBroadcastChannel`

Same-origin, same-browser sync between tabs, no server. A minimal state-vector handshake catches a late-opening tab up; if presence is in use it rides the same channel.

```ts
import { connectViaBroadcastChannel, createYjsDoc } from '@pyreon/sync/yjs'

const doc = createYjsDoc()
const link = connectViaBroadcastChannel(doc, 'my-doc-room')
// edit in tab A → the same <h1> patches in place in tab B
link.disconnect()
```

Returns `{ disconnect() }`.

:::warning
BroadcastChannel is **same-origin / same-browser only** — it does not do cross-*device* sync. Use `connectViaWebSocket` + a relay for that.
:::

### Cross-device — `connectViaWebSocket`

Point a doc at a relay over WebSocket. On open it sends our state vector (the relay replies with the diff), then streams live updates; awareness rides the same socket on a separate message type. It reconnects with exponential backoff by default.

```ts
import { connectViaWebSocket, createYjsDoc } from '@pyreon/sync/yjs'

const doc = createYjsDoc()
const transport = connectViaWebSocket(
  doc,
  'wss://sync.example.com/my-room?token=abc',
  {
    reconnect: true,        // default
    maxBackoffMs: 10_000,   // default cap on backoff
    onConnect: () => console.log('synced'),
    onDisconnect: () => console.log('offline'),
  },
)

transport.connected    // boolean — whether the socket is currently open
transport.disconnect() // close + stop reconnecting (idempotent)
```

`WebSocketTransportOptions`: `reconnect?`, `maxBackoffMs?`, `WebSocketImpl?`, `onConnect?`, `onDisconnect?`. The transport handle is `{ disconnect(); connected }`.

:::warning
**Auth rides the query string, not a header.** Browser `WebSocket`s cannot set request headers, so put the token in the URL (`?token=…`); the relay's `authorize` hook reads it.
:::

:::warning
**A close with code `4401` is the relay's authz rejection — it is terminal.** The transport stops reconnecting on `4401`; retrying won't help. Fix the token / access, then create a fresh transport.
:::

On runtimes without a global `WebSocket` (older Node), pass an implementation — otherwise `connectViaWebSocket` throws:

```ts
import { WebSocket } from 'ws'
connectViaWebSocket(doc, url, { WebSocketImpl: WebSocket })
```

### In-memory peer link — `connectYDocs`

The real-Yjs analog of `connectFakeDocs` — wire two `YjsCrdtDoc`s into a live in-process link. Unlike the fake adapter it does a genuine state merge on connect, so it **can** model offline-reconnect convergence: two docs that diverged while disconnected converge on reconnect with no lost update. Handy for tests and a single-page proof-of-concept where you want real Yjs semantics but no server.

```ts
import { createYjsDoc, connectYDocs } from '@pyreon/sync/yjs'

const a = createYjsDoc()
const b = createYjsDoc()
const link = connectYDocs(a, b) // initial state merge both ways + live relay
// ...edits on a now appear on b (and vice versa)
link.disconnect()               // detach the live relay; a later reconnect re-merges
```

Returns `{ disconnect() }`.

## Relay server

`createSyncServer` is a Node/Bun WebSocket relay (`@pyreon/sync/server` — server-only; it imports `ws` + `node:http`). It keeps **one authoritative `Y.Doc` per room** so a late-joiner catches up, applies each inbound update, and broadcasts to the room's *other* clients. Rooms are garbage-collected when their last client leaves.

```ts
import { createSyncServer } from '@pyreon/sync/server'

const relay = await createSyncServer({
  port: 1234,
  authorize: ({ room, token }) => token === secretFor(room), // REQUIRED in prod
})

relay.port  // resolved port (even when you pass port: 0)
relay.rooms // number of active rooms
await relay.close()
```

`SyncServerOptions`: `port?`, `host?`, `server?` (attach mode — below), `authorize?`. The handle (`SyncServer`) is `{ port; rooms; close() }`.

The room id is parsed from the URL path (`wss://host/<room>`) and the token from the `?token=` query param. The relay also brokers **awareness** statefully — it tracks per-room presence so a new client sees existing peers instantly and a crashed client's states are purged on socket close. It is robust against malformed frames: a garbage update from one client is dropped rather than crashing the room.

### Authorization is not optional

The `authorize(ctx)` hook is the per-room/per-doc access gate. Return `false` (or throw) to reject the connection — the socket closes with code **4401** before any document data is sent or received.

```ts
authorize: ({ room, token, req }) => {
  // room  — parsed from the URL path (wss://host/<room>)
  // token — the ?token= query param (or null)
  // req   — the raw HTTP upgrade request (read cookies/headers here if you prefer)
  return verifyAccess(room, token)
}
```

`AuthorizeContext` is `{ room: string; token: string | null; req: IncomingMessage }`. The hook may be async (`Promise<boolean>`); a throw inside it is treated as a rejection.

:::danger
The default `authorize` **allows every connection** — suitable only for local/dev. A real deployment **must** supply this, or anyone with the room id can read and write the whole document. Whole-document CRDTs make *partial* (per-field) access genuinely hard; use per-doc rooms or permission-scoped sub-docs.
:::

:::warning
**Never import `@pyreon/sync/server` into client code.** It pulls `ws` + `node:http`; it is the server-only subpath by design.
:::

### Sharing a port with an existing server

Pass an existing `http.Server` to add WebSocket upgrade handling without opening a new port (the caller owns `server.listen()`; `port` is ignored in this mode):

```ts
import { createServer } from 'node:http'
import { createSyncServer } from '@pyreon/sync/server'

const http = createServer(/* your HTTP app */)
await createSyncServer({ server: http })
http.listen(3000)
```

:::note
The relay is **ephemeral** — it holds no persistence. Durability lives on the clients (`persistViaIndexedDB`) or in an external store you add. A reconnecting client re-syncs from whichever peer (or the relay's in-memory room doc) still holds the room.
:::

## End-to-end: a collaborative document

```tsx
import { syncedSignal } from '@pyreon/sync'
import {
  createYjsDoc,
  syncedText,
  syncedAwareness,
  persistViaIndexedDB,
  connectViaWebSocket,
} from '@pyreon/sync/yjs'

async function CollabDoc() {
  const doc = createYjsDoc()

  // 1. Load persisted state first.
  const persist = persistViaIndexedDB(doc, 'collab-doc')
  await persist.whenSynced

  // 2. Bind reactive fields (scalar + collaborative text).
  const title = syncedSignal({ doc, key: 'title', initial: 'Untitled' })
  const body = syncedText(doc, 'body')

  // 3. Set up presence BEFORE going live.
  const presence = syncedAwareness<{ name: string }>(doc, { name: 'Vít' })

  // 4. Go live across devices.
  connectViaWebSocket(doc, 'wss://sync.example.com/doc-42?token=abc')

  return (
    <article>
      <header>
        <For each={() => presence.others()} by={(p) => p.clientId}>
          {(p) => <span class="avatar">{p.state.name}</span>}
        </For>
      </header>
      <h1>{title()}</h1>
      <textarea
        value={body()}
        onInput={(e) => body.set(e.currentTarget.value)}
      />
    </article>
  )
}
```

## Testing synced code

Use the in-memory adapter — no engine, no server, fully synchronous:

```ts
import { syncedStore, FakeCrdtAdapter, connectFakeDocs } from '@pyreon/sync'

test('two peers converge', () => {
  const a = new FakeCrdtAdapter().createDoc()
  const b = new FakeCrdtAdapter().createDoc()
  const link = connectFakeDocs(a, b)

  const sa = syncedStore({ title: 'x' }, { doc: a })
  const sb = syncedStore({ title: 'x' }, { doc: b })

  sa.title.set('y')
  expect(sb.title()).toBe('y')

  link.disconnect() // simulate going offline
})
```

`connectFakeDocs(a, b)` returns `{ disconnect() }`. For **offline-reconnect convergence** (which the fake adapter can't model — it has no state-vector merge), use `createYjsDoc` with `connectYDocs` or a real transport.

## Honest limits

Sync is a powerful capability, but be precise about what it does and doesn't guarantee:

- **CRDTs prevent lost *updates*, not semantic conflicts.** Never market this as "never lose data." Scalar `syncedSignal` is last-writer-wins — the loser's value is silently dropped. `syncedText` / `syncedList` keep both peers' operations, but the merged result can be semantically nonsensical (two sentences interleaved). Real apps still need conflict UX: presence, change indicators, optional field locking.
- **It is not free weight.** A synced app ships `yjs` (~40KB min+gz) + `y-indexeddb` + `y-protocols` + the WebSocket client on top of the runtime — realistically **~60KB+ gzipped**. It is off the core hot path (an opt-in `/yjs` import) and justified by the capability, but a synced Pyreon app is not a "smaller than Solid" app.
- **Presence is O(N) in peer count.** Every awareness change rebuilds the full peers snapshot and re-runs each `others()` consumer — fine for dozens of collaborators, but throttle cursor publishes for large swarms (a v1 limit).
- **Authorization is table-stakes.** The relay's default allows everything; production must gate per room/doc. Whole-document CRDTs make partial access hard — use per-doc rooms or permission-scoped sub-docs.
- **Native (PMTC) sync is out of near-term scope.** The `CrdtAdapter` seam keeps a future Loro-via-FFI engine door open, but compiler WebSocket-emit + a native WS runtime + a CRDT-via-FFI engine are not in scope yet.

## API reference

### `@pyreon/sync` (core bridge)

| Export | Kind | Summary |
| --- | --- | --- |
| `syncedSignal(options)` | function | Bind a `Signal<T>` to a scalar CRDT map entry. Returns a `SyncedSignal<T>`. |
| `syncedStore(initial, options)` | function | A flat store of synced fields over one map. Returns a `SyncedStore<T>`. |
| `SyncedSignal<T>` | type | `Signal<T>` + `dispose()`. |
| `SyncedSignalOptions<T>` | type | `{ doc; key; initial; map? }`. |
| `SyncedStore<T>` | type | `{ [K in keyof T]: SyncedSignal<T[K]> }` + `dispose()`. |
| `SyncedStoreOptions` | type | `{ doc; map? }`. |
| `DEFAULT_MAP` | constant | The default map name (`'pyreon'`) when `map` is omitted. |
| `CrdtAdapter` / `CrdtDoc` / `CrdtMap` | type | The engine-neutral seam. |
| `CrdtOrigin` | type | A transaction-origin token (compared by identity). |
| `LOCAL_ORIGIN` / `REMOTE_ORIGIN` | constant | Transaction-origin tags (the transport's loop guard). |
| `FakeCrdtAdapter` | class | In-memory test adapter — `createDoc()`. |
| `FakeCrdtDoc` | class | The doc produced by the fake adapter. |
| `fakeAdapter` | constant | A shared `FakeCrdtAdapter` instance. |
| `connectFakeDocs(a, b)` | function | Link two in-memory fake docs; returns `{ disconnect() }`. |

### `@pyreon/sync/yjs` (engine)

| Export | Kind | Summary |
| --- | --- | --- |
| `createYjsDoc(yDoc?)` | function | A `YjsCrdtDoc` backed by a real Yjs `Y.Doc` (or wrap an existing one). |
| `YjsCrdtDoc` | class | The Yjs `CrdtDoc`; `.yDoc` exposes the underlying `Y.Doc`. |
| `YjsAdapter` | class | The Yjs `CrdtAdapter`. |
| `yjsAdapter` | constant | A shared `YjsAdapter` instance. |
| `syncedText(doc, key)` | function | Collaborative string (`Y.Text`, character merge). |
| `syncedList(doc, key)` | function | Collaborative list (`Y.Array`, positional merge). |
| `syncedAwareness(doc, initial?)` | function | Ephemeral presence + live cursors (never persisted). |
| `SyncedText` / `SyncedList<T>` | type | Collaborative-text / list signal handles. |
| `SyncedAwareness<T>` / `PeerState<T>` | type | Presence handle + a single peer's entry. |
| `getDocAwareness(doc)` / `peekDocAwareness(doc)` | function | The doc's `Awareness` (get-or-create / peek). Advanced. |
| `persistViaIndexedDB(doc, dbName)` | function | Offline durability (browser-only). Returns `YjsPersistence`. |
| `connectViaBroadcastChannel(doc, name)` | function | Same-origin cross-tab transport; `{ disconnect() }`. |
| `connectViaWebSocket(doc, url, options?)` | function | Cross-device transport (auto-reconnect); `{ disconnect(); connected }`. |
| `connectYDocs(a, b)` | function | In-memory peer link (real-Yjs; models reconnect convergence); `{ disconnect() }`. |
| `WebSocketTransport` / `WebSocketTransportOptions` | type | Transport handle + options. |
| `YjsPersistence` | type | `{ whenSynced; destroy() }`. |

### `@pyreon/sync/server` (relay)

| Export | Kind | Summary |
| --- | --- | --- |
| `createSyncServer(options)` | function | Node/Bun WebSocket relay with `authorize` gate. Returns `Promise<SyncServer>`. |
| `SyncServerOptions` | type | `{ port?; host?; server?; authorize? }`. |
| `SyncServer` | type | `{ port; rooms; close() }`. |
| `AuthorizeContext` | type | `{ room; token; req }` passed to `authorize`. |
