import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/sync',
  title: 'Sync',
  tagline:
    'Local-first CRDT-backed sync for signals — a synced signal is just a signal, so remote ops drive surgical fine-grained updates',
  description:
    'A reactive bridge that binds a Pyreon signal to a CRDT document, so collaborative / offline data flows through the same fine-grained signal graph as everything else: a remote change becomes one `signal.set`, which patches exactly one DOM region — no re-render, no diff. The bridge is engine-neutral (written against a small `CrdtAdapter` seam) and engine-independent at its core; the in-memory `FakeCrdtAdapter` ships today for tests and no-engine usage. Real engine adapters (raw Yjs, a turnkey platform), IndexedDB persistence, a WebSocket transport, and a relay server are phased follow-ups. v1 binds scalar map fields; collections (lists / collaborative text) are a later phase.',
  category: 'universal',
  longExample: `import { syncedSignal, syncedStore, FakeCrdtAdapter, connectFakeDocs } from '@pyreon/sync'

// A single synced field, backed by a CRDT map entry. It IS a signal:
const doc = new FakeCrdtAdapter().createDoc()
const title = syncedSignal({ doc, key: 'title', initial: 'Untitled' })
// In a template:  <h1>{() => title()}</h1>  — surgical update on any peer's edit
title.set('Roadmap')   // writes the CRDT; the map observer drives the one DOM update
title()                // 'Roadmap'
title.dispose()        // detach the observer (or rely on onCleanup in a scope)

// A flat store of synced fields over one map:
const store = syncedStore({ title: 'Untitled', done: false }, { doc })
store.title.set('Ship it')
store.done()           // false
store.dispose()

// Two peers, in memory (the transport stand-in for tests):
const a = new FakeCrdtAdapter().createDoc()
const b = new FakeCrdtAdapter().createDoc()
const link = connectFakeDocs(a, b)
const ta = syncedSignal({ doc: a, key: 'title', initial: '' })
const tb = syncedSignal({ doc: b, key: 'title', initial: '' })
ta.set('hello')        // relays to b under REMOTE origin — no echo back to a
tb()                   // 'hello'
link.disconnect()`,
  features: [
    'syncedSignal — bind a signal to one scalar CRDT map entry; reads/_v/.direct delegate to a base signal so the compiler fast paths treat it as a normal signal',
    'Single update path: writes go only to the CRDT, the map observer is the one writer of the base signal — Object.is dedupes the local echo (scalars)',
    'syncedStore — a flat bag of synced fields over one map; one op → exactly one base-signal write across the store',
    'CrdtAdapter / CrdtDoc / CrdtMap — the engine-neutral seam; the bridge imports no engine',
    'FakeCrdtAdapter + connectFakeDocs — in-memory engine + peer-link for tests / no-engine usage',
    'LOCAL_ORIGIN / REMOTE_ORIGIN — transport tags the wire; the bridge observer applies regardless of origin (the network loop is prevented at the transport, never the observer)',
  ],
  api: [
    {
      name: 'syncedSignal',
      kind: 'function',
      signature:
        'syncedSignal<T>({ doc: CrdtDoc, key: string, initial: T, map?: string }) → SyncedSignal<T>',
      summary:
        'Bind a `Signal<T>` to a single scalar entry in a CRDT map. The result is a NORMAL signal (built via `wrapSignal`, so reads / `_v` / `.direct` all delegate to a base signal) — the compiler\'s `_bindText`/`_bindDirect` fast paths and every effect treat it identically to any signal, which is the whole point: a remote op becomes one `base.set` driving one fine-grained DOM update. The update loop has a single source of truth: `.set(v)` writes ONLY the CRDT (`doc.transact(() => map.set(key, v), LOCAL)`); the `map.observe` callback is the ONE writer of the base signal, firing on every committed transaction (local AND remote) with `base.set(map.get(key))`. The local echo is a no-op because the signal\'s `Object.is` write-skip dedupes a re-reported scalar; the NETWORK loop is prevented in the transport (it never re-broadcasts a REMOTE-origin update), never in the observer. Seeds `initial` only when the key is absent (create-if-missing — the CRDT is authoritative). v1 is scalar-only.',
      example: `const title = syncedSignal({ doc, key: 'title', initial: 'Untitled' })
title.set('Roadmap')   // → CRDT write → observer → one base.set → one DOM update
title()                // 'Roadmap'
title.dispose()`,
      mistakes: [
        'Expecting `.set` to update the value synchronously by writing the base signal directly — it writes the CRDT; the observer (the single update path) writes the base. Both would double-apply.',
        'Relying on the echo no-op for OBJECT values — `Object.is` compares objects by reference, so a whole-object replace re-fires; v1 is scalar-only and collections are a later phase',
        'Forgetting `.dispose()` for a module-scope synced signal — `onCleanup` only auto-disposes inside a reactive scope; outside one the observer leaks',
        'Two peers each seeding `initial` while disconnected, then connecting — the in-memory fake does not merge-on-reconnect (a real-CRDT property); construct-then-connect with distinct seeds is out of the fake\'s scope',
      ],
      seeAlso: ['syncedStore', 'CrdtAdapter', 'FakeCrdtAdapter', 'LOCAL_ORIGIN'],
    },
    {
      name: 'syncedStore',
      kind: 'function',
      signature:
        'syncedStore<T extends Record<string, unknown>>(initial: T, { doc: CrdtDoc, map?: string }) → SyncedStore<T>',
      summary:
        'Build a flat store of synced fields from a plain initial object — the ergonomic layer over `syncedSignal`. Each field becomes its own `SyncedSignal` over a shared map, so `store.title()` reads reactively and `store.title.set(v)` writes through the CRDT. A single-key change still produces exactly one base-signal write: every field\'s observer runs but only the changed field calls `base.set` (the rest early-return on a cheap `Set.has`), so the "one op → one update" invariant holds across the whole store. `dispose` is a reserved field name (it tears down every field\'s observer); a store key literally named `dispose` throws.',
      example: `const store = syncedStore({ title: 'Untitled', done: false }, { doc })
store.title.set('Ship it')
store.done()           // false
store.dispose()`,
      mistakes: [
        'Naming a field `dispose` — reserved (it is the teardown method); the builder throws',
        'Assuming a shared single observer — v1 registers one observer per field; correctness holds (one write per op) but a very wide store pays N cheap Set.has checks per change',
      ],
      seeAlso: ['syncedSignal', 'CrdtAdapter'],
    },
    {
      name: 'CrdtAdapter',
      kind: 'type',
      signature:
        'interface CrdtAdapter { createDoc(): CrdtDoc } — with CrdtDoc { getMap(name): CrdtMap; transact(fn, origin?): void; destroy(): void } and CrdtMap { get/set/has/keys/observe }',
      summary:
        'The engine-neutral seam — the ONLY surface a concrete CRDT engine implements. The reactive bridge is written entirely against `CrdtAdapter` / `CrdtDoc` / `CrdtMap` and imports no engine, so the same bridge runs over a raw `Y.Doc`, a turnkey platform, or the in-memory `FakeCrdtAdapter`. `transact(fn, origin)` runs map mutations as one atomic transaction tagged with an origin; `map.observe(cb)` fires once per committed transaction (local AND remote) with the changed keys + origin. Swapping engines re-platforms the persistence / transport / relay infrastructure — NOT this client bridge. v1 maps are flat scalar registers.',
      example: `// Implement the three interfaces for your engine; the bridge does the rest.
const adapter: CrdtAdapter = new FakeCrdtAdapter()
const doc = adapter.createDoc()
const map = doc.getMap('pyreon')
doc.transact(() => map.set('title', 'hi'), LOCAL_ORIGIN)`,
      mistakes: [
        'Calling `map.set` and expecting an observer fire without a `transact` wrapper — writes must be inside a transaction (the fake auto-wraps a bare write, real engines may differ)',
        'Gating the observer on origin to prevent loops — wrong layer; the observer applies all changes, the transport guards re-broadcast',
      ],
      seeAlso: ['syncedSignal', 'FakeCrdtAdapter', 'LOCAL_ORIGIN', 'REMOTE_ORIGIN'],
    },
    {
      name: 'FakeCrdtAdapter',
      kind: 'class',
      signature:
        'new FakeCrdtAdapter().createDoc() → CrdtDoc; connectFakeDocs(a, b) → { disconnect }',
      summary:
        'An in-memory `CrdtAdapter` implementation — flat per-key last-writer-wins scalar registers with transaction batching and observer firing. The only adapter that ships today; it is both the test double for the bridge and a real way for consumers to unit-test their own synced stores without an engine. `connectFakeDocs(a, b)` is the transport stand-in: it relays a commit on one doc onto the other under `REMOTE_ORIGIN`, and — modeling the y-websocket echo rule exactly — never re-broadcasts a REMOTE-origin commit, so there is no ping-pong. It deliberately does NOT model real CRDT merge math (logical clocks, tombstones, offline op-buffering) — that is the real engine\'s job; `connectFakeDocs` is live-relay only and does not merge-on-reconnect.',
      example: `const a = new FakeCrdtAdapter().createDoc()
const b = new FakeCrdtAdapter().createDoc()
const link = connectFakeDocs(a, b)
syncedSignal({ doc: a, key: 'n', initial: 0 }).set(1)
syncedSignal({ doc: b, key: 'n', initial: 0 })()   // 1
link.disconnect()`,
      mistakes: [
        'Writing offline-then-reconnect convergence tests against the fake — it does not buffer-and-replay; that property belongs to the real engine adapter',
        'Treating the fake\'s LWW as the real engine\'s merge semantics — it is a bridge test double, not a CRDT',
      ],
      seeAlso: ['CrdtAdapter', 'syncedSignal'],
    },
  ],
  gotchas: [
    {
      label: 'Scalar-only (v1)',
      note: 'A synced field holds one whole value. The echo no-op and "one op → one update" hold for scalars (string / number / boolean). Objects and arrays compare by reference, so a whole-value replace re-fires per change — granular collections (lists, collaborative text) are a later phase.',
    },
    {
      label: 'Loop prevention lives in the transport',
      note: 'The bridge observer applies every change to the base signal regardless of origin (Object.is dedupes the local echo). The NETWORK loop is prevented by the transport never re-broadcasting a REMOTE-origin update — never by gating the observer on origin.',
    },
    {
      label: 'Phase status',
      note: 'Today: the engine-independent bridge (syncedSignal / syncedStore) + the in-memory FakeCrdtAdapter. Coming: real engine adapters (raw Yjs / a turnkey platform), IndexedDB persistence, a WebSocket transport, and a relay server — see the package README roadmap.',
    },
  ],
})
