# @pyreon/sync

Local-first, CRDT-backed sync for signals — **a synced signal is just a signal**, so a remote change drives one fine-grained DOM update instead of a re-render.

When a collaborative or offline change arrives, a fine-grained signal framework can do `apply op → one signal.set → one surgical DOM update`. That is the whole bet of this package: bind a signal to a CRDT entry through `wrapSignal`, and the rest of Pyreon (compiled templates, effects, `<For>`) treats it like any other signal — no special render path, no diff.

> **Status (read this).** **Private / unpublished for now** — `@pyreon/sync` is not on npm yet; it goes public once the engine + transport story is finished and tested. This package ships in increments. **Today**: the engine-independent reactive bridge (`syncedSignal` / `syncedStore`) + an in-memory `FakeCrdtAdapter` for tests, **plus the real Yjs engine adapter at the `@pyreon/sync/yjs` subpath** (`yjs` stays out of the core entry) with **IndexedDB offline persistence** (`persistViaIndexedDB`), **same-origin cross-tab sync** (`connectViaBroadcastChannel`), and **collaborative text + lists** (`syncedText` / `syncedList` — Y.Text character-merge + Y.Array positional merge). **Not yet**: a turnkey-platform adapter, and a cross-device WebSocket transport + relay server. See the [roadmap](#roadmap). v1 binds **scalar** map fields + collaborative text + lists; cross-device sync is the remaining phase.

## Install

```bash
bun add @pyreon/sync @pyreon/reactivity
```

## Quick start

```ts
import { syncedSignal, FakeCrdtAdapter } from '@pyreon/sync'

const doc = new FakeCrdtAdapter().createDoc()
const title = syncedSignal({ doc, key: 'title', initial: 'Untitled' })

// In a template:  <h1>{() => title()}</h1>
// Editing `title` anywhere — locally or from a peer — patches just that <h1>.
title.set('Roadmap')
title() // 'Roadmap'

title.dispose() // detach the CRDT observer (or rely on onCleanup in a scope)
```

A flat store of synced fields over one map:

```ts
import { syncedStore } from '@pyreon/sync'

const store = syncedStore({ title: 'Untitled', done: false }, { doc })
store.title.set('Ship it')
store.done() // false
store.dispose()
```

Two peers, in memory (the transport stand-in for tests):

```ts
import { FakeCrdtAdapter, connectFakeDocs, syncedSignal } from '@pyreon/sync'

const a = new FakeCrdtAdapter().createDoc()
const b = new FakeCrdtAdapter().createDoc()
const link = connectFakeDocs(a, b)

const ta = syncedSignal({ doc: a, key: 'title', initial: '' })
const tb = syncedSignal({ doc: b, key: 'title', initial: '' })

ta.set('hello') // relays to b under REMOTE origin — never echoed back to a
tb() // 'hello'

link.disconnect()
```

## Real engine: Yjs (`@pyreon/sync/yjs`)

The Yjs adapter lives at a subpath so `yjs` never enters the core `@pyreon/sync`
bundle. The bridge runs over it **unchanged** — the `CrdtAdapter` seam was shaped
to match Yjs (`doc.transact(fn, origin)` + `Y.Map.observe(event.keysChanged, txn.origin)`):

```ts
import { syncedSignal } from '@pyreon/sync'
import { createYjsDoc, connectYDocs } from '@pyreon/sync/yjs'

const a = createYjsDoc() // wraps a fresh Y.Doc (or pass your own: createYjsDoc(yDoc))
const b = createYjsDoc()
connectYDocs(a, b) // in-memory peer link (the transport stand-in)

const ta = syncedSignal({ doc: a, key: 'title', initial: '' })
const tb = syncedSignal({ doc: b, key: 'title', initial: '' })

ta.set('hello')
tb() // 'hello' — same bridge, real CRDT underneath
```

Because it is a real CRDT, `connectYDocs` also converges **offline** edits on
reconnect (it exchanges state vectors first) — two docs that diverged while
disconnected merge with no lost op.

For same-origin **tabs / windows**, `connectViaBroadcastChannel(doc, room)` syncs
over `BroadcastChannel` (zero network, the canonical local-first multi-tab
transport) with a minimal state-vector handshake so a late-joining tab converges,
not just live edits. The `examples/sync-yjs-demo` app + its real-Chromium
two-tab e2e (`e2e/sync-yjs-demo.spec.ts`) prove the headline end-to-end: an edit
in one tab patches exactly the bound text node in the other (compiled
`_bindText`), no re-render.

For **offline durability**, `persistViaIndexedDB(doc, dbName)` persists the doc
to IndexedDB (via `y-indexeddb`) so edits survive a reload and the app works
offline. Await its `whenSynced` BEFORE creating `syncedSignal`s so create-if-missing
adopts the persisted value rather than racing a fresh seed against the async load:

```ts
const doc = createYjsDoc()
const persist = persistViaIndexedDB(doc, 'my-app-doc')
await persist.whenSynced
const title = syncedSignal({ doc, key: 'title', initial: 'Untitled' })
```

`createYjsDoc().yDoc` exposes the underlying `Y.Doc` so a WebSocket transport can
be wired (later phase). Note CRDTs guarantee *convergence*, not *intent*: a scalar
last-writer-wins still picks one value when two peers edit the same field
concurrently — both peers agree, but the loser's value is dropped.

### Collaborative text — `syncedText`

For a string that two people edit at once, `syncedText(doc, key)` binds a
`Signal<string>` to a Yjs `Y.Text` — a **character-level CRDT**. Unlike a scalar
`syncedSignal` (last-writer-wins, which drops the loser's value), concurrent
edits to different regions are **both kept**, with no lost characters:

```ts
import { createYjsDoc, syncedText } from '@pyreon/sync/yjs'

const body = syncedText(doc, 'body')
body.insert(0, 'Hello ')      // positional ops Y.Text merges faithfully
body.delete(0, 6)
body.set(textareaEl.value)    // or a whole-text replace (minimal prefix/suffix diff)
// <textarea value={() => body()} onInput={e => body.set(e.currentTarget.value)} />
```

Two tabs typing concurrently converge to a string containing **both** their
edits (proven by the `examples/sync-yjs-demo` textarea + its real-Chromium
two-tab e2e). It is engine-specific (lives in `@pyreon/sync/yjs`) — collaborative
text is inherently coupled to the CRDT's text type, so it is not behind the
engine-neutral seam.

For **collaborative lists**, `syncedList(doc, key)` binds a `Signal<T[]>` to a
`Y.Array` — the same positional-merge story: concurrent `push` / `insert` /
`delete` from two peers are all kept, no item dropped. Render it with a keyed
`<For each={() => list()} by={…}>` so a remote change reconciles O(changed). Also
engine-specific (in `@pyreon/sync/yjs`).

## How the loop works (and why it can't echo)

A synced signal has a **single source of truth for updates**:

1. `synced.set(v)` writes **only** the CRDT — `doc.transact(() => map.set(key, v), LOCAL)`. It does **not** also write the base signal; doing both would double-apply.
2. `map.observe(...)` fires at every committed transaction — **local and remote alike** — and is the **one** writer of the base signal: `base.set(map.get(key))`.
3. The local echo is harmless: when the observer re-reports the value the base already holds, `base.set` is an `Object.is` no-op (true for scalar values).
4. The **network** loop is prevented in the **transport**, which never re-broadcasts a change it just received (a `REMOTE`-origin update). It is *never* prevented by gating the observer on origin — the observer always applies.

This is exactly how `y-websocket` handles it; `connectFakeDocs` models the same rule.

## The engine seam

The bridge is written against a small, engine-neutral interface and imports no CRDT engine:

```ts
interface CrdtAdapter {
  createDoc(): CrdtDoc
}
interface CrdtDoc {
  getMap(name: string): CrdtMap
  transact(fn: () => void, origin?: CrdtOrigin): void
  destroy(): void
}
interface CrdtMap {
  get(key: string): unknown
  set(key: string, value: unknown): void
  has(key: string): boolean
  keys(): string[]
  observe(cb: (changedKeys: ReadonlySet<string>, origin: CrdtOrigin) => void): () => void
}
```

Implement those three for an engine and the bridge runs unchanged over it. The
in-memory `FakeCrdtAdapter` is the reference implementation. Swapping engines
re-platforms the *infrastructure* (persistence / transport / relay) — **not**
this client bridge.

## Roadmap

| Phase | Scope | Status |
| --- | --- | --- |
| Bridge | `syncedSignal` / `syncedStore` + `CrdtAdapter` seam + in-memory adapter | ✅ shipped |
| Yjs engine adapter | raw `Y.Doc` behind the seam (`@pyreon/sync/yjs`) + in-memory peer link | ✅ shipped |
| Turnkey engine adapter | a managed platform (e.g. Jazz) behind the same seam, for the raw-vs-turnkey decision | planned |
| Persistence | IndexedDB offline durability (`persistViaIndexedDB`, via y-indexeddb) | ✅ shipped |
| Cross-tab transport | same-origin `BroadcastChannel` sync (`connectViaBroadcastChannel`) | ✅ shipped |
| Cross-device transport | WebSocket channel + relay server (live remote peer sync) | planned |
| Relay | standalone server + a `@pyreon/zero` adapter extension, with per-room/per-doc authz | planned |
| Collaborative text | `Y.Text` via `syncedText` (character-level merge) | ✅ shipped |
| List collections | `Y.Array` via `syncedList` (positional merge) | ✅ shipped |

## Honest limits

- **CRDTs prevent lost *updates*, not semantic conflicts.** A scalar last-writer-wins drops the loser's value; merged text can read nonsensically. Convergence ≠ sensible intent — real apps still want presence / conflict UX. This package never claims "never lose data."
- **Scalar fields only in v1.** Objects/arrays stored as whole values replace coarsely (correct, but a change re-fires the whole field).
- **The in-memory adapter is not a CRDT.** It's a last-writer-wins test double for exercising the bridge; it does not model logical clocks, tombstones, or offline merge.

## License

MIT
