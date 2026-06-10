---
title: Sync
description: Local-first, CRDT-backed sync for Pyreon signals — a synced signal is just a signal, so a remote change drives one surgical fine-grained DOM update.
---

# @pyreon/sync

Local-first, collaborative sync built directly on Pyreon's reactivity. A synced value **is a normal `Signal`** — so when a remote peer changes it, the update becomes one `signal.set`, which drives **one fine-grained DOM update**. No virtual-DOM re-render, no diff. This is the architectural reason signals are the ideal substrate for sync: the surgical-update path you already get for local state is exactly the path a remote op rides.

```ts
import { syncedSignal } from '@pyreon/sync'
import { createYjsDoc, connectViaWebSocket } from '@pyreon/sync/yjs'

const doc = createYjsDoc()
const title = syncedSignal({ doc, key: 'title', initial: 'Untitled' })
connectViaWebSocket(doc, 'wss://sync.example.com/my-room?token=abc')

// <h1>{() => title()}</h1>
// A peer edits the title → this exact <h1> text node patches in place.
title.set('Roadmap') // local edit relays to peers
```

## What you get

- **`syncedSignal` / `syncedStore`** — bind a signal (or a flat store of signals) to a CRDT map. Indistinguishable from a normal signal to the compiler and every effect.
- **An engine-neutral seam** (`CrdtAdapter`) so the reactive bridge never imports a concrete CRDT engine — plus an in-memory `FakeCrdtAdapter` for dependency-free unit tests.
- **A real Yjs engine** behind the `@pyreon/sync/yjs` subpath (so `import '@pyreon/sync'` never pulls in `yjs`).
- **Offline persistence** via IndexedDB (`persistViaIndexedDB`).
- **Transports**: same-origin cross-tab (`connectViaBroadcastChannel`) and cross-device WebSocket (`connectViaWebSocket`, auto-reconnecting).
- **Collaborative text + lists** (`syncedText` / `syncedList`) with true positional merge — concurrent edits keep *both*.
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

Peer dependency: `@pyreon/reactivity`. The Yjs engine (`yjs`, `y-indexeddb`) and the relay (`ws`) ship as dependencies but are only pulled in when you import the `/yjs` or `/server` subpaths.

### Three entry points

| Import | Runs where | Pulls in | Use for |
| --- | --- | --- | --- |
| `@pyreon/sync` | anywhere (universal) | only `@pyreon/reactivity` | the reactive bridge — `syncedSignal`, `syncedStore`, the `CrdtAdapter` seam, the test adapter |
| `@pyreon/sync/yjs` | browser / Node 22+ / Bun / Deno | `yjs`, `y-indexeddb` | the real engine, transports, persistence, collaborative text/lists |
| `@pyreon/sync/server` | Node / Bun only | `ws`, `node:http` | the relay server — **never import this into client code** |

## Quick start — no engine (tests / learning)

The fastest way to understand the model is the in-memory adapter. It needs no server, no `yjs`, and connects two "peers" in-process:

```ts
import {
  syncedSignal,
  FakeCrdtAdapter,
  connectFakeDocs,
} from '@pyreon/sync'

const a = new FakeCrdtAdapter().createDoc()
const b = new FakeCrdtAdapter().createDoc()
connectFakeDocs(a, b) // simulate a transport between two peers

const titleA = syncedSignal({ doc: a, key: 'title', initial: 'Untitled' })
const titleB = syncedSignal({ doc: b, key: 'title', initial: 'Untitled' })

titleA.set('Roadmap')
titleB() // 'Roadmap' — propagated through the link
```

:::tip
The `FakeCrdtAdapter` is how you unit-test your own synced stores without standing up an engine. It does **not** do state-vector reconciliation, so it can't model offline-reconnect convergence — use the Yjs adapter for that.
:::

## How the loop works (and why it can't echo)

This is the load-bearing design. Get it wrong and you get echo storms or dropped updates. The rule:

> **The observer applies *every* change. The transport prevents the *network* loop.**

A `syncedSignal` wraps a base signal (via `wrapSignal`) and runs a single update loop:

1. **`synced.set(v)` writes ONLY the CRDT** — `doc.transact(() => map.set(key, v), LOCAL_ORIGIN)`. It does **not** write the base signal directly (doing both would double-apply).
2. **The map observer is the one writer of the base signal.** It fires at every committed transaction — local *and* remote — and calls `base.set(map.get(key))`.
3. **The local echo is harmless.** When the observer re-reports the value the base already holds, `base.set` is an `Object.is` no-op (true for scalar values).
4. **The network loop is prevented in the transport**, never in the observer: a transport applies inbound updates tagged `REMOTE_ORIGIN`, and it re-broadcasts only `LOCAL_ORIGIN` updates — so a received update is never echoed back to peers.

```ts
import { LOCAL_ORIGIN, REMOTE_ORIGIN } from '@pyreon/sync'
// LOCAL_ORIGIN  — a write originating on this client
// REMOTE_ORIGIN — an update applied from a peer/relay (never re-broadcast)
```

:::warning
A tempting "fix" — *ignore observer callbacks whose origin is local* — is a **bug**: it would drop the local UI update entirely. The observer must apply local changes too; the origin guard belongs in the transport.
:::

## The engine seam

The bridge depends only on an engine-neutral interface, so `syncedSignal` / `syncedStore` never import a concrete CRDT:

```ts
import type { CrdtAdapter, CrdtDoc, CrdtMap } from '@pyreon/sync'
```

The Yjs implementation lives behind `@pyreon/sync/yjs`. The seam buys you **client-bridge portability** — but note its boundary: persistence (`y-indexeddb`), transport, and the relay are coupled to the Yjs wire format. Swapping engines later re-platforms the *infrastructure*, not the bridge.

## Real engine: Yjs

Everything beyond the in-memory adapter lives at `@pyreon/sync/yjs`:

```ts
import { createYjsDoc } from '@pyreon/sync/yjs'

const doc = createYjsDoc()        // fresh Y.Doc
const title = syncedSignal({ doc, key: 'title', initial: 'Untitled' })
doc.yDoc                          // the underlying Y.Doc (for transports/persistence)
```

### syncedSignal — scalar fields

A scalar field (string / number / boolean) syncs with **last-writer-wins** semantics:

```ts
const count = syncedSignal({ doc, key: 'count', initial: 0 })
count()           // reactive read
count.set(5)      // one CRDT write → one DOM update
count.dispose()   // detach the observer (auto via onCleanup inside a scope)
```

The `initial` value is **create-if-missing only**: if the key already exists (hydrated from persistence or received from a peer), the existing value wins and `initial` is ignored. This is the local-first convention — a fresh peer's default never clobbers established state.

### syncedStore — a flat store of fields

```ts
import { syncedStore } from '@pyreon/sync'

const store = syncedStore({ title: 'Untitled', done: false }, { doc })
store.title()           // 'Untitled'
store.title.set('Ship') // one CRDT write → one DOM update
store.done.set(true)
store.dispose()         // tear down all fields
```

A single-key change still produces exactly one base-signal write: every field's observer runs, but only the field whose key changed actually calls `base.set` — the rest early-return on a cheap `Set.has`.

### Collaborative text — syncedText

For a string that two people edit at once, a scalar `syncedSignal` is wrong: last-writer-wins drops one editor's work. `syncedText` binds a `Signal<string>` to a Yjs `Y.Text` — a **character-level CRDT** where concurrent edits in different regions are *both* kept:

```ts
import { syncedText } from '@pyreon/sync/yjs'

const body = syncedText(doc, 'body')

// Positional ops — Y.Text merges these faithfully across peers:
body.insert(0, 'Hello ')
body.delete(0, 6)

// Or bind a controlled textarea (uses a minimal prefix/suffix diff):
// <textarea
//   value={() => body()}
//   onInput={(e) => body.set(e.currentTarget.value)}
// />
```

:::tip
`.insert` / `.delete` are positional and merge concurrently with no lost characters. `.set(fullText)` applies a single minimal prefix/suffix-diff replace — convenient for a controlled `<textarea>`'s single-region edits, but it is not a positional merge, so prefer the positional ops where real concurrency matters.
:::

### Collaborative lists — syncedList

`syncedList` binds a `Signal<T[]>` to a Yjs `Y.Array` — positional merge, so concurrent `push`/`insert` from two peers are both kept:

