/**
 * Reactive devtools bridge — an OPT-IN, leak-free introspection layer
 * over the live signal / computed / effect graph.
 *
 * Powers the `@pyreon/devtools` Signals / Graph / Effects / Console
 * surfaces. Design constraints (mirroring `reactive-trace.ts`):
 *
 *   - **Zero cost until attached.** Every instrumentation entry point
 *     early-returns on `!_active`. The registry is empty and no work
 *     happens until a devtools client calls `activateReactiveDevtools()`.
 *     The single call site per creation/track sits inside the existing
 *     `process.env.NODE_ENV !== 'production'` gate (tree-shaken in prod)
 *     and is structurally identical to the perf-harness counter calls
 *     and `_recordSignalWrite` already on those paths.
 *   - **No retention / no leak.** Nodes are held via `WeakRef` and
 *     pruned by a `FinalizationRegistry`. The registry never pins a
 *     signal/computed/effect alive. Edges + the fire ring buffer hold
 *     only numeric ids and primitives, never node references or values.
 *   - **Snapshot on demand.** `getReactiveGraph()` recomputes the edge
 *     set fresh from the live subscriber Sets — no incremental
 *     bookkeeping to drift out of sync with `cleanupEffect`.
 *
 * Names: signals carry `.label` (set explicitly or by the vite plugin's
 * dev auto-naming). Computeds/effects have no name in the framework, so
 * they get a stable synthetic label (`derived#12` / `effect#7`).
 */

export type ReactiveNodeKind = 'signal' | 'derived' | 'effect'

export interface ReactiveNode {
  id: number
  kind: ReactiveNodeKind
  /** Explicit `.label` for signals; synthetic (`derived#id`) otherwise. */
  name: string
  /** Bounded string preview of the current value (signals/derived only). */
  value: string
  /** Live downstream subscriber count. */
  subscribers: number
  /** Total times this node has fired/recomputed since activation. */
  fires: number
  /** `performance.now()` of the most recent fire, or null. */
  lastFire: number | null
}

export interface ReactiveEdge {
  /** Source node id (the reactive value being read). */
  from: number
  /** Subscriber node id (the computed/effect that read it). */
  to: number
}

export interface ReactiveGraph {
  nodes: ReactiveNode[]
  edges: ReactiveEdge[]
}

export interface ReactiveFire {
  id: number
  /** `performance.now()` at fire time. */
  ts: number
}

// ── Internal node record ─────────────────────────────────────────────────

interface NodeRec {
  id: number
  kind: ReactiveNodeKind
  name: string
  /** Weak handle to the read fn (signal/computed) — never pins the node. */
  ref: WeakRef<object>
  /** Weak handle to the subscriber-set host (signal read fn / computed host). */
  hostRef: WeakRef<{ _s: Set<() => void> | null }> | null
  fires: number
  lastFire: number | null
}

let _active = false
let _nextId = 1
// id → record. Records are pruned by the FinalizationRegistry the moment
// the underlying node is GC'd, so this Map never retains a dead node.
const _byId = new Map<number, NodeRec>()
// Subscriber-callback identity → node id. Lets `getReactiveGraph()`
// resolve `_s` Set membership (anonymous `recompute`/`run` closures)
// back to graph nodes for edge extraction. A WeakMap so a disposed
// effect's closure doesn't keep its id mapping alive.
const _subId = new WeakMap<object, number>()

/** @internal — finalizer callback; prunes the record when a node is GC'd. */
export function _rdPrune(id: number): void {
  _byId.delete(id)
}

// FinalizationRegistry is baseline since Node 14.6 / all modern browsers
// / Bun — the same universal-availability assumption the codebase already
// makes for WeakRef. No env guard (avoids an uncoverable dead branch).
const _finalizer = new FinalizationRegistry<number>(_rdPrune)

// Bounded fire ring buffer (Effects timeline). Same shape/rationale as
// reactive-trace.ts — fixed cap, primitives only, never grows.
const FIRE_CAP = 512
let _fireBuf: ReactiveFire[] | null = null
let _fireCount = 0

const PREVIEW_MAX = 60

function preview(v: unknown): string {
  let s: string
  try {
    if (v === null) return 'null'
    if (v === undefined) return 'undefined'
    const t = typeof v
    if (t === 'string') s = JSON.stringify(v) as string
    else if (t === 'number' || t === 'boolean' || t === 'bigint') s = String(v)
    else if (t === 'function')
      s = `[Function ${(v as { name?: string }).name || 'anonymous'}]`
    else if (t === 'symbol') s = (v as symbol).toString()
    else if (Array.isArray(v)) s = `Array(${(v as unknown[]).length})`
    else {
      const ctor = (v as { constructor?: { name?: string } }).constructor?.name
      let keys: string[] = []
      try {
        keys = Object.keys(v as object).slice(0, 3)
      } catch {
        keys = []
      }
      s = `${ctor && ctor !== 'Object' ? `${ctor} ` : ''}{${keys.join(', ')}${keys.length === 3 ? ', …' : ''}}`
    }
  } catch {
    s = '[unstringifiable]'
  }
  return s.length > PREVIEW_MAX ? `${s.slice(0, PREVIEW_MAX)}…` : s
}

