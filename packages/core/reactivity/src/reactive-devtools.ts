/**
 * Reactive devtools bridge — a leak-free introspection layer over the live
 * signal / computed / effect graph, powering `@pyreon/devtools`.
 *
 * Design constraints:
 *
 *   - **Zero cost in production.** Every entry point is called from inside the
 *     framework callers' existing `process.env.NODE_ENV` gate, so bundlers fold
 *     the whole call chain to dead code.
 *   - **Always-on in __DEV__.** Registration + fire-recording run for every node
 *     created in dev, independent of whether a client is attached — that is what
 *     lets a user open the panel AFTER mount and still see the full live graph.
 *   - **`_active` is a READ gate, not a recording gate.** Output methods return
 *     empty until a client calls `activateReactiveDevtools()`, so nothing leaks
 *     to non-attached consumers.
 *   - **No retention / no leak.** Nodes are held via `WeakRef` and pruned by a
 *     `FinalizationRegistry`; edges and the fire ring buffer hold only numeric
 *     ids and primitives, never node references or values.
 *   - **Snapshot on demand.** `getReactiveGraph()` recomputes the edge set fresh
 *     from the live subscriber Sets, so it cannot drift out of sync.
 *   - **`deactivate` does NOT clear the registry.** Clearing on deactivate would
 *     re-create the activate-after-creation bug at the close/reopen boundary.
 *
 * Names: signals carry `.label`; computeds/effects get a stable synthetic label
 * (`derived#12` / `effect#7`).
 */

export type ReactiveNodeKind = 'signal' | 'derived' | 'effect'

/**
 * Source location of a reactive node's creation, captured at registration time
 * from the user's call stack. Powers "Live Program Inlay Hints" — the editor
 * surfaces fire counts at the source line where the node was created.
 *
 * Stack parsing is best-effort across V8 / JSC / SpiderMonkey and returns
 * undefined when the format isn't recognized (older runtimes, minified prod,
 * workers without source maps).
 */
export interface SourceLocation {
  /** Absolute path or file URL parsed from the stack frame. */
  file: string
  /** 1-based line number. */
  line: number
  /** 1-based column number. */
  col: number
}

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
  /**
   * Source location of the creation call (`signal(0)` / `computed(...)` /
   * `effect(...)`). Undefined when devtools wasn't active at creation
   * time OR the stack format wasn't parseable. Editor inlay-hint surfaces
   * consume this to merge live fire counts onto static spans.
   */
  loc?: SourceLocation
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

/**
 * Per-source-location fire-count summary. Aggregated from the fire ring
 * buffer + node registry. The shape an editor / LSP inlay-hint consumer
 * needs to merge "this signal at line N fires K times" onto static
 * Reactivity-Lens spans. Pure data, JSON-serializable, no node refs.
 */
export interface FireSummary {
  loc: SourceLocation
  /** Total fires in the visible ring buffer at this location. */
  count: number
  /** Most recent fire `performance.now()` at this location, or null. */
  lastFire: number | null
  /** Node kind that fired most recently at this location. */
  kind: ReactiveNodeKind
  /**
   * Exponentially-weighted moving average of the fire rate at this
   * location, in fires per second. Decayed to "now" at read time so a
   * node that stopped firing N seconds ago shows a rate that's
   * exponentially smaller than its steady-state value.
   *
   * Calculation uses a 1-second time constant (`LPIH_RATE_TAU_MS`):
   * - On each fire: `r = r * exp(-dt/TAU) + 1`
   *   - Steady state at λ fires/sec converges to ≈ λ (when λ × TAU ≫ 1)
   * - On read: `r_now = r * exp(-dt_since_last/TAU)`
   *
   * 0 when there have been no fires (or all fires were >>TAU ago).
   */
  rate1s: number
}

/**
 * Time constant for the rate1s EWMA (milliseconds). Tuned for hot-path
 * debugging: a burst shows up immediately, then decays to ~37% after one second
 * of silence and ~0.7% after five.
 *
 * @internal — exported for tests + tunability.
 */
