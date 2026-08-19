// Batch multiple signal updates into a single notification pass.
//
// TWO-TIER FLUSH — every computed value settles before any effect runs, so a
// deep cascade can never have an effect read a stale upstream value:
//
//   Tier 1 (`recomputeQueue`) — computed refreshes. EVERY computed's
//   source-subscribed callback is a dirty-mark-only + idempotent NOTIFY, run
//   INLINE during the write's notify phase, so a pure lazy-computed cascade
//   never touches a queue at all. An `{ equals }` computed's notify also books
//   a guaranteed evaluation here (`enqueueEagerRefresh`).
//
//   Tier 2 (`curEffects`/`nextEffects`) — effects, multi-pass. Within-pass
//   dedup keeps the single-fire contract; cross-pass re-fire unblocks control
//   flow that re-renders on its own dispatch (ErrorBoundary's handler calling
//   `error.set(err)` during the run that mounted the throwing child).
//
// Both tiers are ARRAYS + intrusive flags rather than Sets: Set hashing on
// function-object keys dominated the wide-fan-out hot path. This is the
// array-of-closures analogue of Preact's intrusive-linked-list + NOTIFIED-
// bitflag batching.
//
// Cascade-graph invariants are fuzzed in `tests/batch.test.ts`.

let batchDepth = 0

// Tier-1 entries clear their flag BEFORE running (the array analogue of
// delete-before-run) so a genuine post-visit re-dirty RE-PUSHES the entry and
// the length-re-reading drain visits it again — see `drainQueuesLocked`.
interface QueuedRefresh {
  (): void
  /** @internal tier-1 membership flag — 1 = queued, 0/undefined = idle. Created lazily on first enqueue. */
  _rq?: 0 | 1
}
const recomputeQueue: QueuedRefresh[] = []

// Effect-queue intrusive fields, created LAZILY on first enqueue (NOT at effect
// creation) so an effect that never re-fires stays a bare closure with zero
// added retained bytes — the dominant "create, run once, never notified again"
// shape. Every effect that HAS fired then shares one hidden class, so the
// per-enqueue flag reads stay monomorphic in steady state.
//   `_eq` — queue membership. Cur/Next are mutually exclusive in time (an effect
//           leaves `curEffects` before it can enter `nextEffects`), so one
//           tri-state field dedups BOTH queues.
//   `_vg` — pass GENERATION it last ran in. `_vg === _passGen` ⇔ "already ran
//           this pass" → a re-enqueue routes to the NEXT pass. The monotonic
//           counter replaces a Set's wholesale `.clear()` with an O(1) bump.
// Never-enqueued effects, raw `subscribe` listeners and `direct` updaters read
// these as undefined/falsy — correctly "not queued, not visited".
const enum EQ {
  Idle = 0,
  Cur = 1,
  Next = 2,
}
interface QueuedEffect {
  (): void
  _eq?: EQ
  _vg?: number
}
const curEffects: QueuedEffect[] = []
const nextEffects: QueuedEffect[] = []
// Monotonic pass generation, never reset — monotonicity is what makes stale
// generations from prior passes/drains automatically read as "not visited".
let _passGen = 1

// Every computed NOTIFY recompute. Checked FIRST in the enqueue router because
// a MISS means an effect — the wide-fan-out hot path — so it must be one cheap
// lookup there. `WeakSet.has` on an absent key beats `WeakMap.get` returning
// undefined (an A/B with a single `WeakMap<fn, kind>` un-flipped both the
// fan-out and batch-50 wins).
const _recomputes = new WeakSet<() => void>()
const MAX_PASSES = 32

// Fused-cascade back-ref: `_markRecompute` stamps a LAZY computed's read fn onto
// its notify as `_c`, letting `propagateLazyDirty` walk a single-subscriber chain
// ITERATIVELY over plain fields instead of paying a WeakSet lookup + closure call
// + re-entry per hop. An `{ equals }` notify does MORE than dirty-marking (it
// books a tier-1 refresh) so it is deliberately NOT stamped; the walk routes
// `_c`-less subscribers through `enqueuePendingNotification`.
// Structural interface — batch.ts must not import computed.ts (layer order).
/** Anything that carries two-tier tracking-subscriber storage (signal or computed). */
interface LazySource {
  _s1: (() => void) | null
  _s: Set<() => void> | null
}
interface LazyTarget extends LazySource {
  _dirty: boolean
  _disposed: boolean
  _d1: (() => void) | null
  _d: Set<() => void> | null
}
interface LazyNotify {
  (): void
  /** @internal back-ref to the lazy computed read fn (the field carrier). */
  _c?: LazyTarget
}