/** Activate the bridge. Idempotent. Called when a devtools client attaches. */
export function activateReactiveDevtools(): void {
  _active = true
}

/**
 * Deactivate + drop all retained state. Called when the devtools client
 * disconnects so a closed panel leaves zero residue.
 */
export function deactivateReactiveDevtools(): void {
  _active = false
  _byId.clear()
  _fireBuf = null
  _fireCount = 0
}

export function isReactiveDevtoolsActive(): boolean {
  return _active
}

// ── Instrumentation entry points (called from the hot paths, but only
//    after the existing prod gate; each is a no-op until activated) ──────

/**
 * Register a signal/computed/effect node. `host` is the object carrying
 * the `_s` subscriber Set (the signal read fn itself, or a computed's
 * internal host). `sub` is the notify closure (`recompute`/`run`) whose
 * identity appears in upstream `_s` Sets — used to resolve edges.
 *
 * @internal
 */
export function _rdRegister(
  node: object,
  kind: ReactiveNodeKind,
  host: { _s: Set<() => void> | null } | null,
  sub: object | null,
  label: string | undefined,
): number | undefined {
  if (!_active) return undefined
  const id = _nextId++
  _byId.set(id, {
    id,
    kind,
    name: label ?? `${kind === 'signal' ? 'signal' : kind}#${id}`,
    ref: new WeakRef(node),
    hostRef: host ? new WeakRef(host) : null,
    fires: 0,
    lastFire: null,
  })
  if (sub) _subId.set(sub, id)
  _finalizer.register(node, id)
  // Stash the id on the node so fire events correlate in O(1). Every node
  // we register is a framework-created function/closure (signal/computed
  // `read`, effect `run`) — always extensible, so defineProperty cannot
  // throw here; no defensive try/catch (it would be an uncoverable dead
  // branch).
  Object.defineProperty(node, '__pxRdId', {
    value: id,
    enumerable: false,
    configurable: true,
  })
  return id
}

/**
 * Record that a node fired (signal write / computed recompute / effect
 * run). Bumps counters + appends to the bounded fire buffer.
 *
 * @internal
 */
export function _rdRecordFire(node: object): void {
  if (!_active) return
  const id = (node as { __pxRdId?: number }).__pxRdId
  if (id === undefined) return
  const rec = _byId.get(id)
  const ts =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now()
  if (rec) {
    rec.fires++
    rec.lastFire = ts
  }
  if (_fireBuf === null) _fireBuf = new Array<ReactiveFire>(FIRE_CAP)
  _fireBuf[_fireCount % FIRE_CAP] = { id, ts }
  _fireCount++
}

// ── Snapshot API (consumed by the devtools hook) ─────────────────────────

function resolveSubId(sub: () => void): number | undefined {
  const direct = (sub as { __pxRdId?: number }).__pxRdId
  if (direct !== undefined) return direct
  return _subId.get(sub)
}

/**
 * Fresh snapshot of the live reactive graph. Edges are recomputed from
 * each live node's current subscriber Set — always consistent with the
 * framework's real subscription state, no incremental drift.
 */
export function getReactiveGraph(): ReactiveGraph {
  const nodes: ReactiveNode[] = []
  const edges: ReactiveEdge[] = []
  for (const rec of _byId.values()) {
    const node = rec.ref.deref()
    if (!node) continue
    const host = rec.hostRef?.deref() ?? null
    const subs = host?._s ?? null
    // `preview()` is total (its own try/catch returns '[unstringifiable]'),
    // and `_v` on our registered nodes is a plain property (signal) or a
    // getter that never throws (computed's getter routes errors through
    // `_errorHandler` and returns the stale value). No defensive wrapper
    // here — it would be an uncoverable dead branch.
    const valueStr =
      rec.kind === 'effect' ? '' : preview((node as { _v?: unknown })._v)
    nodes.push({
      id: rec.id,
      kind: rec.kind,
      name: rec.name,
      value: valueStr,
      subscribers: subs?.size ?? 0,
      fires: rec.fires,
      lastFire: rec.lastFire,
    })
    if (subs) {
      for (const cb of subs) {
        const to = resolveSubId(cb)
        if (to !== undefined) edges.push({ from: rec.id, to })
      }
    }
  }
  return { nodes, edges }
}

/** Bounded recent-fire timeline (oldest → newest). Fresh copy. */
export function getReactiveFires(): ReactiveFire[] {
  if (_fireBuf === null || _fireCount === 0) return []
  if (_fireCount <= FIRE_CAP) return _fireBuf.slice(0, _fireCount)
  const start = _fireCount % FIRE_CAP
  const out: ReactiveFire[] = []
  for (let i = 0; i < FIRE_CAP; i++) {
    const e = _fireBuf[(start + i) % FIRE_CAP]
    if (e) out.push(e)
  }
  return out
}

