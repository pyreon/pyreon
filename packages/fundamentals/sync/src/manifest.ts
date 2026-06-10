import { defineManifest } from '@pyreon/manifest'

/**
 * Manifest for `@pyreon/sync` — the single source of truth for the package's
 * generated docs surfaces (`llms.txt` bullet, `llms-full.txt` section, the MCP
 * `api-reference` region, and the CLAUDE.md table row). Edit this, then run
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
  features: [
    'syncedSignal / syncedStore — bind a Signal to a CRDT map entry; a synced signal is indistinguishable from a normal signal to the compiler and every effect',
    'Engine-neutral CrdtAdapter / CrdtDoc / CrdtMap seam + an in-memory FakeCrdtAdapter for dependency-free unit tests',
    'Real Yjs engine behind the @pyreon/sync/yjs subpath (yjs stays out of the core entry)',
    'Offline persistence via IndexedDB (persistViaIndexedDB)',
    'Same-origin cross-tab sync (connectViaBroadcastChannel) + cross-device WebSocket transport (connectViaWebSocket, auto-reconnect)',
    'Collaborative text (syncedText / Y.Text) + lists (syncedList / Y.Array) with true positional merge — concurrent edits keep BOTH',
    'Node/Bun relay server (createSyncServer) with a per-room/per-doc authorize gate + attach-to-existing-HTTP-server mode',
    'Loop-free by construction: the observer applies every change; the transport never re-broadcasts a REMOTE-origin update',
  ],
  api: [
    {
      name: 'syncedSignal',
      kind: 'function',
      signature: '<T>(options: SyncedSignalOptions<T>) => SyncedSignal<T>',
      summary:
        "Bind a Signal<T> to a single scalar entry in a CRDT map. The return value is a NORMAL signal (via wrapSignal — reads / `_v` / `.direct` all delegate), so the compiler's `_bindText`/`_bindDirect` fast paths and every effect treat it like any signal: a remote op becomes one `base.set` → one fine-grained DOM update. The update loop has a single writer — `.set(v)` writes ONLY the CRDT; the map observer is the one path that writes the base signal (for local AND remote commits); the local echo is an `Object.is` no-op.",
      example: `const title = syncedSignal({ doc, key: "title", initial: "Untitled" })
// <h1>{() => title()}</h1>  — patches in place when any peer edits the title
title()              // "Untitled"  (reactive read)
title.set("Roadmap") // writes the CRDT; the observer drives the DOM update
title.dispose()      // detach observer (auto on onCleanup inside a scope)`,
      mistakes: [
        'Calling `title(newValue)` to write — that reads and ignores the arg like any signal. Use `title.set(newValue)`',
        'Expecting `initial` to win when the key already exists — it is create-if-missing only; a persisted / peer value is authoritative and `initial` is ignored (the local-first convention)',
        'Storing an object/array and expecting per-field surgical updates — v1 is scalar (string/number/boolean); whole-value replace works but re-fires per replace. Use `syncedText`/`syncedList` for collaborative collections',
        'Forgetting `.dispose()` for a module-scope synced signal that outlives any reactive scope (inside a scope it auto-disposes via onCleanup)',
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
      signature: 'class FakeCrdtAdapter implements CrdtAdapter { createDoc(): FakeCrdtDoc }',
      summary:
        "An in-memory, dependency-free CrdtAdapter for unit-testing synced stores without standing up a real engine. Pair docs with `connectFakeDocs(a, b)` to simulate two peers in-process. It does NOT do state-vector reconciliation, so it can't model offline-reconnect convergence — use the Yjs adapter (`createYjsDoc` + a transport) for that.",
      example: `const a = new FakeCrdtAdapter().createDoc()
const b = new FakeCrdtAdapter().createDoc()
connectFakeDocs(a, b)
const sa = syncedSignal({ doc: a, key: "k", initial: 0 })
const sb = syncedSignal({ doc: b, key: "k", initial: 0 })
sa.set(5) // sb() becomes 5`,
      mistakes: [
        'Using the fake adapter to test offline-reconnect convergence — it has no state-vector merge; use the Yjs adapter for that scenario',
        'Shipping the fake adapter to production — it is a test double with no persistence or real conflict resolution',
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
// <textarea value={() => body()} onInput={e => body.set(e.currentTarget.value)} />
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
        "Sync a YjsCrdtDoc to a relay over WebSocket — the CROSS-DEVICE transport. Sends our state vector on open (relay replies with the diff), then live updates; a REMOTE-origin update is never re-sent (no loop). Reconnects with exponential backoff by default. Uses the global WebSocket (browsers / Node 22+ / Bun / Deno); pass `WebSocketImpl` on older Node. Auth: put a token in the `url` query string — browser WebSockets can't set headers — which the relay's `authorize` hook reads.",
      example: `import { connectViaWebSocket, createYjsDoc } from "@pyreon/sync/yjs"
const doc = createYjsDoc()
const t = connectViaWebSocket(doc, "wss://sync.example.com/my-room?token=abc", {
  onConnect: () => console.log("synced"),
})
t.disconnect() // close + stop reconnecting`,
      mistakes: [
        "Trying to set an Authorization header — browser WebSockets can't; pass the token in the URL query string and read it in the relay's `authorize`",
        "Using it on old Node without a global WebSocket and not passing `WebSocketImpl` — it throws; pass the `ws` package's WebSocket",
        "Treating a 4401 close as retryable — that is the relay's authz rejection and is terminal; reconnect won't help",
      ],
      seeAlso: ['createSyncServer', 'connectViaBroadcastChannel'],
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
        "Start a Node/Bun WebSocket relay that brokers Yjs sync between clients sharing a room. Keeps one authoritative Y.Doc per room (so a late-joiner catches up), applies each inbound update, and broadcasts to the room's OTHER clients. Server-only (`@pyreon/sync/server` — imports `ws` + `node:http`, never enters a client bundle). The `authorize(ctx)` hook is the per-room/per-doc access gate: return false (or throw) to reject with close code 4401 before any data flows. Rooms are GC'd when the last client leaves — the relay is ephemeral (no persistence); clients keep their own copy. Pass `server` to attach to an existing http.Server instead of opening a port.",
      example: `import { createSyncServer } from "@pyreon/sync/server"
const relay = await createSyncServer({
  port: 1234,
  authorize: ({ room, token }) => token === secretFor(room), // REQUIRED in prod
})
// later: await relay.close()`,
      mistakes: [
        'Deploying without an `authorize` hook — the default allows EVERY connection (dev-only); a real deployment MUST supply it or anyone with the room id can read/write',
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
      label: 'Authorization is table-stakes',
      note: "The relay's `authorize` default ALLOWS everything (dev only). Production MUST gate reads + writes per room/doc. Whole-doc CRDTs make partial (per-field) access genuinely hard — use per-doc rooms or permission-scoped sub-docs.",
    },
    {
      label: 'Native / PMTC sync is out of near-term scope',
      note: 'The `CrdtAdapter` seam keeps a future Loro-via-FFI native engine door open, but compiler WS-emit + a native WS runtime + a CRDT-via-FFI engine are not in scope yet.',
    },
  ],
})