/**
 * Mark a callback as a computed NOTIFY recompute (from `computedLazy` /
 * `computedWithEquals` at creation). Notifies are dirty-mark-only + idempotent,
 * so dispatch sites run them INLINE during the write's notify phase.
 *
 * `target` (LAZY only) is the computed's read fn, stamped as `notify._c` so the
 * dirty cascade can walk chains without calling the closure. The inlined walk
 * body MUST stay in lock-step with `computedLazy`'s recompute.
 */
export function _markRecompute(fn: () => void, target?: LazyTarget): void {
  _recomputes.add(fn)
  if (target !== undefined) (fn as LazyNotify)._c = target
}

/**
 * The canonical LAZY-computed notify body: mark `c` dirty (idempotent — a
 * diamond re-visit early-returns), DEFER its direct updaters to the batch drain
 * (glitch-freedom — see computed.ts), then cascade into subscribers.
 * `propagateLazyDirty`'s single-subscriber walk INLINES this body as its loop
 * (deliberate fusion) — keep the two in lock-step.
 */
export function _markLazyAndPropagate(c: LazyTarget): void {
  if (c._disposed || c._dirty) return
  c._dirty = true
  if (c._d1) enqueuePendingNotification(c._d1)
  else if (c._d) for (const f of c._d) enqueuePendingNotification(f)
  if (c._s1 !== null || c._s !== null) propagateLazyDirty(c)
}

/**
 * Book a guaranteed tier-1 evaluation of an `{ equals }` computed — called by
 * its notify with the computed's READ function (whose dirty branch is the
 * refresh: verify-eval + equals gate + propagate-on-change).
 */
export function enqueueEagerRefresh(refresh: () => void): void {
  const q = refresh as QueuedRefresh
  if (q._rq !== 1) {
    q._rq = 1
    recomputeQueue.push(q)
  }
}

export function batch(fn: () => void): void {
  batchDepth++
  try {
    fn()
  } finally {
    batchDepth--
    if (batchDepth === 0 && (recomputeQueue.length > 0 || curEffects.length > 0)) {
      // Keep batching active during the flush so cascade notifications enqueue
      // (and dedup) into the same queues instead of firing inline.
      batchDepth = 1
      drainQueuesLocked()
    }
  }
}

/**
 * Open an inline batch window WITHOUT the per-call closure cost of `batch(fn)`.
 * The caller delivers its own notifications directly (signal.set's unbatched
 * single-write fast path), then MUST call {@link closeInlineBatch} in a
 * `finally`. Drain semantics are identical to `batch()` by construction — both
 * call the same `drainQueuesLocked`.
 *
 * @internal Used only by `@pyreon/reactivity`'s signal write path.
 */
export function openInlineBatch(): void {
  batchDepth++
}

/** @internal Pair of {@link openInlineBatch}. Drains cascades, resets depth. */
export function closeInlineBatch(): void {
  batchDepth--
  if (batchDepth === 0 && (recomputeQueue.length > 0 || curEffects.length > 0)) {
    batchDepth = 1
    drainQueuesLocked()
  }
}

/**
 * Run ONE effect pass over `curEffects`, then promote `nextEffects`.
 * `curEffects.length` is re-read each iteration so newly-enqueued (not yet
 * visited) effects run THIS pass — matching JS Set iteration semantics.
 */
function runEffectPass(): void {
  _passGen++
  const cur = curEffects
  for (let i = 0; i < cur.length; i++) {
    const fn = cur[i]!
    fn._eq = EQ.Idle // consumed from curEffects — a re-enqueue now routes via _vg
    fn._vg = _passGen // mark visited this pass
    fn()
  }
  cur.length = 0
  // Promote next-pass entries (self-re-fire) into curEffects for the next pass.
  const next = nextEffects
  if (next.length > 0) {
    for (let i = 0; i < next.length; i++) {
      const f = next[i]!
      f._eq = EQ.Cur
      cur.push(f)
    }
    next.length = 0
  }
}