export const LPIH_RATE_TAU_MS = 1000

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
  /**
   * Resolved source location. Populated either by `__sourceLocation`
   * passed in by `@pyreon/vite-plugin` at build time (free) OR by a
   * lazy resolution of `_pendingErr` at first read. `null` means
   * "resolved but parse failed"; `undefined` means "not yet resolved".
   */
  loc?: SourceLocation | null | undefined
  /**
   * **Deferred-parse state**. The runtime fallback path stores a captured
   * `Error` here instead of a resolved `SourceLocation`; the expensive `.stack`
   * formatting is deferred until `getReactiveGraph()`/`getFireSummaries()`
   * actually reads the location. Most nodes never do, so the typical app pays
   * only the cheap `new Error()` allocation.
   *
   * Cleared the first time `_resolveLoc(rec)` succeeds, making the Error
   * GC-eligible.
   */
  pendingErr?: Error | undefined
  /** skipFrames from the deferred capture — needed by the lazy parser. */
  pendingSkip?: number | undefined
}

let _active = false
let _nextId = 1
// id → record.
const _byId = new Map<number, NodeRec>()

// ── Coverage retention ─────────────────────────────────────────────────── The registry holds
// nodes via WeakRef.
let _retain = false
const _retained = new Set<object>()

/** @internal — enable/disable strong-ref retention for a coverage session. */
export function _setCoverageRetention(on: boolean): void {
  _retain = on
  if (!on) _retained.clear()
}
// Subscriber-callback identity → node id.
const _subId = new WeakMap<object, number>()

/** @internal — finalizer callback; prunes the record when a node is GC'd. */
export function _rdPrune(id: number): void {
  _byId.delete(id)
}

// FinalizationRegistry is baseline since Node 14.6 / all modern browsers / Bun — the
// same universal-availability assumption the codebase already makes for WeakRef.
const _finalizer = /* @__PURE__ */ new FinalizationRegistry<number>(_rdPrune)

// Bounded fire ring buffer (Effects timeline).
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
    else if (t === 'function') s = `[Function ${(v as { name?: string }).name || 'anonymous'}]`
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
 * Deactivate the bridge. Flips `_active = false` so the output methods return
 * empty. Does NOT clear the registry — that tracks the LIVE app state, which a
 * subsequent `activateReactiveDevtools()` should still see (the close + reopen
 * panel workflow). Dead nodes are pruned by the `FinalizationRegistry`.
 *
 * For test isolation, use `__resetReactiveDevtoolsForTesting()` instead.
 */
export function deactivateReactiveDevtools(): void {
  _active = false
}

/**
 * Test-only reset: drops the entire registry, fire buffer, and the
 * `_active` flag. NOT for production use — wipes the live-app state
 * tracked by always-on `_rdRegister`. Tests use this in `afterEach` so
 * one test's signals don't pollute the next test's graph.
 *
 * @internal
 */
export function __resetReactiveDevtoolsForTesting(): void {
  _active = false
  _byId.clear()
  _retained.clear()
  _fireBuf = null
  _fireCount = 0
}

export function isReactiveDevtoolsActive(): boolean {
  return _active
}

// ── Instrumentation entry points (called from the hot paths, but only
//    after the existing prod gate; each is a no-op until activated) ──────

/**
 * Capture a deferred source-location handle from the user's call site. Returns
 * an opaque `{ err, skipFrames }` token — the expensive `.stack` formatting +
 * line parsing is deferred to `_resolveLoc(rec)` at the moment a devtools
 * consumer actually reads the location.
 *
 * Always-on in `__DEV__` (the caller-side `process.env.NODE_ENV` gate
 * tree-shakes it in production).
 *
 * Capture costs one `new Error()` allocation (~0.14us — the stack is captured
 * but NOT formatted). Read costs `.stack` access (~3-10us, much higher under
 * happy-dom + parallel-load CI with source-map resolution) and is paid only for
 * nodes whose loc is actually read. Most user signals pay nothing at all,
 * because `@pyreon/vite-plugin` injects `__sourceLocation` at build time and the
 * caller short-circuits before reaching this helper.
 */
export interface DeferredLocation {
  /** Marker brand to disambiguate from resolved `SourceLocation`. */
  __deferred: true
  err: Error
  skipFrames: number
}

