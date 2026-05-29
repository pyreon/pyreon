/**
 * Reactive devtools bridge — a leak-free introspection layer over the
 * live signal / computed / effect graph.
 *
 * Powers the `@pyreon/devtools` Signals / Graph / Effects / Console
 * surfaces. Design constraints (mirroring `reactive-trace.ts`):
 *
 *   - **Zero cost in production.** Every instrumentation entry point is
 *     called from inside the existing `process.env.NODE_ENV !== 'production'`
 *     gate at the framework callers (signal/computed/effect) — bundlers
 *     fold the whole call chain to dead code in prod.
 *   - **Always-on in __DEV__.** Registration + fire-recording run for
 *     every signal/computed/effect created in dev — independent of
 *     whether a devtools client is attached. This is what lets a user
 *     open the panel AFTER the app has mounted and still see the full
 *     live graph (the activate-after-creation user workflow). The cost
 *     is a `Map.set` + `WeakRef` + `WeakMap.set` + `finalizer.register`
 *     per node (~hundreds of ns) and a counter bump + bounded ring-buffer
 *     append per fire (~ns).
 *   - **`_active` is a READ gate, not a recording gate.** Output methods
 *     (`getReactiveGraph` / `getReactiveFires` / `getFireSummaries`)
 *     return empty when no client has called `activateReactiveDevtools()`.
 *     A devtools panel reads through these; nothing leaks to non-attached
 *     consumers.
 *   - **`_captureCallerLocation` is also always-on in `__DEV__`** so
 *     signals/computeds/effects created BEFORE a devtools client
 *     attaches still get loc captured (LPIH editor inlay-hint surfaces
 *     work uniformly). Cost is a single `new Error()` + small regex per
 *     call (~2.2µs in V8), invisible against mount times. Most user
 *     signals pay 0µs anyway because `@pyreon/vite-plugin`'s
 *     `injectSignalLocations` rewrites `signal(0)` → `signal(0, { __sourceLocation })`
 *     at build time and the caller short-circuits to the injected value.
 *   - **No retention / no leak.** Nodes are held via `WeakRef` and
 *     pruned by a `FinalizationRegistry`. The registry never pins a
 *     signal/computed/effect alive. Edges + the fire ring buffer hold
 *     only numeric ids and primitives, never node references or values.
 *   - **Snapshot on demand.** `getReactiveGraph()` recomputes the edge
 *     set fresh from the live subscriber Sets — no incremental
 *     bookkeeping to drift out of sync with `cleanupEffect`.
 *   - **`deactivate` does NOT clear the registry.** A panel close +
 *     reopen cycle re-exposes the same live graph; clearing on
 *     deactivate would re-create the activate-after-creation bug at the
 *     close/reopen boundary. The registry tracks the live app state;
 *     `_active` only toggles whether we expose it.
 *
 * Names: signals carry `.label` (set explicitly or by the vite plugin's
 * dev auto-naming). Computeds/effects have no name in the framework, so
 * they get a stable synthetic label (`derived#12` / `effect#7`).
 */

export type ReactiveNodeKind = 'signal' | 'derived' | 'effect'

/**
 * Source location of a reactive node's creation — captured at registration
 * time from the user's call stack. Powers "Live Program Inlay Hints" — the
 * editor surfaces fire counts at the source line where the node was created.
 *
 * Captured ONLY when devtools is active (`_active === true`). Stack parsing
 * is best-effort across V8 / JSC / SpiderMonkey; returns undefined when the
 * stack format isn't recognized (older runtimes, minified prod, web workers
 * without source maps). Dev gate is the existing `process.env.NODE_ENV` at
 * each caller — production paths never run the capture.
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
 * Time constant for the rate1s EWMA (milliseconds). Tuned for the "hot
 * path debugging" use case: a 1-second time constant means a burst of
 * fires shows up immediately, then decays to 1/e (~0.37×) after one
 * second of silence, ~5% after 3 seconds, ~0.7% after 5 seconds.
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
   * **Deferred-parse state**. When loc capture is needed at the runtime
   * fallback path, the caller passes a captured `Error` here instead of
   * a resolved `SourceLocation`. The expensive `.stack` formatting +
   * parseStackLine call is deferred until `getReactiveGraph()` or
   * `getFireSummaries()` actually reads the location — most nodes
   * never get their loc read (the LPIH inlay-hint surface only reads
   * loc for hot lines the user has on screen), so the typical app
   * pays only the cheap `new Error()` allocation per node.
   *
   * Cleared the first time `_resolveLoc(rec)` succeeds; the Error is
   * GC-eligible from that moment.
   */
  pendingErr?: Error | undefined
  /** skipFrames from the deferred capture — needed by the lazy parser. */
  pendingSkip?: number | undefined
  /**
   * EWMA-tracked fire rate (~fires/sec, 1s time constant). Updated on
   * every fire; decayed to "now" at read time. See `FireSummary.rate1s`.
   */
  rate1s: number
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
 * Deactivate the bridge. Flips `_active = false` so the output methods
 * return empty. Does NOT clear the registry — the registry tracks the
 * LIVE app state, which a subsequent `activateReactiveDevtools()` should
 * still see (matches the user "close + reopen panel" workflow). Dead
 * nodes are pruned automatically by the `FinalizationRegistry`.
 *
 * For test isolation across `it()` blocks, use
 * `__resetReactiveDevtoolsForTesting()` instead.
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
  _fireBuf = null
  _fireCount = 0
}