/**
 * Drain both queues to empty. Caller must hold `batchDepth = 1` (so cascade
 * notifications enqueue instead of dispatching inline); this function resets
 * `batchDepth` to 0 in its `finally` regardless of outcome.
 */
function drainQueuesLocked(): void {
  try {
    // Outer loop alternates tier-1 and tier-2 until both queues are empty: an
    // effect can write a signal whose subscribers include `{ equals }` notifies,
    // and those refreshes must drain BEFORE the next effect pass so downstream
    // effects see the propagated dirty flag. MAX_PASSES caps effect-tier passes
    // only — recomputes converge via the `equals` short-circuit.
    let effectPass = 0

    // FAST PATH — the dominant case: effects only, no cascade, one pass. Falls
    // through to the general loop (as pass 2+) if that pass enqueued follow-up
    // work, with identical run-counts and MAX_PASSES semantics. Skipping tier-1
    // is sound because we gate on `recomputeQueue.length === 0`.
    if (recomputeQueue.length === 0 && curEffects.length > 0) {
      effectPass = 1
      runEffectPass()
      // No follow-up work → done in one pass. Otherwise fall through to the
      // general loop from pass 2.
      if (recomputeQueue.length === 0 && curEffects.length === 0) {
        return
      }
    }

    while (recomputeQueue.length > 0 || curEffects.length > 0) {
      // Tier 1 — CLEAR-FLAG-BEFORE-RUN cascading iteration. The loop re-reads
      // `recomputeQueue.length`, so an entry that was visited, flag-cleared and
      // then re-PUSHED is visited again. That re-push is the topo-staleness fix:
      // when an upstream `{ equals }` computed refreshes LATER in the drain
      // (subscription order != topo order) and re-dirties an already-visited
      // entry through a lazy intermediate, the re-notify re-enqueues it instead
      // of being dropped by dedup. Converges because each refresh no-ops unless
      // `_dirty` is set and `equals` short-circuits repeated propagation.
      for (let i = 0; i < recomputeQueue.length; i++) {
        const r = recomputeQueue[i]!
        r._rq = 0 // consumed — a genuine post-visit re-dirty re-pushes
        r()
      }
      recomputeQueue.length = 0

      // Tier 2 — ONE effect pass; the intrusive flags handle within-pass dedup
      // and cross-pass re-fire routing. Then loop back to tier 1 for anything
      // the effects enqueued.
      if (curEffects.length > 0) {
        if (++effectPass > MAX_PASSES) {
          if (process.env.NODE_ENV !== 'production') {
            // Surface labels of dropped effects when available.
            const droppedCount = curEffects.length
            const labels: string[] = []
            /* v8 ignore start — forward-looking diagnostic: no effect notify
               currently carries `_label`, so the push/break/labelHint branches
               are unreachable until a future PR populates the field. */
            for (const notify of curEffects) {
              const label = (notify as { _label?: string })._label
              if (label) labels.push(label)
              if (labels.length >= 5) break
            }
            const labelHint = labels.length
              ? ` Sample labels: ${labels.join(', ')}${droppedCount > labels.length ? `, …${droppedCount - labels.length} more` : ''}.`
              : ''
            /* v8 ignore stop */
            // oxlint-disable-next-line no-console
            console.warn(
              '[pyreon] batch effect flush exceeded MAX_PASSES (32) — possible infinite re-enqueue loop. ' +
                `${droppedCount} pending effects dropped.${labelHint} ` +
                'Common cause: an effect that writes to a signal it also reads, without a guard. ' +
                'See packages/core/reactivity/src/batch.ts for the multi-pass flush contract.',
            )
          } else {
            // Surface in production TOO — dropping queued effects leaves the
            // reactive graph inconsistent (some ran, some didn't), a silent
            // correctness failure. Deliberately terse: the detailed message and
            // label scan live in the dev branch, which tree-shakes out of prod.
            // oxlint-disable-next-line no-console
            console.error('[pyreon] MAX_PASSES exceeded — effects dropped (effect writing a signal it reads?)')
          }
          // Drop the queue so subsequent batches start clean — the `finally`
          // resets the intrusive flags on the dropped entries.
          break
        }
        runEffectPass()
      }
    }
  } finally {
    // Reset intrusive membership flags on anything still queued (a notify threw
    // mid-pass, or MAX_PASSES broke out) so the next batch starts clean. `_vg` is
    // generation-based and self-stales. No-ops on the normal completion path.
    // Effects catch internally, but raw `subscribe` listeners can throw straight
    // past this.
    for (let i = 0; i < curEffects.length; i++) curEffects[i]!._eq = EQ.Idle
    curEffects.length = 0
    for (let i = 0; i < nextEffects.length; i++) nextEffects[i]!._eq = EQ.Idle
    nextEffects.length = 0
    for (let i = 0; i < recomputeQueue.length; i++) recomputeQueue[i]!._rq = 0
    recomputeQueue.length = 0
    // Advance past every `_vg` this drain assigned so the NEXT drain's collection
    // window routes every effect to `curEffects`, not `nextEffects` — without
    // this an effect that ran in the previous drain would be misread as "already
    // visited" and silently skip its run.
    _passGen++
    batchDepth = 0
  }
}

