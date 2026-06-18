import {
  type CrdtAdapter,
  type CrdtDoc,
  type CrdtMap,
  type CrdtOrigin,
  LOCAL_ORIGIN,
  REMOTE_ORIGIN,
} from './types'

/**
 * In-memory CRDT engine for tests — implements the {@link CrdtAdapter} seam with
 * no external dependency. Each map is a flat key → scalar last-writer-wins
 * register; writes batch inside {@link FakeCrdtDoc.transact} and fire observers
 * once per commit with the changed keys + origin.
 *
 * This deliberately does NOT model real CRDT merge math (logical clocks,
 * tombstones, offline op-buffering) — Yjs owns that, and the real Yjs adapter is
 * where convergence-after-offline is tested. The fake exists to exercise the
 * **reactive bridge** (`syncedSignal` / `syncedStore`): the local-write → CRDT →
 * observer → signal loop, echo-prevention, and live peer relay. {@link connectFakeDocs}
 * is the transport stand-in.
 */

interface CommitEntry {
  mapName: string
  key: string
  value: unknown
}

type CommitListener = (committed: readonly CommitEntry[], origin: CrdtOrigin) => void

class FakeCrdtMap implements CrdtMap {
  /** @internal */ readonly _store = new Map<string, unknown>()
  private readonly observers = new Set<
    (changedKeys: ReadonlySet<string>, origin: CrdtOrigin) => void
  >()

  constructor(
    private readonly doc: FakeCrdtDoc,
    private readonly name: string,
  ) {}

  get(key: string): unknown {
    return this._store.get(key)
  }

  has(key: string): boolean {
    return this._store.has(key)
  }

  keys(): string[] {
    return [...this._store.keys()]
  }

  set(key: string, value: unknown): void {
    // LWW register: a write to the same value is a no-op (no observer fire, no
    // commit entry) — mirrors Yjs, where setting an equal scalar produces no
    // delta. This is what makes the bridge's echo harmless even before the
    // signal's own Object.is guard.
    if (this._store.has(key) && Object.is(this._store.get(key), value)) return
    // Auto-wrap a bare write in an implicit local transaction, matching Yjs's
    // forgiving behavior. The bridge always writes inside `transact`, so this
    // path is only hit by stray test writes.
    this.doc._applyWrite(this, this.name, key, value)
  }

  observe(
    cb: (changedKeys: ReadonlySet<string>, origin: CrdtOrigin) => void,
  ): () => void {
    this.observers.add(cb)
    return () => {
      this.observers.delete(cb)
    }
  }

  /** @internal — fired by the doc at transaction commit. */
  _notify(changedKeys: ReadonlySet<string>, origin: CrdtOrigin): void {
    // Snapshot so an observer that unsubscribes mid-iteration can't mutate the
    // set we're walking.
    for (const cb of [...this.observers]) cb(changedKeys, origin)
  }
}

export class FakeCrdtDoc implements CrdtDoc {
  private readonly maps = new Map<string, FakeCrdtMap>()
  private readonly commitListeners = new Set<CommitListener>()
  private destroyed = false

  // Transaction state. `depth` flattens nested transacts; `origin` is the
  // outermost transaction's origin (it wins). `pending` accumulates per-map
  // changed keys; `committed` accumulates the flat (map, key, value) list for
  // doc-level commit listeners (the network relay).
  private depth = 0
  private origin: CrdtOrigin = LOCAL_ORIGIN
  private readonly pending = new Map<FakeCrdtMap, Set<string>>()
  private committed: CommitEntry[] = []

  getMap(name: string): CrdtMap {
    let map = this.maps.get(name)
    if (!map) {
      map = new FakeCrdtMap(this, name)
      this.maps.set(name, map)
    }
    return map
  }

  transact(fn: () => void, origin: CrdtOrigin = LOCAL_ORIGIN): void {
    if (this.destroyed) return
    if (this.depth === 0) this.origin = origin
    this.depth++
    try {
      fn()
    } finally {
      this.depth--
      if (this.depth === 0) this.commit()
    }
  }

  destroy(): void {
    this.destroyed = true
    this.maps.clear()
    this.commitListeners.clear()
    this.pending.clear()
    this.committed = []
  }