export function isReactiveDevtoolsActive(): boolean {
  return _active
}

// ── Instrumentation entry points (called from the hot paths, but only
//    after the existing prod gate; each is a no-op until activated) ──────

/**
 * Capture a deferred source-location handle from the user's call site.
 * Returns an opaque `{ err, skipFrames }` token — the expensive
 * `.stack` formatting + line parsing is deferred to `_resolveLoc(rec)`
 * at the moment a devtools consumer actually reads the location.
 *
 * Always-on in `__DEV__` (the caller-side `process.env.NODE_ENV` gate
 * tree-shakes it in production).
 *
 * **Cost at capture time**: a single `new Error()` allocation (~0.14µs
 * in V8/Bun — stack is captured but NOT formatted). Negligible per call;
 * for a 10k-signal startup that's ~1.4ms total even on a contended CI
 * runner. Most user signals pay 0µs anyway because `@pyreon/vite-plugin`'s
 * `injectSignalLocations` rewrites `signal(0)` → `signal(0, { __sourceLocation })`
 * at build time and the caller short-circuits to that resolved value
 * before invoking this helper.
 *
 * **Cost at read time** (rare): `.stack` access (~3-10µs in V8 under
 * normal load, much higher under happy-dom + parallel-load CI with
 * source-map resolution) + small regex per line. Only paid when
 * `getReactiveGraph()` or `getFireSummaries()` ACTUALLY reads the
 * loc — most app signals never have their loc read since the LPIH
 * inlay-hint surface only consumes loc for hot lines the user has
 * on screen.
 *
 * `skipFrames` is the number of caller-frames to skip past _captureCallerLocation
 * itself. The framework's hot-path callers (signal / computedLazy / effect)
 * pass their own depth so the captured frame is the USER's call to
 * `signal()` / `computed()` / `effect()`, not the framework's internals.
 *
 * Recognized stack formats:
 *   - V8 (Chrome / Node / Bun):     `    at fn (file:line:col)`
 *   - V8 (anonymous):               `    at file:line:col`
 *   - JSC (Safari) + SpiderMonkey:  `fn@file:line:col`
 *
 * @internal
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
  // Skip past _captureCallerLocation's own frame (always +1) + caller's
  // depth. Plus an additional +1 because the Error was allocated INSIDE
  // _captureCallerLocation in the deferred path, so the frame depth from
  // the user's call site is one deeper than the original synchronous
  // form's contract.
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
  // Distinguish resolved-loc (build-time injected, `{file, line, col}`)
  // from deferred-loc (runtime fallback, `{__deferred, err, skipFrames}`).
  // The deferred form stashes the Error for lazy parse on first read.
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
    rate1s: 0,
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
 * Always-on in __DEV__. The bounded ring buffer (`FIRE_CAP=512`) caps
 * memory regardless of how long the app has been running before a
 * devtools client attaches — old fires age out naturally as new ones
 * arrive.
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
    // EWMA rate update — decay the prior estimate by exp(-dt/TAU), then
    // add 1 for this fire. At steady state of λ fires/sec, rate1s
    // converges to ≈ λ when λ·TAU ≫ 1. For TAU=1000ms, that means
    // "fires per second" in the natural sense.
    if (rec.lastFire !== null) {
      const dt = ts - rec.lastFire
      const decay = Math.exp(-dt / LPIH_RATE_TAU_MS)
      rec.rate1s = rec.rate1s * decay + 1
    } else {
      // First-ever fire: a single isolated fire reads as "1 fire/s" until
      // the decay-at-read brings it down. Caller can interpret 1.0 as
      // "at least one recent fire."
      rec.rate1s = 1
    }
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
  if (!_active) return { nodes: [], edges: [] }
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
    const valueStr = rec.kind === 'effect' ? '' : preview((node as { _v?: unknown })._v)
    // Resolve the deferred loc on first read — most apps never reach
    // this branch for the bulk of their signals, so the expensive
    // `.stack` formatting cost is paid only for nodes the consumer
    // actually inspects.
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
  if (!_active) return []
  const byKey = new Map<string, FireSummary>()
  // Snapshot "now" once per call — decay-at-read uses a consistent timestamp
  // for all nodes, so two locations firing at the same rate show the same
  // rate1s value even if iteration walks them in different orders.
  const nowTs =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now()
  for (const rec of _byId.values()) {
    if (!rec.ref.deref()) continue
    // Resolve deferred loc on demand. `_resolveLoc` returns undefined
    // for nodes whose stack parse failed (or who never had a captured
    // location) — those are skipped from the summary, same as pre-fix.
    const loc = _resolveLoc(rec)
    if (!loc) continue
    const k = `${loc.file}:${loc.line}:${loc.col}`
    // Decay rate1s to "now" — a node that hasn't fired in 5×TAU shows
    // ≈0.7% of its steady-state rate; in 10×TAU, basically 0. This is
    // what makes "stopped firing" visible in the editor.
    const decayedRate =
      rec.lastFire !== null ? rec.rate1s * Math.exp(-(nowTs - rec.lastFire) / LPIH_RATE_TAU_MS) : 0
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

/** Bounded recent-fire timeline (oldest → newest). Fresh copy. */
export function getReactiveFires(): ReactiveFire[] {
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