export function isBatching(): boolean {
  return batchDepth > 0
}

// ─── Lazy-computed dirty cascade (depth-bounded) ────────────────────────────
//
// A pure lazy cascade (diamond, deep chain) is nothing but dirty-flag marking,
// so it runs at write time rather than through the batch queues.
//
// The SINGLE-SUBSCRIBER segment (the deep-chain shape) is a FUSED ITERATIVE
// WALK over the lazy computed's fields via the `notify._c` back-ref — zero
// closure calls, zero WeakSet lookups, zero JS-stack growth at any depth.
// Only FAN-OUT levels (>=2 subscribers) recurse, and only while shallow:
// past `MAX_CASCADE_RECURSION` they defer to an explicit stack, so a deep
// fan-out tree is chunked with a BOUNDED live stack. Unbounded recursion here
// previously overflowed at ~8000 deep, and the caught RangeError cleared a
// computed's `_dirty` with a STALE value — a silent lost update.
//
// A pure-iterative form was measured and regressed the diamond ~12% (push/pop
// per hop on 4 nodes); the hybrid is deliberate.
//
// NOT on the signal fan-out path, so wide-fan-out / batch-50 are untouched.
const _lazyDirtyStack: Array<() => void> = []
let _lazyDirtyDraining = false
let _cascadeDepth = 0
// Recurse inline up to this nesting depth, then defer to the stack. ~2 JS frames
// per hop, so 500 ~= 1000 frames — well below the V8 ceiling (a bare recursive
// cascade overflowed ~2,600 in a default-stack Node fork) while keeping the
// chunk count trivial (~20) even for a 10k chain.
const MAX_CASCADE_RECURSION = 500

/**
 * Propagate dirtiness from a computed whose value (potentially) changed.
 *
 * Always called under an open batch window (a signal write opens one before
 * dispatch; the tier-1 drain holds `batchDepth = 1`; an `{ equals }` refresh
 * opens its own when pulled outside one), so `enqueuePendingNotification`'s
 * `isBatching()` invariant holds. A notify recompute is dirty-mark-only, so
 * processing one cannot mutate any `_s` mid-walk.
 */