export function _captureCallerLocation(skipFrames: number): DeferredLocation {
  return { __deferred: true, err: new Error(), skipFrames }
}

/**
 * Eager-resolve a deferred location to a `SourceLocation` (or undefined
 * if the stack format isn't recognized). Used internally by the snapshot
 * APIs to lazily parse `.stack` on first read.
 *
 * @internal
 */
function resolveDeferred(d: DeferredLocation): SourceLocation | undefined {
  const raw = d.err.stack
  if (!raw) return undefined
  const lines = raw.split('\n')
  // V8 prepends "Error\n"; JSC doesn't. Detect and offset.
  const startIdx = lines[0] && lines[0].trim().startsWith('Error') ? 1 : 0
  // Skip past _captureCallerLocation's own frame (always +1) + caller's depth.
  const target = lines[startIdx + 1 + d.skipFrames]
  if (!target) return undefined
  return parseStackLine(target)
}

/**
 * Resolve a record's loc — returns the cached value, or parses the
 * deferred Error on first read and memoizes the result.
 *
 * @internal
 */
function _resolveLoc(rec: NodeRec): SourceLocation | undefined {
  // Already resolved (success or definitively-failed): return cached.
  if (rec.loc !== undefined) return rec.loc ?? undefined
  // No deferred handle to resolve.
  if (!rec.pendingErr) return undefined
  const parsed = resolveDeferred({
    __deferred: true,
    err: rec.pendingErr,
    skipFrames: rec.pendingSkip ?? 0,
  })
  // Cache the result (or `null` for failed parse — distinguishes from
  // "not yet resolved" undefined). Drop the Error so it's GC-eligible.
  rec.loc = parsed ?? null
  rec.pendingErr = undefined
  rec.pendingSkip = undefined
  return parsed
}

/** @internal — exported for unit testing across runtimes. */
export function _parseStackLine(line: string): SourceLocation | undefined {
  return parseStackLine(line)
}

function parseStackLine(line: string): SourceLocation | undefined {
  // V8 parenthesized form: "    at fnName (file:line:col)"
  const v8Paren = line.match(/\(([^()]+):(\d+):(\d+)\)\s*$/)
  if (v8Paren && v8Paren[1] && v8Paren[2] && v8Paren[3]) {
    const file = v8Paren[1]
    const lineN = Number.parseInt(v8Paren[2], 10)
    const col = Number.parseInt(v8Paren[3], 10)
    if (Number.isFinite(lineN) && Number.isFinite(col)) return { file, line: lineN, col }
  }
  // V8 anonymous form: "    at file:line:col"
  const v8Bare = line.match(/at\s+([^\s()]+):(\d+):(\d+)\s*$/)
  if (v8Bare && v8Bare[1] && v8Bare[2] && v8Bare[3]) {
    const file = v8Bare[1]
    const lineN = Number.parseInt(v8Bare[2], 10)
    const col = Number.parseInt(v8Bare[3], 10)
    if (Number.isFinite(lineN) && Number.isFinite(col)) return { file, line: lineN, col }
  }
  // JSC / SpiderMonkey form: "fnName@file:line:col"
  const jsc = line.match(/@([^@\s]+):(\d+):(\d+)\s*$/)
  if (jsc && jsc[1] && jsc[2] && jsc[3]) {
    const file = jsc[1]
    const lineN = Number.parseInt(jsc[2], 10)
    const col = Number.parseInt(jsc[3], 10)
    if (Number.isFinite(lineN) && Number.isFinite(col)) return { file, line: lineN, col }
  }
  return undefined
}

/**
 * Register a signal/computed/effect node. `host` is the object carrying
 * the `_s` subscriber Set (the signal read fn itself, or a computed's
 * internal host). `sub` is the notify closure (`recompute`/`run`) whose
 * identity appears in upstream `_s` Sets — used to resolve edges.
 *
 * Always-on in __DEV__ (the caller guards on NODE_ENV — tree-shaken in
 * prod). Independent of `_active` so a devtools panel attached AFTER
 * the app mounted sees the full live graph. The `loc` is captured by
 * the caller via `_captureCallerLocation()`, which IS `_active`-gated
 * (stack parsing is the expensive part) — pre-activate signals get
 * `undefined` loc unless the vite plugin's build-time injection
 * provided one.
 *
 * @internal
 */