```ts
import { syncedList } from '@pyreon/sync/yjs'

const todos = syncedList<string>(doc, 'todos')
todos.push('buy milk', 'walk dog')
todos.insert(0, ['first'])
todos.delete(1, 1)
```

Render it with a **keyed `<For>`** so a remote change reconciles `O(changed)`, not a full re-render:

```tsx
<For each={() => todos()} by={(t) => t}>
  {(t) => <li>{t}</li>}
</For>
```

## Offline persistence — IndexedDB

`persistViaIndexedDB` makes edits survive a reload and lets the app work offline (a thin wrapper over `y-indexeddb`). It is **browser-only** — it opens the IndexedDB connection eagerly.

```ts
import { createYjsDoc, persistViaIndexedDB } from '@pyreon/sync/yjs'
import { syncedSignal } from '@pyreon/sync'

const doc = createYjsDoc()
const persist = persistViaIndexedDB(doc, 'my-app-doc')

await persist.whenSynced // ← load persisted state FIRST
const title = syncedSignal({ doc, key: 'title', initial: 'Untitled' })
```

:::danger
Always `await persist.whenSynced` **before** creating any `syncedSignal`. Otherwise the fresh `initial` seed races the async load and can clobber the persisted value.
:::

## Transports

### Cross-tab — connectViaBroadcastChannel

Same-origin, same-browser sync between tabs, no server. A minimal state-vector handshake catches a late-opening tab up:

```ts
import { connectViaBroadcastChannel, createYjsDoc } from '@pyreon/sync/yjs'

const doc = createYjsDoc()
const link = connectViaBroadcastChannel(doc, 'my-doc-room')
// edit in tab A → the same <h1> patches in place in tab B
link.disconnect()
```

### Cross-device — connectViaWebSocket

Point a doc at a relay over WebSocket. The wire protocol is the same minimal handshake (state vector → diff, then live updates) as the other transports, and it follows the same echo rule (a `REMOTE`-origin update is never re-sent). It reconnects with exponential backoff by default.

```ts
import { connectViaWebSocket, createYjsDoc } from '@pyreon/sync/yjs'

const doc = createYjsDoc()
const transport = connectViaWebSocket(
  doc,
  'wss://sync.example.com/my-room?token=abc',
  {
    reconnect: true,           // default
    onConnect: () => console.log('synced'),
    onDisconnect: () => console.log('offline'),
  },
)

transport.connected   // boolean
transport.disconnect() // close + stop reconnecting
```

:::warning
**Auth rides the query string, not a header.** Browser `WebSocket`s cannot set request headers, so put the token in the URL (`?token=…`); the relay's `authorize` hook reads it. A close with code **4401** is the relay's authz rejection — it is **terminal**, and reconnect won't help.
:::

On runtimes without a global `WebSocket` (older Node), pass an implementation:

```ts
import WebSocket from 'ws'
connectViaWebSocket(doc, url, { WebSocketImpl: WebSocket })
```

## Relay server

`createSyncServer` is a Node/Bun WebSocket relay (`@pyreon/sync/server` — server-only; it imports `ws` + `node:http`). It keeps one authoritative `Y.Doc` per room so a late-joiner catches up, applies each inbound update, and broadcasts to the room's *other* clients. Rooms are garbage-collected when their last client leaves.

```ts
import { createSyncServer } from '@pyreon/sync/server'

const relay = await createSyncServer({
  port: 1234,
  authorize: ({ room, token }) => token === secretFor(room),
})

relay.port  // resolved port (even when you pass port: 0)
relay.rooms // number of active rooms
await relay.close()
```

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

:::danger
The default `authorize` **allows every connection** — suitable only for local/dev. A real deployment **must** supply this, or anyone with the room id can read and write the whole document. Whole-document CRDTs make *partial* (per-field) access genuinely hard; use per-doc rooms or permission-scoped sub-docs.
:::

### Sharing a port with an existing server

Pass an existing `http.Server` to add WebSocket upgrade handling without opening a new port (the caller owns `server.listen()`):

```ts
import { createServer } from 'node:http'
import { createSyncServer } from '@pyreon/sync/server'

const http = createServer(/* your HTTP app */)
await createSyncServer({ server: http })
http.listen(3000)
```