  /** @internal — called by FakeCrdtMap.set. Auto-wraps if no open transaction. */
  _applyWrite(map: FakeCrdtMap, mapName: string, key: string, value: unknown): void {
    if (this.depth === 0) {
      // Bare write outside transact → implicit local transaction.
      this.transact(() => this._applyWrite(map, mapName, key, value), LOCAL_ORIGIN)
      return
    }
    map._store.set(key, value)
    let keys = this.pending.get(map)
    if (!keys) {
      keys = new Set()
      this.pending.set(map, keys)
    }
    keys.add(key)
    this.committed.push({ mapName, key, value })
  }

  /** @internal — subscribe to doc-level commits. Used by the network relay. */
  _onCommit(listener: CommitListener): () => void {
    this.commitListeners.add(listener)
    return () => {
      this.commitListeners.delete(listener)
    }
  }

  private commit(): void {
    if (this.pending.size === 0) return
    const perMap = [...this.pending.entries()]
    const committedEntries = this.committed
    const origin = this.origin
    // Reset BEFORE firing so an observer that writes (re-entrant transaction)
    // starts a clean accumulator rather than corrupting this one.
    this.pending.clear()
    this.committed = []
    for (const [map, keys] of perMap) map._notify(keys, origin)
    /* v8 ignore next — false arm unreachable: commit() only runs when the transaction
       produced committed entries (a same-value write is a no-op that never commits). */
    if (committedEntries.length > 0) {
      for (const cb of [...this.commitListeners]) cb(committedEntries, origin)
    }
  }
}

export class FakeCrdtAdapter implements CrdtAdapter {
  createDoc(): CrdtDoc {
    return new FakeCrdtDoc()
  }
}

/**
 * Convenience: a shared adapter instance for tests that just need docs.
 */
export const fakeAdapter: CrdtAdapter = new FakeCrdtAdapter()

/**
 * Wire two {@link FakeCrdtDoc}s into a live peer-to-peer link — the in-memory
 * stand-in for the WebSocket transport. A commit on one doc is replayed onto the
 * other under {@link REMOTE_ORIGIN}.
 *
 * **Echo-prevention (modeled exactly as y-websocket does it):** the relay
 * forwards a commit only when its origin is NOT `REMOTE_ORIGIN`. So A's local
 * write relays to B as remote; B's resulting commit is remote-origin, which the
 * relay does NOT send back to A. The guard is in the TRANSPORT (here), never in
 * the bridge's observer.
 *
 * Note: this fake also halts a round-trip via the LWW no-op (a re-applied equal
 * scalar produces no commit), so *correctness* (convergence, no infinite loop)
 * does not depend on the guard alone. The guard's distinct job is avoiding a
 * **wasted re-forward** of a received update — observable via {@link forwards}
 * (one forward per local write, never a second for the echo). In a real engine
 * the guard matters more (re-broadcasting a received binary update is real wire
 * traffic), so it is kept and exercised here.
 *
 * Returns `{ disconnect, forwards }`. `disconnect` stops relaying (the offline
 * case); `forwards()` is the count of transactions actually relayed. This fake
 * does not buffer-and-replay on reconnect — that is a real-CRDT property, tested
 * against the Yjs adapter, not here.
 */
export function connectFakeDocs(
  a: FakeCrdtDoc,
  b: FakeCrdtDoc,
): { disconnect: () => void; forwards: () => number } {
  let connected = true
  let forwardCount = 0

  const relay = (to: FakeCrdtDoc): CommitListener => {
    return (committed, origin) => {
      /* v8 ignore next — belt-and-suspenders: disconnect() unsubscribes both commit
         listeners, so the relay never fires after disconnect; this guard never runs. */
      if (!connected) return
      // Never echo a received update back to its sender.
      if (origin === REMOTE_ORIGIN) return
      forwardCount++
      to.transact(() => {
        const toMaps = to as unknown as { getMap(name: string): CrdtMap }
        for (const { mapName, key, value } of committed) {
          toMaps.getMap(mapName).set(key, value)
        }
      }, REMOTE_ORIGIN)
    }
  }

  const offA = a._onCommit(relay(b))
  const offB = b._onCommit(relay(a))

  return {
    forwards: () => forwardCount,
    disconnect() {
      connected = false
      offA()
      offB()
    },
  }
}