export function propagateLazyDirty(host: LazySource): void {
  // Fused single-subscriber walk — the deep-chain shape resolves here as a plain
  // LOOP over the lazy computed's fields via `notify._c`, replacing per hop a
  // [WeakSet.has + closure call + re-entry] with plain field ops. Iterative, so
  // it consumes zero JS stack at any chain length.
  //
  // The inlined body MUST stay in lock-step with `computedLazy`'s recompute:
  // disposed/already-dirty -> stop; mark dirty; DEFER direct subscribers to the
  // drain (glitch-freedom); continue into the computed's own subscribers.
  //
  // The chain hop reads the `_s1` INLINE SLOT — the shape a linear
  // signal->computed->computed chain always has — so a hop costs a field read
  // rather than materialising a Set iterator (`_s.values().next()`) per level.
  let subs: Set<() => void>
  for (;;) {
    const s1 = host._s1
    let sub: LazyNotify
    if (s1 !== null) {
      sub = s1 as LazyNotify
    } else {
      const s = host._s
      if (s === null) return
      if (s.size !== 1) {
        subs = s
        break
      }
      // A promoted Set that later shrank back to one entry (there is no
      // demotion) — same body, iterator cost paid only in this rarer shape.
      sub = s.values().next().value as LazyNotify
    }
    const c = sub._c
    if (c === undefined) {
      // An `{ equals }` notify, an effect, or a raw listener — route normally.
      enqueuePendingNotification(sub)
      return
    }
    if (c._disposed || c._dirty) return
    c._dirty = true
    if (c._d1) enqueuePendingNotification(c._d1)
    else if (c._d) for (const f of c._d) enqueuePendingNotification(f)
    host = c
  }
  // Fan-out (>=2 subscribers). Read the module counter into a local ONCE and bump
  // it once per LEVEL, not per subscriber. Computed notifies propagate the dirty
  // flag (inline while shallow, else deferred to the stack); everything else
  // enqueues into the two-tier flush.
  const depth = _cascadeDepth
  if (depth >= MAX_CASCADE_RECURSION) {
    // Too deep — defer every lazy branch to the explicit stack; each re-enters
    // at depth 0 and recurses another full window.
    for (const sub of subs) {
      if (_recomputes.has(sub)) _lazyDirtyStack.push(sub)
      else enqueuePendingNotification(sub)
    }
  } else {
    _cascadeDepth = depth + 1
    for (const sub of subs) {
      // The WeakSet check stays FIRST so an effect notify pays only the miss —
      // a leading `_c` read would cost every effect a property-miss proto walk.
      if (_recomputes.has(sub)) {
        const c = (sub as LazyNotify)._c
        if (c !== undefined) _markLazyAndPropagate(c)
        else sub()
      } else enqueuePendingNotification(sub)
    }
    _cascadeDepth = depth
  }
  // Drive the deferred stack ONLY from the outermost frame — a re-entrant call
  // from within the drain leaves its pushes for the active loop.
  if (depth === 0 && _lazyDirtyStack.length > 0 && !_lazyDirtyDraining) {
    _lazyDirtyDraining = true
    try {
      while (_lazyDirtyStack.length > 0) _lazyDirtyStack.pop()!()
    } finally {
      // Discard a partial stack on an unexpected throw so the next cascade
      // starts clean (belt-and-braces — dirty-marking never throws).
      _lazyDirtyStack.length = 0
      _lazyDirtyDraining = false
    }
  }
}

export function enqueuePendingNotification(notify: () => void): void {
  if (_recomputes.has(notify)) {
    // Propagate INLINE (idempotent via the computed's own `_dirty` guard): a
    // pure lazy cascade resolves here and never enters `drainQueuesLocked`.
    const c = (notify as LazyNotify)._c
    if (c !== undefined) _markLazyAndPropagate(c)
    else notify()
    return
  }
  const q = notify as QueuedEffect
  if (q._vg === _passGen) {
    // Already ran this pass → route to the next pass (cross-pass re-fire,
    // ErrorBoundary's self-dispatch pattern). `_eq === Next` dedups it.
    if (q._eq !== EQ.Next) {
      q._eq = EQ.Next
      nextEffects.push(q)
    }
  } else if (q._eq !== EQ.Cur) {
    // Fresh effect: `_vg` 0/undefined never equals the monotonic `_passGen`.
    q._eq = EQ.Cur
    curEffects.push(q)
  }
}

/**
 * Returns a Promise that resolves after all currently-pending microtasks have flushed.
 * Useful when you need to read the DOM after a batch of signal updates has settled.
 *
 * @example
 * count.set(1); count.set(2)
 * await nextTick()
 * // DOM is now up-to-date
 */
export function nextTick(): Promise<void> {
  return new Promise((resolve) => queueMicrotask(resolve))
}