:::note
The relay is **ephemeral** — it holds no persistence. Durability lives on the clients (`persistViaIndexedDB`) or in an external store you add. A reconnecting client re-syncs from whichever peer still holds the room.
:::

## End-to-end: a collaborative document

```tsx
import { syncedSignal } from '@pyreon/sync'
import {
  createYjsDoc,
  syncedText,
  persistViaIndexedDB,
  connectViaWebSocket,
} from '@pyreon/sync/yjs'

async function CollabDoc() {
  const doc = createYjsDoc()

  // 1. Load persisted state first.
  const persist = persistViaIndexedDB(doc, 'collab-doc')
  await persist.whenSynced

  // 2. Bind reactive fields.
  const title = syncedSignal({ doc, key: 'title', initial: 'Untitled' })
  const body = syncedText(doc, 'body')

  // 3. Go live across devices.
  connectViaWebSocket(doc, 'wss://sync.example.com/doc-42?token=abc')

  return (
    <article>
      <h1>{() => title()}</h1>
      <textarea
        value={() => body()}
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
  connectFakeDocs(a, b)

  const sa = syncedStore({ title: 'x' }, { doc: a })
  const sb = syncedStore({ title: 'x' }, { doc: b })

  sa.title.set('y')
  expect(sb.title()).toBe('y')
})
```

For offline-reconnect convergence (which the fake adapter can't model), use `createYjsDoc` with a real transport.

## Honest limits

Sync is a powerful capability, but be precise about what it does and doesn't guarantee:

- **CRDTs prevent lost *updates*, not semantic conflicts.** Never market this as "never lose data." Scalar `syncedSignal` is last-writer-wins — the loser's value is silently dropped. `syncedText` / `syncedList` keep both peers' operations, but the merged result can be semantically nonsensical (two sentences interleaved). Real apps still need conflict UX: presence, change indicators, optional field locking.
- **It is not free weight.** A synced app ships `yjs` (~40KB min+gz) + `y-indexeddb` + the WebSocket client on top of the runtime — realistically ~60KB+ gzipped. It is off the core hot path (an opt-in `/yjs` import) and justified by the capability, but a synced Pyreon app is not a "smaller than Solid" app.
- **Authorization is table-stakes.** See the relay section — the default allows everything; production must gate per room/doc.
- **Native (PMTC) sync is out of near-term scope.** The `CrdtAdapter` seam keeps a future Loro-via-FFI engine door open, but compiler WebSocket-emit + a native WS runtime + a CRDT-via-FFI engine are not in scope yet.

## API reference

### `@pyreon/sync` (core bridge)

| Export | Kind | Summary |
| --- | --- | --- |
| `syncedSignal(options)` | function | Bind a `Signal<T>` to a scalar CRDT map entry. |
| `syncedStore(initial, options)` | function | A flat store of synced fields over one map. |
| `SyncedSignal<T>` / `SyncedStore<T>` | type | A signal / store of signals with `dispose()`. |
| `CrdtAdapter` / `CrdtDoc` / `CrdtMap` | type | The engine-neutral seam. |
| `LOCAL_ORIGIN` / `REMOTE_ORIGIN` | constant | Transaction-origin tags (transport loop guard). |
| `FakeCrdtAdapter` / `connectFakeDocs` | class / function | In-memory test adapter + peer link. |

### `@pyreon/sync/yjs` (engine)

| Export | Kind | Summary |
| --- | --- | --- |
| `createYjsDoc(yDoc?)` | function | A `CrdtDoc` backed by a real Yjs `Y.Doc`. |
| `syncedText(doc, key)` | function | Collaborative string (`Y.Text`, character merge). |
| `syncedList(doc, key)` | function | Collaborative list (`Y.Array`, positional merge). |
| `persistViaIndexedDB(doc, dbName)` | function | Offline durability (browser-only). |
| `connectViaBroadcastChannel(doc, name)` | function | Same-origin cross-tab transport. |
| `connectViaWebSocket(doc, url, options?)` | function | Cross-device transport (auto-reconnect). |

### `@pyreon/sync/server` (relay)

| Export | Kind | Summary |
| --- | --- | --- |
| `createSyncServer(options)` | function | Node/Bun WebSocket relay with `authorize` gate. |
| `AuthorizeContext` / `SyncServerOptions` / `SyncServer` | type | Relay configuration + handle. |
