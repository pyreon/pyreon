# @pyreon/sync

Local-first, CRDT-backed sync for signals — **a synced signal is just a signal**, so a remote change drives one fine-grained DOM update instead of a re-render.

When a collaborative or offline change arrives, a fine-grained signal framework can do `apply op → one signal.set → one surgical DOM update`. That is the whole bet of this package: bind a signal to a CRDT entry through `wrapSignal`, and the rest of Pyreon (compiled templates, effects, `<For>`) treats it like any other signal — no special render path, no diff.

> **Status (read this).** **Private / unpublished for now** — `@pyreon/sync` is not on npm yet; it goes public once the engine + transport story is finished and tested. This package ships in increments. **Today**: the engine-independent reactive bridge (`syncedSignal` / `syncedStore`) + an in-memory `FakeCrdtAdapter` for tests, **plus the real Yjs engine adapter at the `@pyreon/sync/yjs` subpath** (`yjs` stays out of the core entry). **Not yet**: a turnkey-platform adapter, IndexedDB persistence, a cross-tab / cross-device WebSocket transport, and a relay server. See the [roadmap](#roadmap). v1 binds **scalar** map fields; collections (lists, collaborative text) are a later phase.

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

`createYjsDoc().yDoc` exposes the underlying `Y.Doc` so a WebSocket transport /
`y-indexeddb` persistence can be wired (later phases). Note CRDTs guarantee
*convergence*, not *intent*: a scalar last-writer-wins still picks one value when
two peers edit the same field concurrently — both peers agree, but the loser's
value is dropped.

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
| Persistence | IndexedDB (offline survives reload) | planned |
| Transport | cross-tab / cross-device WebSocket channel (live peer sync) | planned |
| Relay | standalone server + a `@pyreon/zero` adapter extension, with per-room/per-doc authz | planned |
| Collections | `Y.Array` lists + `Y.Text` collaborative editing | planned |

## Honest limits

- **CRDTs prevent lost *updates*, not semantic conflicts.** A scalar last-writer-wins drops the loser's value; merged text can read nonsensically. Convergence ≠ sensible intent — real apps still want presence / conflict UX. This package never claims "never lose data."
- **Scalar fields only in v1.** Objects/arrays stored as whole values replace coarsely (correct, but a change re-fires the whole field).
- **The in-memory adapter is not a CRDT.** It's a last-writer-wins test double for exercising the bridge; it does not model logical clocks, tombstones, or offline merge.

## License

MIT