export function _rdRegister(
  node: object,
  kind: ReactiveNodeKind,
  host: { _s: Set<() => void> | null } | null,
  sub: object | null,
  label: string | undefined,
  loc?: SourceLocation | DeferredLocation,
): number | undefined {
  const id = _nextId++
  // Distinguish resolved-loc (build-time injected, `{file, line, col}`) from
  // deferred-loc (runtime fallback, `{__deferred, err, skipFrames}`).
  const isDeferred = !!loc && (loc as DeferredLocation).__deferred === true
  _byId.set(id, {
    id,
    kind,
    name: label ?? `${kind === 'signal' ? 'signal' : kind}#${id}`,
    ref: new WeakRef(node),
    hostRef: host ? new WeakRef(host) : null,
    fires: 0,
    lastFire: null,
    loc: isDeferred ? undefined : (loc as SourceLocation | undefined),
    pendingErr: isDeferred ? (loc as DeferredLocation).err : undefined,
    pendingSkip: isDeferred ? (loc as DeferredLocation).skipFrames : undefined,
  })
  if (sub) _subId.set(sub, id)
  // During a coverage session, pin the node so it can't be GC-pruned before the snapshot.
  if (_retain) _retained.add(node)
  _finalizer.register(node, id)
  // Stash the id on the node so fire events correlate in O(1).
  Object.defineProperty(node, '__pxRdId', {
    value: id,
    enumerable: false,
    configurable: true,
  })
  return id
}

/**
 * Read the reactive-graph node id stashed on a signal / computed callable or
 * `effect()` handle (`__pxRdId`). Returns `undefined` for a non-reactive value
 * or a production build (where the registry is tree-shaken). The public,
 * name-stable accessor `@pyreon/testing`'s reactive matchers target — so they
 * never reach for the internal property directly.
 */
export function _rdNodeId(x: unknown): number | undefined {
  const id = (x as { __pxRdId?: unknown } | null | undefined)?.__pxRdId
  return typeof id === 'number' ? id : undefined
}

/**
 * Record that a node fired (signal write / computed recompute / effect
 * run). Bumps counters + appends to the bounded fire buffer.
 *
 * Always-on in __DEV__. The bounded ring buffer (`FIRE_CAP=512`) caps
 * memory regardless of how long the app has been running before a
 * devtools client attaches — old fires age out naturally as new ones
 * arrive.
 *
 * **Deferred-EWMA contract.** The expensive EWMA rate (`Math.exp` per
 * fire) used to be maintained eagerly here — fine when devtools was
 * opt-in, structurally inappropriate now that recording is always-on
 * in `__DEV__`. A 60Hz animation signal would burn 60 `Math.exp` calls
 * per second whether or not a devtools panel was attached. The rate is
 * now reconstructed at read time in `getFireSummaries` from the bounded
 * ring buffer (same recurrence-unfold equivalence — see the comment on
 * the reconstruction loop). Capture stays bump-counter + ring-write
 * only: no float ops, no branches per fire.
 *
 * @internal
 */
