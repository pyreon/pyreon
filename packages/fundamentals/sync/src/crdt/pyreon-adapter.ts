import {
  type CrdtAdapter,
  type CrdtDoc,
  type CrdtMap,
  type CrdtOrigin,
  LOCAL_ORIGIN,
} from './types'

/**
 * A pure-TS last-writer-wins CRDT engine implementing the engine-neutral
 * {@link CrdtAdapter} seam.
 *
 * WHY IT EXISTS — MULTIPLATFORM 1:1. The Yjs adapter gives rich sequence CRDTs
 * (`Y.Text` / `Y.Array`) but is a web-only npm ENGINE (PMTC compiles your source,
 * not npm libraries). This engine is **pure logic** — no external dependency,
 * only `Map`, numbers, and comparisons — so the Pyreon Multi-Target Compiler
 * lowers the SAME source to SwiftUI + Compose. A web peer and a native peer
 * therefore run byte-identical merge math and CONVERGE over one simple protocol.
 *
 * SCOPE. Matches the v1 seam exactly: a `CrdtMap` is a flat key → scalar
 * last-writer-wins register (collections stored as whole-value-replaced scalars).
 * Rich collaborative text/lists stay on the Yjs engine (web) until a native
 * sequence-CRDT engine (yrs) lands — the seam lets both coexist.
 *
 * CONVERGENCE MODEL. Each register carries a Lamport-clock timestamp + the
 * writing actor's id. A write bumps the doc's monotonic clock; a receive advances
 * it to `max(local, incoming)` so a later local write always out-ranks anything
 * seen. Merge is deterministic: a higher clock wins; an equal clock is broken by
 * the higher actor id. This is a state-based (CvRDT) register map — merging full
 * states (or any subset of ops, in any order, with duplicates) always converges,
 * so offline-then-reconnect is just another merge. No tombstones are needed for
 * v1 because a delete is modeled as a whole-value replace (set to `undefined`).
 */

/** One LWW register: the value plus the (clock, actor) it was written at. */
interface Register {
  value: unknown
  clock: number
  actor: string
}

/** A single op on the wire: which map/key changed, and its register stamp. */
export interface PyreonCrdtOp {
  map: string
  key: string
  value: unknown
  clock: number
  actor: string
}

/** `true` if `remote` should overwrite `local` under LWW (higher clock wins;
 *  equal clock → higher actor id wins). A deterministic total order, so every
 *  peer resolves a concurrent pair the same way. */
function remoteWins(local: Register, remote: { clock: number; actor: string }): boolean {
  if (remote.clock !== local.clock) return remote.clock > local.clock
  return remote.actor > local.actor
}

class PyreonCrdtMap implements CrdtMap {
  /** @internal */ readonly registers = new Map<string, Register>()
  private readonly observers = new Set<
    (changedKeys: ReadonlySet<string>, origin: CrdtOrigin) => void
  >()

  constructor(
    private readonly doc: PyreonCrdtDoc,
    private readonly name: string,
  ) {}

  get(key: string): unknown {
    const r = this.registers.get(key)
    return r === undefined ? undefined : r.value
  }

  has(key: string): boolean {
    return this.registers.has(key)
  }

  keys(): string[] {
    return [...this.registers.keys()]
  }

  set(key: string, value: unknown): void {
    // LWW no-op on an equal scalar (mirrors Yjs — no delta, no observer fire),
    // so the bridge's echo is harmless before the signal's own Object.is guard.
    const existing = this.registers.get(key)
    if (existing !== undefined && Object.is(existing.value, value)) return
    this.doc._applyLocalWrite(this, this.name, key, value)
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
    for (const cb of [...this.observers]) cb(changedKeys, origin)
  }
}

/** Doc-level op listener — the transport subscribes to relay local writes. */
type OpListener = (ops: readonly PyreonCrdtOp[], origin: CrdtOrigin) => void

export class PyreonCrdtDoc implements CrdtDoc {
  private readonly maps = new Map<string, PyreonCrdtMap>()
  private readonly opListeners = new Set<OpListener>()
  private destroyed = false

  /** This peer's stable id — the LWW tie-breaker. */
  readonly actor: string
  /** Monotonic Lamport clock. Bumped on every local write; advanced to
   *  max(local, incoming) on receive so later local writes always out-rank. */
  private clock = 0

  // Transaction state (flattening nested transacts; outermost origin wins).
  private depth = 0
  private origin: CrdtOrigin = LOCAL_ORIGIN
  private readonly pending = new Map<PyreonCrdtMap, Set<string>>()
  private committedOps: PyreonCrdtOp[] = []

  constructor(actor: string) {
    this.actor = actor
  }

