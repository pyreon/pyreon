import { defineManifest } from '@pyreon/manifest'

/**
 * Manifest for `@pyreon/sync` — the single source of truth for the package's
 * generated docs surfaces (`llms.txt` bullet, `llms-full.txt` section, the MCP
 * `api-reference` region, and the docs-site reference page). Edit this, then run
 * `bun run gen-docs`; do NOT hand-edit the generated files.
 */
export default defineManifest({
  name: '@pyreon/sync',
  title: 'Local-First Sync',
  tagline:
    'Local-first CRDT-backed sync for signals — a synced signal IS a signal, so a remote op drives ONE fine-grained DOM update, not a re-render',
  description:
    'A local-first / collaborative sync layer for Pyreon. A synced value is a normal `Signal` (built via `wrapSignal`), so a remote change becomes one `signal.set` → one surgical fine-grained DOM update — never a VDOM re-render + diff. The engine-neutral `CrdtAdapter` seam keeps the reactive bridge engine-free; the real engine (raw Yjs) lives behind `@pyreon/sync/yjs` so importing the core never pulls in `yjs`. Covers offline persistence (IndexedDB), same-origin cross-tab + cross-device WebSocket transport, collaborative text + lists, and a Node/Bun relay with per-room/per-doc authz at `@pyreon/sync/server`. v1 syncs scalar map fields + collaborative `Y.Text` / `Y.Array`.',
  category: 'universal',
  multiplatform: {
    tier: 'web-only',
    rationale:
      'the Yjs engine + IndexedDB/WebSocket transports stay web; the engine-neutral PyreonCrdt core + `syncedSignal` lower to a native runtime, cross-device transport tracked',
    nativeFrontend:
      'PyreonSyncedSignal — `syncedSignal({ doc, key, initial })` over a shared PyreonCrdtDoc (scalar String/Double/Bool, local-first create-if-missing, remote-op reactivity)',
  },
  features: [
    'syncedSignal / syncedStore — bind a Signal to a CRDT map entry; a synced signal is indistinguishable from a normal signal to the compiler and every effect',
    'Engine-neutral CrdtAdapter / CrdtDoc / CrdtMap seam + an in-memory FakeCrdtAdapter for dependency-free unit tests',
    'Real Yjs engine behind the @pyreon/sync/yjs subpath (yjs stays out of the core entry)',
    'Offline persistence via IndexedDB (persistViaIndexedDB)',
    'Same-origin cross-tab sync (connectViaBroadcastChannel) + cross-device WebSocket transport (connectViaWebSocket, auto-reconnect)',
    'Collaborative text (syncedText / Y.Text) + lists (syncedList / Y.Array) with true positional merge — concurrent edits keep BOTH',
    'Ephemeral presence + live cursors (syncedAwareness) over the Yjs awareness protocol — a separate, never-persisted channel; the relay is awareness-stateful so a new client sees existing peers instantly + a crashed client is purged on disconnect',
    'Node/Bun relay server (createSyncServer) with a per-room/per-doc authorize gate + attach-to-existing-HTTP-server mode',
    'Loop-free by construction: the observer applies every change; the transport never re-broadcasts a REMOTE-origin update (the same shared tag guards awareness across BOTH transports)',
    "Clobber-free seed: syncedSignal's create-if-missing seed DEFERS until first sync when a transport is attached (WebSocketTransport.synced / whenSynced) — a fresh peer's default never races a peer's real value on a random-clientId tie-break (#2380)",
  ],
  api: [
    {
      name: 'syncedSignal',
      kind: 'function',
      signature: '<T>(options: SyncedSignalOptions<T>) => SyncedSignal<T>',
      summary:
        "Bind a Signal<T> to a single scalar entry in a CRDT map. The return value is a NORMAL signal (via wrapSignal — reads / `_v` / `.direct` all delegate), so the compiler's `_bindText`/`_bindDirect` fast paths and every effect treat it like any signal: a remote op becomes one `base.set` → one fine-grained DOM update. The update loop has a single writer — `.set(v)` writes ONLY the CRDT; the map observer is the one path that writes the base signal (for local AND remote commits); the local echo is an `Object.is` no-op.",
      example: `const title = syncedSignal({ doc, key: "title", initial: "Untitled" })
// <h1>{title()}</h1>  — patches in place when any peer edits the title
title()              // "Untitled"  (reactive read)
title.set("Roadmap") // writes the CRDT; the observer drives the DOM update
title.dispose()      // detach observer (auto on onCleanup inside a scope)`,
      mistakes: [
        'Calling `title(newValue)` to write — that reads and ignores the arg like any signal. Use `title.set(newValue)`',
        'Expecting `initial` to win when the key already exists — it is create-if-missing only; a persisted / peer value is authoritative and `initial` is ignored (the local-first convention)',
        'Creating the synced signal BEFORE attaching the transport — the create-if-missing seed defers until first sync ONLY when a transport is already registered on the doc; created first, it seeds immediately (as if alone) and a fresh default can clobber a peer value on a clientId tie-break (#2380). Attach the transport (+ persistence) first',
        'Storing an object/array and expecting per-field surgical updates — v1 is scalar (string/number/boolean); whole-value replace works but re-fires per replace. Use `syncedText`/`syncedList` for collaborative collections',
        'Forgetting `.dispose()` for a module-scope synced signal that outlives any reactive scope (inside a scope it auto-disposes via onCleanup)',
        "Assuming the `map` option is required — it defaults to the exported `DEFAULT_MAP` constant (`'pyreon'`) when omitted; pass an explicit `map` only when you need multiple independent maps in the same doc",
      ],
      seeAlso: ['syncedStore', 'syncedText', 'syncedList'],
    },
    {
      name: 'syncedStore',
      kind: 'function',
      signature:
        '<T extends Record<string, unknown>>(initial: T, options: SyncedStoreOptions) => SyncedStore<T>',
      summary:
        "Build a flat store of synced fields from a plain initial object — the ergonomic layer over syncedSignal. Each field becomes its own SyncedSignal over one shared map, so `store.title()` reads reactively and `store.title.set(v)` writes through the CRDT. A single-key change still produces exactly one base-signal write: every field's observer runs, but only the field whose key changed calls `base.set` (the rest early-return on a cheap `Set.has`).",
      example: `const store = syncedStore({ title: "Untitled", done: false }, { doc })
store.title()            // "Untitled"
store.title.set("Ship")  // one CRDT write → one DOM update
store.done.set(true)
store.dispose()          // tear down all fields (or rely on onCleanup in-scope)`,
      mistakes: [
        "Adding a key at runtime — the store's fields are fixed from the `initial` object's keys at construction; reshape by creating a new store",
        'Sharing one map across two unrelated stores — `{ map }` names the map; one map = one store, or fields collide',
        'Reading `store` as a plain object snapshot — each field is a SyncedSignal; call it (`store.title()`) to read reactively',
      ],
      seeAlso: ['syncedSignal'],
    },
    {
      name: 'SyncedSignal',
      kind: 'type',
      signature: 'interface SyncedSignal<T> extends Signal<T> { dispose(): void }',
      summary:
        'A Signal<T> bound to a CRDT entry. Identical to a normal Signal for reads/writes/tracking, plus `dispose()` to detach the CRDT observer (idempotent; auto-called via onCleanup when created inside a reactive scope).',
      example: `const s: SyncedSignal<number> = syncedSignal({ doc, key: "n", initial: 0 })`,
      seeAlso: ['syncedSignal'],
    },
    {
      name: 'SyncedStore',
      kind: 'type',
      signature:
        'type SyncedStore<T> = { readonly [K in keyof T]: SyncedSignal<T[K]> } & { dispose(): void }',
      summary:
        "A mapped type — each key of the initial object becomes a SyncedSignal of that field's type, plus a store-level `dispose()` that tears down every field's observer.",
      example: `const store: SyncedStore<{ title: string }> = syncedStore({ title: "x" }, { doc })`,
      seeAlso: ['syncedStore'],
    },
    {
      name: 'CrdtAdapter',
      kind: 'type',
      signature:
        'interface CrdtAdapter { createDoc(): CrdtDoc }  // + CrdtDoc.getMap → CrdtMap, CrdtMap.observe/transact',
      summary:
        'The engine-neutral seam. `CrdtAdapter` / `CrdtDoc` / `CrdtMap` abstract the CLIENT reactive bridge so syncedSignal/syncedStore never import a concrete engine. The bridge depends ONLY on this seam (+ @pyreon/reactivity); the Yjs implementation lives behind `@pyreon/sync/yjs`. Note: the seam ports the bridge, NOT the wire format — persistence/transport/relay are Yjs-coupled, so swapping engines re-platforms the infrastructure, not the bridge.',
      example: `function bindTitle(adapter: CrdtAdapter) {
  const doc = adapter.createDoc()
  return syncedSignal({ doc, key: "title", initial: "Untitled" })
}`,
      seeAlso: ['FakeCrdtAdapter', 'createYjsDoc'],
    },
    {
      name: 'LOCAL_ORIGIN',
      kind: 'constant',
      signature: 'const LOCAL_ORIGIN: unique symbol',
      summary:
        'Transaction-origin tag for a LOCAL write (a `.set` originating on this client). The bridge tags its CRDT writes with this; transports use the origin to prevent the NETWORK loop — they re-broadcast LOCAL-origin updates but NEVER a REMOTE-origin one. The bridge observer itself applies every change regardless of origin (the local echo is an Object.is no-op).',
      example: `doc.getMap("m").transact(() => map.set("k", v), LOCAL_ORIGIN)`,
      seeAlso: ['REMOTE_ORIGIN'],
    },
    {
      name: 'REMOTE_ORIGIN',
      kind: 'constant',
      signature: 'const REMOTE_ORIGIN: unique symbol',
      summary:
        'Transaction-origin tag for a REMOTE-applied update (received from a peer/relay). Transports apply inbound updates with this origin so they are NOT echoed back, which is what prevents the network loop. Gating the bridge OBSERVER on origin would be a bug — it must apply remote changes to drive the local UI; the loop guard belongs in the transport.',
      example: `doc.yDoc.transact(() => Y.applyUpdate(doc.yDoc, bytes), REMOTE_ORIGIN)`,
      seeAlso: ['LOCAL_ORIGIN'],
    },
    {
      name: 'FakeCrdtAdapter',
      kind: 'class',
      signature: 'class FakeCrdtAdapter implements CrdtAdapter { createDoc(): CrdtDoc }',
      summary:
        "An in-memory, dependency-free CrdtAdapter for unit-testing synced stores without standing up a real engine. Pair docs with `connectFakeDocs(a, b)` to simulate two peers in-process. It does NOT do state-vector reconciliation, so it can't model offline-reconnect convergence — use the Yjs adapter (`createYjsDoc` + a transport) for that.",
      example: `// FakeCrdtAdapter.createDoc() returns a CrdtDoc; construct FakeCrdtDoc
// directly to get the concrete type connectFakeDocs requires.
const a = new FakeCrdtDoc()
const b = new FakeCrdtDoc()
connectFakeDocs(a, b)
const sa = syncedSignal({ doc: a, key: "k", initial: 0 })
const sb = syncedSignal({ doc: b, key: "k", initial: 0 })
sa.set(5) // sb() becomes 5`,
      mistakes: [
        'Using the fake adapter to test offline-reconnect convergence — it has no state-vector merge; use the Yjs adapter for that scenario',
        'Shipping the fake adapter to production — it is a test double with no persistence or real conflict resolution',
        'Constructing `new FakeCrdtAdapter()` per test when a single shared instance is fine — the package also exports `fakeAdapter`, a ready-made `CrdtAdapter` singleton (`export const fakeAdapter: CrdtAdapter = new FakeCrdtAdapter()`) for the common case of "I just need an adapter, not multiple isolated ones"',
      ],
      seeAlso: ['connectFakeDocs', 'createYjsDoc'],
    },
    {
      name: 'connectFakeDocs',
      kind: 'function',
      signature: '(a: FakeCrdtDoc, b: FakeCrdtDoc) => { disconnect(): void }',
      summary:
        'Link two in-memory FakeCrdtDocs so a write to one propagates to the other — the test analog of a transport. Returns a `disconnect()` to simulate going offline.',
      example: `const link = connectFakeDocs(a, b)
link.disconnect() // simulate offline`,
      seeAlso: ['FakeCrdtAdapter'],
    },
    {
      name: 'pyreonAdapter',
      kind: 'function',
      signature: '(actor?: string) => PyreonCrdtAdapter',
      summary:
        'Convenience factory for the pure-TS LWW (last-writer-wins) engine — the MULTIPLATFORM counterpart to the Yjs adapter. Where Yjs is a web-only npm engine, this one is pure logic (Map, numbers, comparisons) with no external dependency, so the Pyreon Multi-Target Compiler lowers the SAME source to SwiftUI + Compose: a web peer and a native peer run byte-identical merge math and converge over one shared wire protocol. Generates a fresh `createActorId()` when `actor` is omitted — pass your own to persist a stable device identity across restarts. Matches the v1 seam exactly: a `CrdtMap` is a flat key → scalar register; rich collaborative text/lists stay on the Yjs engine until a native sequence-CRDT engine lands.',
      example: `import { pyreonAdapter, syncedSignal } from "@pyreon/sync"
const adapter = pyreonAdapter()          // dependency-free scalar-map CRDT
const doc = adapter.createDoc()
const title = syncedSignal({ doc, key: "title", initial: "Untitled" })
title.set("Roadmap")`,
      mistakes: [
        "Reaching for this when you need collaborative TEXT or LIST merge — it's scalar-only (last-writer-wins); use the Yjs engine's `syncedText`/`syncedList` for character/positional merge",
        'Generating a fresh actor id on every mount instead of persisting one — a stable per-install id is what makes the LWW tie-break behave like a stable "this device" identity rather than a coin flip on every reload',
        "Sharing one actor id across two LIVE peers — the id is the LWW tie-breaker; two peers with the same id can't be distinguished when they conflict",
      ],
      seeAlso: ['PyreonCrdtAdapter', 'createActorId', 'createNativeSyncHost'],
    },
    {
      name: 'PyreonCrdtAdapter',
      kind: 'class',
      signature: 'class PyreonCrdtAdapter implements CrdtAdapter { constructor(actor: string); createDoc(): CrdtDoc }',
      summary:
        "The pure-TS LWW engine's CrdtAdapter implementation — usually reached through the `pyreonAdapter()` factory rather than constructed directly. Each `createDoc()` returns a `PyreonCrdtDoc` stamped with this adapter's `actor` id, so every doc it produces shares one peer identity. Implements the exact `CrdtAdapter` seam the reactive bridge (`syncedSignal`/`syncedStore`) is written against, so it's a drop-in swap for `FakeCrdtAdapter` or the Yjs adapter — nothing above the seam knows which engine it's talking to.",
      example: `const adapter = new PyreonCrdtAdapter("device-1")
const doc = adapter.createDoc()`,
      seeAlso: ['pyreonAdapter', 'PyreonCrdtDoc', 'CrdtAdapter'],
    },
    {
      name: 'PyreonCrdtDoc',
      kind: 'class',
      signature:
        'class PyreonCrdtDoc implements CrdtDoc { constructor(actor: string); readonly actor: string; getMap(name): CrdtMap; transact(fn, origin?): void; applyOps(ops, origin?): void; encodeState(): PyreonCrdtOp[]; destroy(): void }',
      summary:
        "A state-based (CvRDT) LWW register-map document. Each register carries a Lamport-clock timestamp plus the writing `actor` id; a local write bumps the doc's monotonic clock, and a receive advances it to `max(local, incoming)` so a later local write always out-ranks anything already seen. Merge is deterministic — a higher clock wins, an equal clock is broken by the higher actor id — so `applyOps` (or a full `encodeState()` dump) converges regardless of order, duplicates, or partial delivery, which is what makes offline-then-reconnect 'just another merge' rather than a special case. `applyOps` fires observers but never re-emits ops, which is the structural half of loop-prevention (the transport's REMOTE-origin skip is the other half).",
      example: `const doc = new PyreonCrdtDoc("device-1")
const map = doc.getMap("todos")
doc.transact(() => map.set("title", "Buy milk"))
const state = doc.encodeState() // ship this to a fresh peer to seed it`,
      mistakes: [
        'Calling `applyOps` from inside an in-progress local `transact` — it is guarded to no-op there; remote merges are meant to land at rest, which is how the transport always calls it',
        'Assuming `encodeState()` is a diff — it is the FULL state (every register, every map); sending it on every change instead of relaying incremental ops (what `connectPyreonSync` actually does) wastes bandwidth',
        'Constructing two docs with the SAME actor id and treating them as independent peers — the LWW tie-break can no longer distinguish their writes',
      ],
      seeAlso: ['PyreonCrdtAdapter', 'connectPyreonSync', 'createNativeSyncHost'],
    },
    {
      name: 'createActorId',
      kind: 'function',
      signature: '() => string',
      summary:
        "Mint a per-peer actor id — the LWW tie-breaker `PyreonCrdtDoc` uses to deterministically resolve a concurrent write. Prefers `crypto.randomUUID()`; falls back to `crypto.getRandomValues` (hex-encoded) on runtimes without `randomUUID` (older/non-secure-context), and as a last resort mixes a per-process monotonic counter with `Date.now()`/`Math.random()` so two ids minted in the SAME process can never collide even under degraded entropy. Two LIVE peers must never share an id — generate once per doc/session and persist it (e.g. to `useSecureStorage`) for a stable per-install device identity across restarts.",
      example: `import { createActorId, pyreonAdapter } from "@pyreon/sync"
// Generate once, persist it, and reuse on every subsequent launch.
const actor = loadPersistedActorId() ?? createActorId()
savePersistedActorId(actor)
const adapter = pyreonAdapter(actor)`,
      mistakes: [
        'Calling it fresh on every mount instead of persisting the result — a new id each launch means the LWW tie-break can no longer recognize "this is the same device that wrote last time"',
        "Assuming it's cryptographically unique across ALL environments — the fallback path (no `crypto.randomUUID`/`getRandomValues`) only guarantees uniqueness WITHIN one process; that path is a last resort, not the common case",
      ],
      seeAlso: ['pyreonAdapter', 'PyreonCrdtDoc'],
    },
    {
      name: 'connectPyreonSync',
      kind: 'function',
      signature: '(doc: PyreonCrdtDoc, channel: SyncChannel) => { disconnect(): void }',
      summary:
        "Wire a `PyreonCrdtDoc` to a peer over a `SyncChannel` — the pure-TS engine's transport, JSON-over-any-string-duplex with no binary framing, so the SAME code runs on web AND inside a native JS runtime bridged to native signals. On open it sends the doc's full state (`encodeState()`); thereafter it relays only LOCAL ops as they commit (`doc._onOps`). Inbound messages merge under `REMOTE_ORIGIN`; a malformed or foreign message is silently ignored rather than thrown. Echo-prevention is structural, not a filter: `PyreonCrdtDoc.applyOps` fires observers but emits NO ops, so a received update is never picked up by the local-ops relay and re-broadcast.",
      example: `import { connectPyreonSync, webSocketChannel } from "@pyreon/sync"
const channel = webSocketChannel("wss://sync.example.com/my-room")
const { disconnect } = connectPyreonSync(doc, channel)
// later:
disconnect()`,
      mistakes: [
        "Writing a custom `SyncChannel` that re-delivers its OWN sent messages back through `onMessage` — that reintroduces an echo the doc-level guard can't see, because from the doc's perspective it looks like a genuine (if redundant) remote update",
        'Expecting `disconnect()` to tear down the doc — it only stops relaying ops and closes the channel; call `doc.destroy()` separately for a full local teardown',
      ],
      seeAlso: ['webSocketChannel', 'PyreonCrdtDoc', 'createNativeSyncHost'],
    },
    {
      name: 'webSocketChannel',
      kind: 'function',
      signature: '(url: string, WebSocketImpl?: WebSocketCtor) => SyncChannel',
      summary:
        'The WebSocket implementation of `SyncChannel` for `connectPyreonSync`. Defaults to `globalThis.WebSocket` (browsers + Node 21+); pass `WebSocketImpl` to inject the `ws` package (older Node relay tests) or a native-runtime socket shim — the same seam `createNativeSyncHost` uses to accept a platform-bridged `WebSocket`. Throws a clear `[Pyreon]`-prefixed error immediately (not a bare `ReferenceError`) when no implementation is available and none was injected, so a missing global fails loud at the call site instead of deep inside a send.',
      example: `import { connectPyreonSync, webSocketChannel } from "@pyreon/sync"
const channel = webSocketChannel("wss://sync.example.com/room", MyWsPolyfill)
connectPyreonSync(doc, channel)`,
      mistakes: [
        "Assuming it works on older Node without passing `WebSocketImpl` — global `WebSocket` is Node 21+; pass the `ws` package's constructor on older runtimes",
      ],
      seeAlso: ['connectPyreonSync', 'createNativeSyncHost'],
    },
    {
      name: 'createNativeSyncHost',
      kind: 'function',
      signature:
        '(options: { actor: string; url?: string; WebSocketImpl?: WebSocketCtor }) => NativeSyncHost',
      summary:
        "The JS side of the contract a native runtime host (iOS JavaScriptCore, an Android JS engine) drives to make a native app a real peer in the sync graph. The host evaluates the `@pyreon/sync` bundle, injects a platform-socket-backed `WebSocketCtor` (the same `PyreonWebSocket` `useWebSocket` uses), and calls this once. For each synced key the native UI binds, it calls `host.observe(map, key, cb)` — the callback fires IMMEDIATELY with the current value (seeding the native signal) and again on every change, local or remote; a native UI edit calls `host.set(map, key, value)`. Everything underneath — the LWW engine, the JSON transport, this bridge — is pure JS, so identical code runs on web and native; the host's only job is JS↔native value marshalling. `url` is optional: omit it for a local-only doc with no transport. v1 values crossing the boundary are scalars (string/number/boolean/null).",
      example: `import { createNativeSyncHost } from "@pyreon/sync"
const host = createNativeSyncHost({ actor: "device-1", url: "wss://sync.example.com/room" })
const unobserve = host.observe("doc", "title", (value) => { /* set native @State */ })
host.set("doc", "title", "Hello") // a native UI edit
host.destroy() // tears down the transport + document`,
      mistakes: [
        "Forgetting to call `unobserve()` per key — each `observe` call registers a callback the host must release when the native view unmounts, or it keeps receiving updates for a view that's gone",
        'Passing a non-scalar value through `host.set` — v1 only marshals string/number/boolean/null across the JS↔native boundary',
        'Omitting `url` and expecting cross-device sync — without it the doc is LOCAL-ONLY; the native host still needs to inject a real `WebSocketImpl` for the transport to actually reach a relay',
      ],
      seeAlso: ['connectPyreonSync', 'webSocketChannel', 'pyreonAdapter'],
    },
    {
      name: 'createYjsDoc',
      kind: 'function',
      signature: '(yDoc?: Y.Doc) => YjsCrdtDoc',
      summary:
        'Create a CrdtDoc backed by a real Yjs Y.Doc (or wrap an existing one). Exported from `@pyreon/sync/yjs` — importing it pulls in `yjs`, which is why it is NOT on the core entry. `.yDoc` exposes the underlying Y.Doc for the transports / persistence helpers.',
      example: `import { createYjsDoc, connectViaWebSocket } from "@pyreon/sync/yjs"
const doc = createYjsDoc()
const title = syncedSignal({ doc, key: "title", initial: "Untitled" })
connectViaWebSocket(doc, "wss://sync.example.com/my-room?token=abc")`,
      seeAlso: ['persistViaIndexedDB', 'connectViaWebSocket', 'syncedText'],
    },
    {
      name: 'syncedText',
      kind: 'function',
      signature: '(doc: YjsCrdtDoc, key: string) => SyncedText',
      summary:
        "Bind a Signal<string> to a Yjs Y.Text — a COLLABORATIVE string with character-level CRDT merge. Unlike syncedSignal (scalar last-writer-wins, which drops the loser's value), two peers editing different regions BOTH keep their edits. Use `.insert(i, s)` / `.delete(i, n)` (positional ops Y.Text merges faithfully) for true concurrent editing; `.set(full)` applies a minimal prefix/suffix diff (one replace) — handy for a controlled `<textarea>` but not a positional merge. Engine-specific (in `@pyreon/sync/yjs`, not behind the seam — collab text is coupled to the CRDT's text type).",
      example: `const body = syncedText(doc, "body")
// <textarea value={body()} onInput={e => body.set(e.currentTarget.value)} />
body.insert(0, "Hello ")  // positional — merges with a concurrent peer edit
body.delete(0, 6)`,
      mistakes: [
        "Using `syncedSignal` for a collaboratively-edited string — scalar LWW drops one peer's edit; use `syncedText` so both are kept",
        'Relying on `.set(fullText)` for concurrent multi-region editing — it is a single prefix/suffix-diff replace, not a positional merge; use `.insert`/`.delete` where concurrency matters',
      ],
      seeAlso: ['syncedList', 'syncedSignal'],
    },
    {
      name: 'syncedList',
      kind: 'function',
      signature: '<T>(doc: YjsCrdtDoc, key: string) => SyncedList<T>',
      summary:
        'Bind a Signal<T[]> to a Yjs Y.Array — a COLLABORATIVE list with positional CRDT merge. Concurrent `push`/`insert` from two peers are BOTH kept (no item dropped). Render with a keyed `<For each={() => list()} by={…}>` so a remote change reconciles O(changed). `.push` / `.insert(i, items)` / `.delete(i, count?)` are positional; `.set(next)` does a coarse whole-list replace. Engine-specific (in `@pyreon/sync/yjs`).',
      example: `const items = syncedList<string>(doc, "todos")
items.push("buy milk", "walk dog")  // merges with a concurrent peer push
items.insert(0, ["first"])
items.delete(1, 1)
// <For each={() => items()} by={(t) => t}>{(t) => <li>{t}</li>}</For>`,
      mistakes: [
        'Calling `.set(newArray)` for concurrent edits — whole-list replace resolves by that coarse op, not a positional merge; use `.push`/`.insert`/`.delete`',
        'Rendering with `.map()` instead of a keyed `<For>` — you lose the O(changed) reconcile a remote list change should give',
      ],
      seeAlso: ['syncedText'],
    },
    {
      name: 'syncedAwareness',
      kind: 'function',
      signature:
        '<T extends Record<string, unknown>>(doc: YjsCrdtDoc, initial?: T) => SyncedAwareness<T>',
      summary:
        "Reactive EPHEMERAL presence — who's online + their live cursor — over the Yjs awareness protocol, a SEPARATE channel from the document CRDT (awareness is never merged into the doc and never persisted). Returns read signals (`local` / `others` / `states`) that recompute when any peer joins, leaves, or moves, plus `setLocal` / `setLocalField` to publish your own presence. Wired automatically to whatever transports are (or later get) connected to the doc — they share the doc's single Awareness. The relay is awareness-stateful, so a new client sees existing peers INSTANTLY and a crashed peer is purged on disconnect. Create it BEFORE connecting a transport (the transport peeks for the doc's awareness at connect time).",
      example: `import { createYjsDoc, syncedAwareness, connectViaWebSocket } from "@pyreon/sync/yjs"
const doc = createYjsDoc()
const presence = syncedAwareness<{ name: string; cursor?: { x: number; y: number } }>(
  doc, { name: "Vít" },
)
connectViaWebSocket(doc, "wss://sync.example.com/room?token=abc")
// live cursors: window.addEventListener("mousemove", e =>
//   presence.setLocalField("cursor", { x: e.clientX, y: e.clientY }))
// <For each={() => presence.others()} by={p => p.clientId}>
//   {p => <Cursor color={p.state.color} at={p.state.cursor} />}</For>`,
      mistakes: [
        'Putting durable data in awareness — it is EPHEMERAL and never persisted; a peer state vanishes on disconnect. Use syncedSignal/syncedStore/syncedText for data that must survive',
        'Creating it AFTER connecting a transport — the transport peeks for the doc awareness at connect, so presence created later is not wired. Create syncedAwareness BEFORE connectViaWebSocket / connectViaBroadcastChannel',
        'Reading `others()` / `local()` outside a reactive scope and expecting it to update — they are signals; read them inside JSX / an effect / a computed so the UI tracks presence changes',
        'Treating cursor coordinates as exact across clients — they are raw viewport points with no scroll / window-size normalization (good enough for v1; map to content coordinates if you need pixel parity)',
        'Expecting `dispose()` to announce your departure / tear down the shared awareness — it only detaches THIS view\'s observer. The TRANSPORT announces departure on disconnect, and the DOC owns teardown (doc.destroy()). So dispose the view freely (a second view + the transports keep working); call doc.destroy() for a full local teardown',
        'Assuming presence scales to hundreds of peers cheaply — every awareness change rebuilds the full peers snapshot (O(N) in peer count) and re-runs each `others()` consumer; fine for the typical handful-to-dozens of collaborators, but a large cursor swarm will re-render on every mouse move (throttle cursor publishes; this is a v1 limit, not free)',
      ],
      seeAlso: ['SyncedAwareness', 'PeerState', 'connectViaWebSocket', 'createSyncServer'],
    },
    {
      name: 'SyncedAwareness',
      kind: 'type',
      signature:
        'interface SyncedAwareness<T> { setLocal(s: T): void; setLocalField<K extends keyof T>(k: K, v: T[K]): void; local: Signal<T | null>; others: Signal<PeerState<T>[]>; states: Signal<PeerState<T>[]>; awareness: Awareness; dispose(): void }',
      summary:
        "The reactive presence handle from syncedAwareness. `others` is every peer EXCEPT you (the avatars / cursors to render); `states` includes you; `local` is your own published state. `setLocal` / `setLocalField` publish; `awareness` is the raw y-protocols escape hatch; `dispose()` detaches ONLY this view's observer (idempotent; auto-called via onCleanup in a reactive scope) — it does NOT destroy the doc-shared awareness (the doc owns that via doc.destroy()) and does NOT announce departure (the transport does, on disconnect).",
      example: `const p: SyncedAwareness<{ name: string }> = syncedAwareness(doc, { name: "Vít" })
p.others()  // PeerState<{ name: string }>[] — other people here`,
      seeAlso: ['syncedAwareness', 'PeerState'],
    },
    {
      name: 'PeerState',
      kind: 'type',
      signature: 'interface PeerState<T> { clientId: number; state: T; isLocal: boolean }',
      summary:
        "One peer's presence entry: its awareness `clientId` (use it as the `<For>` key), its published `state`, and `isLocal` (whether it is you). `others()` returns only `isLocal: false` entries; `states()` returns all.",
      example: `<For each={() => presence.others()} by={p => p.clientId}>
  {p => <Avatar name={p.state.name} />}
</For>`,
      seeAlso: ['syncedAwareness', 'SyncedAwareness'],
    },
    {
      name: 'connectViaBroadcastChannel',
      kind: 'function',
      signature: '(doc: YjsCrdtDoc, channelName: string) => { disconnect(): void }',
      summary:
        'Same-origin CROSS-TAB sync over BroadcastChannel — edits in one tab appear in another tab of the same origin, no server. Includes a minimal state-vector handshake so a late-opening tab catches up. Follows the universal echo rule: a REMOTE-origin update is never re-broadcast, so there is no loop.',
      example: `const doc = createYjsDoc()
const link = connectViaBroadcastChannel(doc, "my-doc-room")
// edit in tab A → the same <h1> patches in place in tab B
link.disconnect()`,
      mistakes: [
        'Expecting cross-DEVICE sync — BroadcastChannel is same-origin/same-browser only; use connectViaWebSocket + a relay for cross-device',
      ],
      seeAlso: ['connectViaWebSocket', 'persistViaIndexedDB'],
    },
    {
      name: 'connectViaWebSocket',
      kind: 'function',
      signature:
        '(doc: YjsCrdtDoc, url: string, options?: WebSocketTransportOptions) => WebSocketTransport',
      summary:
        "Sync a YjsCrdtDoc to a relay over WebSocket — the CROSS-DEVICE transport. Sends our state vector on open (relay replies with the diff), then live updates; a REMOTE-origin update is never re-sent (no loop). Reconnects with exponential backoff by default. Uses the global WebSocket (browsers / Node 22+ / Bun / Deno); pass `WebSocketImpl` on older Node. Auth: put a token in the `url` query string — browser WebSockets can't set headers — which the relay's `authorize` hook reads. Exposes a REACTIVE `synced` signal + `whenSynced()` promise (the y-websocket convention) — `synced` becomes true once the initial sync round-trip completes; `syncedSignal` defers its create-if-missing seed on this internally so a fresh peer's default can't clobber a peer's real value (issue #2380). Attach the transport BEFORE creating synced signals.",
      example: `import { connectViaWebSocket, createYjsDoc } from "@pyreon/sync/yjs"
const doc = createYjsDoc()
const t = connectViaWebSocket(doc, "wss://sync.example.com/my-room?token=abc")
// t.synced() // reactive: false until the first sync round-trip completes
await t.whenSynced()      // gate your OWN default writes on this
t.disconnect()            // close + stop reconnecting`,
      mistakes: [
        "Trying to set an Authorization header — browser WebSockets can't; pass the token in the URL query string and read it in the relay's `authorize`",
        "Using it on old Node without a global WebSocket and not passing `WebSocketImpl` — it throws; pass the `ws` package's WebSocket",
        "Treating a 4401 close as retryable — that is the relay's authz rejection and is terminal; reconnect won't help",
        "Writing an app-level DEFAULT for a key before `synced` — it can race a peer's real value on a random-clientId tie-break and clobber it. Gate default writes on `await transport.whenSynced()` / `transport.synced()`. (`syncedSignal`'s OWN seed already defers internally; this is for your explicit writes.)",
        "Creating synced signals BEFORE attaching the transport — the seed-deferral guarantee needs the transport registered on the doc first, else the seed fires immediately (as if alone)",
      ],
      seeAlso: ['createSyncServer', 'connectViaBroadcastChannel', 'syncedSignal'],
    },
    {
      name: 'persistViaIndexedDB',
      kind: 'function',
      signature: '(doc: YjsCrdtDoc, dbName: string) => YjsPersistence',
      summary:
        'Persist a YjsCrdtDoc to IndexedDB so edits survive a reload and the app works offline (thin wrapper over y-indexeddb). Browser-only — it opens the IndexedDB connection eagerly. AWAIT `.whenSynced` BEFORE creating syncedSignals so create-if-missing adopts the persisted value instead of racing the async load against a fresh seed.',
      example: `const doc = createYjsDoc()
const persist = persistViaIndexedDB(doc, "my-app-doc")
await persist.whenSynced  // load persisted state FIRST
const title = syncedSignal({ doc, key: "title", initial: "Untitled" })`,
      mistakes: [
        'Creating syncedSignals before awaiting `.whenSynced` — the fresh seed can race the async load and clobber the persisted value',
        'Calling it under Node/SSR — it constructs an IndexedDB connection eagerly; importing is safe, calling is browser-only',
      ],
      seeAlso: ['createYjsDoc', 'syncedSignal'],
    },
    {
      name: 'createSyncServer',
      kind: 'function',
      signature: '(options: SyncServerOptions) => Promise<SyncServer>',
      summary:
        "Start a Node/Bun WebSocket relay that brokers Yjs sync between clients sharing a room. Keeps one authoritative Y.Doc per room (so a late-joiner catches up), applies each inbound update, and broadcasts to the room's OTHER clients. Server-only (`@pyreon/sync/server` — imports `ws` + `node:http`, never enters a client bundle). The `authorize(ctx)` hook is the per-room/per-doc access gate: return false (or throw) to reject with close code 4401 before any data flows. Omitting it accepts EVERY connection (an open relay) and warns once at startup, in production too. Rooms are GC'd when the last client leaves — the relay is ephemeral (no persistence); clients keep their own copy. Pass `server` to attach to an existing http.Server instead of opening a port.",
      example: `import { createSyncServer } from "@pyreon/sync/server"
const relay = await createSyncServer({
  port: 1234,
  authorize: ({ room, token }) => token === secretFor(room), // REQUIRED in prod
})
// later: await relay.close()`,
      mistakes: [
        'Deploying without an `authorize` hook — the default allows EVERY connection (dev-only); a real deployment MUST supply it or anyone with the room id can read/write. `createSyncServer` warns once at startup when the hook is absent, in production as well as development, because an open relay is a live misconfiguration rather than a developer-time nicety.',
        'Importing `@pyreon/sync/server` into client code — it pulls `ws` + `node:http`; it is the server-only subpath by design',
        'Expecting the relay to persist data — it is ephemeral; durability lives on the clients (persistViaIndexedDB) or an external store',
      ],
      seeAlso: ['connectViaWebSocket', 'AuthorizeContext'],
    },
    {
      name: 'AuthorizeContext',
      kind: 'type',
      signature:
        'interface AuthorizeContext { room: string; token: string | null; req: IncomingMessage }',
      summary:
        "Context passed to the relay's `authorize` hook: the `room` parsed from the URL path, the `token` query-string param (browser WebSockets can't set headers, so auth rides the query string), and the raw HTTP upgrade `req` (read cookies / headers here if you prefer).",
      example: `authorize: ({ room, token, req }) => verify(room, token)`,
      seeAlso: ['createSyncServer'],
    },
  ],
  gotchas: [
    {
      label: 'Subpath layout',
      note: '`@pyreon/sync` (core bridge — engine-free, universal), `@pyreon/sync/yjs` (real Yjs engine + transports + persistence + collaborative text/lists — pulls in `yjs`), `@pyreon/sync/server` (Node/Bun relay — pulls in `ws` + `node:http`, never import into client code).',
    },
    {
      label: 'CRDTs prevent lost UPDATES, not semantic conflicts',
      note: "Never market this as 'never lose data'. Scalar `syncedSignal` is last-writer-wins — the loser's value is silently dropped. `syncedText`/`syncedList` keep both peers' ops but the merged result may be semantically nonsensical (interleaved sentences). Real apps still need conflict UX (presence, indicators, optional locking).",
    },
    {
      label: 'Bundle weight',
      note: "A synced app ships `yjs` (~40KB min+gz) + `y-indexeddb` + the WebSocket client on TOP of the core runtime — realistically ~60KB+ gz. It is off the core hot path (opt-in `/yjs` import) and justified by the capability, but a synced Pyreon app is NOT a 'smaller than Solid' app.",
    },
    {
      label: 'Awareness is ephemeral + the relay is stateful for it',
      note: "Presence (syncedAwareness — who's here + cursors) rides a SEPARATE channel from doc updates, is NEVER persisted, and is purged the moment a peer disconnects. The relay tracks per-room awareness (a deliberate departure from its otherwise-stateless doc relay) so a new client sees existing peers instantly and a crashed client is cleaned up on socket close. Don't store anything durable in awareness, and create syncedAwareness BEFORE connecting a transport.",
    },
    {
      label: 'Authorization is table-stakes',
      note: "The relay's `authorize` default ALLOWS everything (dev only). Production MUST gate reads + writes per room/doc. Whole-doc CRDTs make partial (per-field) access genuinely hard — use per-doc rooms or permission-scoped sub-docs.",
    },
    {
      label: 'Native / PMTC sync is out of near-term scope',
      note: 'The `CrdtAdapter` seam keeps a future Loro-via-FFI native engine door open, but compiler WS-emit + a native WS runtime + a CRDT-via-FFI engine are not in scope yet.',
    },
  ],
})