export function _rdRecordFire(node: object): void {
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
 *
 * Returns `{nodes: [], edges: []}` when no devtools client has called
 * `activateReactiveDevtools()` (so non-attached consumers see nothing
 * even though the registry is always-on in __DEV__).
 */
export function getReactiveGraph(): ReactiveGraph {
  // Dev-block guard (NOT an early prod-return): the registry only fills under dev gates
  // (`_rdRegister` call sites are `NODE_ENV`-gated), so this is provably `{[].
  if (process.env.NODE_ENV !== 'production') {
    if (!_active) return { nodes: [], edges: [] }
    const nodes: ReactiveNode[] = []
    const edges: ReactiveEdge[] = []
    for (const rec of _byId.values()) {
      const node = rec.ref.deref()
      if (!node) continue
      const host = rec.hostRef?.deref() ?? null
      const subs = host?._s ?? null
      // `preview()` is total (its own try/catch returns '[unstringifiable]').
      const valueStr = rec.kind === 'effect' ? '' : preview((node as { _v?: unknown })._v)
      // Resolve the deferred loc on first read.
      const resolvedLoc = _resolveLoc(rec)
      nodes.push({
        id: rec.id,
        kind: rec.kind,
        name: rec.name,
        value: valueStr,
        subscribers: subs?.size ?? 0,
        fires: rec.fires,
        lastFire: rec.lastFire,
        ...(resolvedLoc ? { loc: resolvedLoc } : {}),
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
  return { nodes: [], edges: [] }
}

/**
 * Aggregate fire counts by source-location — powers Live Program Inlay
 * Hints. Walks the live node registry, keys each node by its captured
 * `loc`, and returns one summary per unique `file:line:col`. Nodes
 * without a captured location are skipped (their fires are still
 * visible via `getReactiveGraph()` and `getReactiveFires()` for the
 * existing graph / timeline surfaces).
 *
 * Returns a fresh array, JSON-serializable, safe to ship across the
 * devtools-host bridge or to write into an LSP cache file.
 */
export function getFireSummaries(): FireSummary[] {
  // Prod early-return — see getReactiveGraph (fires are only recorded in dev).
  if (process.env.NODE_ENV !== 'production') {
    if (!_active) return []
    const byKey = new Map<string, FireSummary>()
    // Snapshot "now" once per call.
    const nowTs =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now()
    // Build a one-pass per-id EWMA accumulator from the ring buffer.
    const ratesById = new Map<number, number>()
    if (_fireBuf !== null && _fireCount > 0) {
      const visible = _fireCount <= FIRE_CAP ? _fireCount : FIRE_CAP
      const start = _fireCount <= FIRE_CAP ? 0 : _fireCount % FIRE_CAP
      for (let i = 0; i < visible; i++) {
        const e = _fireBuf[(start + i) % FIRE_CAP]
        if (!e) continue
        const contrib = Math.exp(-(nowTs - e.ts) / LPIH_RATE_TAU_MS)
        const prev = ratesById.get(e.id)
        ratesById.set(e.id, (prev ?? 0) + contrib)
      }
    }
    for (const rec of _byId.values()) {
      if (!rec.ref.deref()) continue
      // Resolve deferred loc on demand.
      const loc = _resolveLoc(rec)
      if (!loc) continue
      const k = `${loc.file}:${loc.line}:${loc.col}`
      const decayedRate = ratesById.get(rec.id) ?? 0
      const existing = byKey.get(k)
      if (existing) {
        existing.count += rec.fires
        // Sum rates at same location (e.g. two distinct signals on one
        // line via destructuring). Latest-fire wins for kind / lastFire.
        existing.rate1s += decayedRate
        if (
          rec.lastFire !== null &&
          (existing.lastFire === null || rec.lastFire > existing.lastFire)
        ) {
          existing.lastFire = rec.lastFire
          existing.kind = rec.kind
        }
      } else {
        byKey.set(k, {
          loc,
          count: rec.fires,
          lastFire: rec.lastFire,
          kind: rec.kind,
          rate1s: decayedRate,
        })
      }
    }
    return [...byKey.values()]
  }
  return []
}

/** Bounded recent-fire timeline (oldest → newest). Fresh copy. */
export function getReactiveFires(): ReactiveFire[] {
  // Prod early-return — see getReactiveGraph (fires are only recorded in dev).
  if (process.env.NODE_ENV === 'production') return []
  if (!_active) return []
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

// ── "Why did this update?" — causal chain reconstruction ─────────────────────
// No other framework can answer "why did this node just update?" at the source line.

/** One link in a causal chain — a node that fired, with when + where. */
export interface CauseLink {
  id: number
  kind: ReactiveNodeKind
  name: string
  loc?: SourceLocation
  /** `performance.now()` of this node's fire in the reconstructed cascade. */
  ts: number
}

/** The answer to "why did `target` update?". */
export interface UpdateCause {
  /** The node whose update was explained. */
  target: CauseLink
  /**
   * The causal chain, ROOT-FIRST: `chain[0]` is the originating change (usually
   * a signal write), each link caused the next, and the last link is the direct
   * cause of `target`. Empty when `target` fired with no dependency fire before
   * it — it IS the root (e.g. a signal you set directly).
   */
  chain: CauseLink[]
  /** The chain reached a root (a node with no earlier-firing dependency). */
  rootReached: boolean
}

/**
 * Reconstruct the causal chain that led to `nodeId`'s most recent fire.
 * Returns `null` when devtools is inactive, the node is unknown, or it never
 * fired. See the block comment above for the accuracy contract.
 */
export function getUpdateCause(nodeId: number): UpdateCause | null {
  // Prod early-return — see getReactiveGraph (no fires recorded → always null).
  if (process.env.NODE_ENV === 'production') return null
  if (!_active) return null
  const graph = getReactiveGraph()
  const fires = getReactiveFires()
  if (fires.length === 0) return null

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]))
  if (!nodeById.has(nodeId)) return null

  // The causal STRUCTURE is the dependency graph; the fire timeline only tells us WHICH
  // nodes participated in this cascade.
  const depsOf = (id: number): number[] => {
    const out: number[] = []
    for (const e of graph.edges) if (e.to === id) out.push(e.from)
    return out
  }
  const lastFireTs = (id: number): number | null => {
    let best: number | null = null
    for (const f of fires) if (f.id === id && (best === null || f.ts > best)) best = f.ts
    return best
  }
  const toLink = (id: number, ts: number): CauseLink => {
    const n = nodeById.get(id)!
    return { id, kind: n.kind, name: n.name, ...(n.loc ? { loc: n.loc } : {}), ts }
  }

  const targetTs = lastFireTs(nodeId)
  if (targetTs === null) return null // never fired

  // A whole synchronous cascade completes within ~one animation frame; use that as the cluster
  // window so a node's stale fire from an earlier interaction is not mistaken for a cause.
  const CLUSTER_MS = 16
  const firedInCluster = new Map<number, number>() // id → latest fire ts in cluster
  for (const f of fires) {
    if (Math.abs(f.ts - targetTs) <= CLUSTER_MS) {
      const prev = firedInCluster.get(f.id)
      if (prev === undefined || f.ts > prev) firedInCluster.set(f.id, f.ts)
    }
  }

  const chain: CauseLink[] = []
  const visited = new Set<number>([nodeId])
  let currentId = nodeId
  let rootReached = false
  const MAX_DEPTH = 64
  for (let d = 0; d < MAX_DEPTH; d++) {
    let causeId: number | null = null
    for (const dep of depsOf(currentId)) {
      if (!visited.has(dep) && firedInCluster.has(dep)) {
        causeId = dep
        break
      }
    }
    if (causeId === null) {
      rootReached = true
      break
    }
    chain.push(toLink(causeId, firedInCluster.get(causeId)!))
    visited.add(causeId)
    currentId = causeId
  }
  chain.reverse() // root-first
  return { target: toLink(nodeId, targetTs), chain, rootReached }
}

const CAUSE_VERB: Record<ReactiveNodeKind, string> = {
  signal: 'changed',
  derived: 'recomputed',
  effect: 'ran',
}

function causeLocText(l: CauseLink): string {
  return l.loc ? `  ${l.loc.file}:${l.loc.line}:${l.loc.col}` : ''
}

/** Render an {@link UpdateCause} as a human-readable, source-anchored trace. */
export function formatUpdateCause(cause: UpdateCause): string {
  const lines: string[] = [`Why did ${cause.target.name} (${cause.target.kind}) update?`]
  if (cause.chain.length === 0) {
    lines.push(
      `  ${cause.target.name} was updated directly (no upstream dependency fired before it).`,
    )
    return lines.join('\n')
  }
  cause.chain.forEach((l, i) => {
    lines.push(
      `  ${i === 0 ? '' : '→ '}${l.name} (${l.kind}) ${CAUSE_VERB[l.kind]}${causeLocText(l)}`,
    )
  })
  lines.push(
    `  → ${cause.target.name} (${cause.target.kind}) ${CAUSE_VERB[cause.target.kind]}${causeLocText(
      cause.target,
    )}   ← explained`,
  )
  if (!cause.rootReached) {
    lines.push('  (chain truncated — earlier fires aged out of the ring buffer)')
  }
  return lines.join('\n')
}