  getMap(name: string): CrdtMap {
    let map = this.maps.get(name)
    if (!map) {
      map = new PyreonCrdtMap(this, name)
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
    this.opListeners.clear()
    this.pending.clear()
    this.committedOps = []
  }

  /** @internal — a local `.set`: stamp a fresh (clock, actor) register. */
  _applyLocalWrite(map: PyreonCrdtMap, mapName: string, key: string, value: unknown): void {
    if (this.depth === 0) {
      this.transact(() => this._applyLocalWrite(map, mapName, key, value), LOCAL_ORIGIN)
      return
    }
    this.clock++
    const reg: Register = { value, clock: this.clock, actor: this.actor }
    map.registers.set(key, reg)
    this.stagePending(map, key)
    this.committedOps.push({ map: mapName, key, value, clock: reg.clock, actor: reg.actor })
  }

  /**
   * Merge inbound ops from a remote peer (LWW). Wire-agnostic: the transport
   * decodes bytes/text into {@link PyreonCrdtOp}s and hands them here. Advances
   * the Lamport clock, applies each op that wins its register, fires observers
   * once under `origin` (default {@link REMOTE_ORIGIN} is the transport's to set).
   */
  applyOps(ops: readonly PyreonCrdtOp[], origin: CrdtOrigin): void {
    if (this.destroyed || ops.length === 0) return
    if (this.depth !== 0) {
      // Never merge remote ops mid-local-transaction — the transport always
      // calls this at rest. Guarded defensively.
      return
    }
    this.origin = origin
    this.depth++
    try {
      for (const op of ops) {
        // Advance the Lamport clock past anything we've seen.
        if (op.clock > this.clock) this.clock = op.clock
        const map = this.maps.get(op.map) ?? (this.getMap(op.map) as PyreonCrdtMap)
        const local = map.registers.get(op.key)
        if (local !== undefined && !remoteWins(local, op)) continue // our register wins — drop
        if (local !== undefined && Object.is(local.value, op.value) && local.clock === op.clock) {
          continue // identical — no change
        }
        map.registers.set(op.key, { value: op.value, clock: op.clock, actor: op.actor })
        this.stagePending(map, op.key)
      }
    } finally {
      this.depth--
      // Commit WITHOUT re-broadcasting: applyOps stages pending observer fires
      // but does NOT push to committedOps, so the op-listener relay does not
      // re-emit a received update (echo-prevention lives here + in the transport).
      this.commitObserversOnly()
    }
  }

  /**
   * The full state as a flat op list — every register stamped with its
   * (clock, actor). A peer sends this on connect; the receiver merges it (any
   * order, duplicates, partial — all converge). This IS the state vector for a
   * register map: each register already carries its own timestamp.
   */
  encodeState(): PyreonCrdtOp[] {
    const out: PyreonCrdtOp[] = []
    for (const [mapName, map] of this.maps) {
      for (const [key, reg] of map.registers) {
        out.push({ map: mapName, key, value: reg.value, clock: reg.clock, actor: reg.actor })
      }
    }
    return out
  }

  /** @internal — subscribe to LOCAL commits as ops. The transport relays these
   *  onto the wire. Remote-applied ops are NOT emitted here (no re-broadcast). */
  _onOps(listener: OpListener): () => void {
    this.opListeners.add(listener)
    return () => {
      this.opListeners.delete(listener)
    }
  }

  private stagePending(map: PyreonCrdtMap, key: string): void {
    let keys = this.pending.get(map)
    if (!keys) {
      keys = new Set()
      this.pending.set(map, keys)
    }
    keys.add(key)
  }

  /** Local-transaction commit: fire observers AND relay ops to the wire. */
  private commit(): void {
    if (this.pending.size === 0) return
    const perMap = [...this.pending.entries()]
    const ops = this.committedOps
    const origin = this.origin
    this.pending.clear()
    this.committedOps = []
    for (const [map, keys] of perMap) map._notify(keys, origin)
    if (ops.length > 0) {
      for (const cb of [...this.opListeners]) cb(ops, origin)
    }
  }

  /** Remote-merge commit: fire observers only (no wire re-broadcast). */
  private commitObserversOnly(): void {
    if (this.pending.size === 0) return
    const perMap = [...this.pending.entries()]
    const origin = this.origin
    this.pending.clear()
    this.committedOps = []
    for (const [map, keys] of perMap) map._notify(keys, origin)
  }
}

/**
 * The pure-TS LWW engine factory. `actor` is this peer's stable id (the LWW
 * tie-breaker) — inject a device id / uuid; the same value must NOT be shared by
 * two live peers. On web, generate once (e.g. `crypto.randomUUID()`); on native
 * the runtime supplies a per-install id.
 */
export class PyreonCrdtAdapter implements CrdtAdapter {
  constructor(private readonly actor: string) {}

  createDoc(): CrdtDoc {
    return new PyreonCrdtDoc(this.actor)
  }
}

/** A per-peer actor id (the LWW tie-breaker). Uses `crypto.randomUUID` when
 *  available; falls back to a timestamp+random string. Two LIVE peers must not
 *  share an id, so generate once per doc/session and persist it if you want a
 *  stable device identity. */
export function createActorId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c?.randomUUID) return c.randomUUID()
  return `a-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`
}

/**
 * Convenience factory for the pure-TS LWW engine. Generates a fresh actor id if
 * none is given (persist your own for a stable device identity).
 *
 * ```ts
 * const adapter = pyreonAdapter()      // dependency-free scalar-map CRDT
 * const doc = adapter.createDoc()
 * ```
 */
export function pyreonAdapter(actor: string = createActorId()): PyreonCrdtAdapter {
  return new PyreonCrdtAdapter(actor)
}
