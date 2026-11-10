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

/**
 * Batch / drain state as fields of one `const` object, not module-level `let`s:
 * V8 pays a context load plus a TDZ hole check per access to a module `let` and
 * hoists neither across calls. See the measurement on `TrackingFrame` in
 * tracking.ts.
 */
interface BatchState {
  /** Open batch windows (explicit `batch()` and inline write windows). */
  d: number
  /**
   * Monotonic effect-pass generation, never reset — monotonicity is what makes
   * stale generations from prior passes/drains automatically read as "not
   * visited" (see `QueuedEffect._vg`).
   */
  g: number
  /** Re-entrancy guard for the deferred `_lazyDirtyStack` drain. */
  r: boolean
  /** Current inline recursion depth of `propagateLazyDirty`. */
  c: number
}
const _b: BatchState = {
  d: 0,
  g: 1,
  r: false,
  c: 0,
}

// Tier-1 entries clear their flag BEFORE running (the array analogue of
// delete-before-run) so a genuine post-visit re-dirty RE-PUSHES the entry and
// the length-re-reading drain visits it again — see `drainQueuesLocked`.
interface QueuedRefresh {
  (): void
  /** @internal tier-1 membership flag — 1 = queued, 0/undefined = idle. Created lazily on first enqueue. */
  _rq?: 0 | 1
}
const recomputeQueue: QueuedRefresh[] = []

// Effect-queue intrusive fields. `effect()` creates them up front (see the
// comment there: lazily created, V8 dispatched queued runs measurably slower);
// everything else that can be enqueued — `renderEffect` runs, `direct`
// updaters, raw `subscribe` listeners — gets them on first enqueue, so a
// binding that is never queued stays a bare closure.
//   `_eq` — queue membership. Cur/Next are mutually exclusive in time (an effect
//           leaves `curEffects` before it can enter `nextEffects`), so one
//           tri-state field dedups BOTH queues.
//   `_vg` — pass GENERATION it last ran in. `_vg === _b.g` ⇔ "already ran
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

// Every computed NOTIFY recompute carries `_rc = true` (stamped by
// `_markRecompute`). The enqueue router checks it FIRST because a MISS means an
// effect — the wide-fan-out hot path. An own boolean read replaced a
// `WeakSet.has`: every effect fn shares one shape, so the absent-property read
// is an inline-cache hit rather than a hash lookup (measured −13% V8 wide
// fan-out, and see the PR for JSC). A plain field also costs a computed nothing
// beyond its existing property storage, where the set held a weak entry each.
const MAX_PASSES = 32

// Fused-cascade back-ref: `_markRecompute` stamps a LAZY computed's read fn onto
// its notify as `_c`, letting `propagateLazyDirty` walk a single-subscriber chain
// ITERATIVELY over plain fields instead of paying a recompute check + closure call
// + re-entry per hop. An EAGER (`{ equals }`) notify does MORE than dirty-marking
// (it books a tier-1 refresh unconditionally, so the gate sits at its OWN node)
// so it is deliberately NOT stamped; the walk routes `_c`-less recomputes through
// their own closure and treats a `_c`-less NON-recompute as a genuine runner.
// Structural interface — batch.ts must not import computed.ts (layer order).
/** Anything that carries two-tier tracking-subscriber storage (signal or computed). */
interface LazySource {
  _s1: (() => void) | null
  _s: Set<() => void> | (() => void) | null
}
/**
 * A computed's staleness, ordered so a stronger mark is the larger number:
 *  - `CLEAN` (0): the cached value is current.
 *  - `STRICT CHECK` (1): reached only BELOW a node that gates on its own —
 *    an `{ equals }` computed, a computed with direct updaters, or a fan-out
 *    whose owner is booked for a gated refresh. Before CHECK state these were
 *    not marked at all; they are marked now only so a pull inside a batch
 *    re-validates instead of returning a stale cache. The read ALWAYS refreshes
 *    its computed deps first, so such a node evaluates only when one of them
 *    really changed — exactly as quiet as before (a node whose `fn` builds a
 *    fresh object would otherwise re-notify its runners on every write).
 *  - `CHECK` (2): something UPSTREAM may have changed — a transitive mark from
 *    the write walk. The read either refreshes its computed deps first and
 *    skips `fn` when none changed (the equality cutoff), or evaluates `fn`
 *    directly when its cutoff predictor expects a change (computed.ts).
 *  - `DIRTY` (3): a DIRECT source changed (a signal write, or a dep computed
 *    that re-evaluated to a new value). The read re-evaluates.
 *  - 4: disposed while marked (computed.ts `dispose`); never strengthened.
 * Same model as alien-signals' Pending/Dirty and Solid 2's CHECK/DIRTY.
 * Plain number literals at every use site (not a `const enum`, which does not
 * inline across modules under isolated transpilation).
 */
export type Stale = 0 | 1 | 2 | 3 | 4
interface LazyTarget extends LazySource {
  _dirty: Stale
  _disposed: boolean
  _d1: (() => void) | null
  _d: Set<() => void> | null
}
interface LazyNotify {
  (): void
  /** @internal true on every computed notify (lazy AND eager). */
  _rc?: boolean
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
  ;(fn as LazyNotify)._rc = true
  if (target !== undefined) (fn as LazyNotify)._c = target
}

/**
 * The canonical LAZY-computed notify body: mark `c` dirty (idempotent — a
 * diamond re-visit early-returns), DEFER its direct updaters to the batch drain
 * (glitch-freedom — see computed.ts), then cascade into subscribers.
 * `propagateLazyDirty`'s single-subscriber walk INLINES this body as its loop
 * (deliberate fusion) — keep the two in lock-step.
 */
export function _markLazyAndPropagate(c: LazyTarget, level: 1 | 2 | 3): void {
  const st = c._dirty
  if (st !== 0) {
    // Already marked, so its subscribers were already reached (or it is booked
    // for a tier-1 refresh that will reach them on a real change). Only
    // strengthen the mark; never cascade again (the diamond dedup). 4
    // (disposed while marked) is never strengthened.
    if (st < level) c._dirty = level
    return
  }
  if (c._disposed) return
  c._dirty = level
  // A DIRECT updater (`_bindText` / `_bindDirect`) is a RUNNER: it fires and
  // writes the DOM. Under value gating we must not fire it before knowing the
  // value actually changed, so book the tier-1 refresh instead and let the
  // gate decide. `dispatchEagerChange` re-enqueues the updaters on a real change.
  // The tracking subscribers below are STILL marked: a computed left clean
  // under a marked one would answer a pull inside the batch with its stale
  // cache (CHECK makes the mark cheap — it re-evaluates nothing unless `c`
  // really changes).
  // Below a node with direct updaters, and below a STRICT one, marks are STRICT.
  let deep: 1 | 2 = level === 1 ? 1 : 2
  if (c._d1 !== null || c._d !== null) {
    enqueueEagerRefresh(c as unknown as () => void)
    deep = 1
  }
  // `c` is BOTH the storage host to walk and the gate owner: a runner found
  // below it must gate HERE rather than be enqueued. Everything below `c` is
  // only POSSIBLY stale (c may re-evaluate to an equal value), so the walk
  // marks CHECK.
  if (c._s1 !== null || c._s !== null) propagateLazyDirty(c, c, deep)
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
  _b.d++
  try {
    fn()
  } finally {
    _b.d--
    if (_b.d === 0 && (recomputeQueue.length > 0 || curEffects.length > 0)) {
      // Keep batching active during the flush so cascade notifications enqueue
      // (and dedup) into the same queues instead of firing inline.
      _b.d = 1
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
  _b.d++
}

/** @internal Pair of {@link openInlineBatch}. Drains cascades, resets depth. */
export function closeInlineBatch(): void {
  _b.d--
  if (_b.d === 0 && (recomputeQueue.length > 0 || curEffects.length > 0)) {
    _b.d = 1
    drainQueuesLocked()
  }
}

/**
 * Empty a drain queue, skipping the store when it is already empty.
 *
 * `arr.length = 0` is a slow store on BOTH engines even when it changes
 * nothing: measured ~16ns on an already-empty array under V8 (node 26) and JSC
 * (bun 1.4), M3 Max. A drain truncates up to five queues per write, nearly all
 * of them already empty, and those stores were the largest self-time lines of
 * `drainQueuesLocked` in a diamond-into-effect profile.
 *
 * `runEffectPass` additionally empties a ONE-entry pass with `pop()`: V8's
 * `length = 0` on a non-empty array costs ~25ns and drops the backing store, so
 * the next drain's first `push` re-allocates. Popping in the tier-1 loop as well
 * was measured and rejected: it regressed a 50-deep chain read by an effect by
 * ~11% on V8 (an inlining-budget effect on `drainQueuesLocked`), so only the
 * effect pass pops.
 */
function clearQueue(q: unknown[]): void {
  if (q.length !== 0) q.length = 0
}

/**
 * Run ONE effect pass over `curEffects`, then promote `nextEffects`.
 * `curEffects.length` is re-read each iteration so newly-enqueued (not yet
 * visited) effects run THIS pass — matching JS Set iteration semantics.
 */
function runEffectPass(): void {
  _b.g++
  const cur = curEffects
  for (let i = 0; i < cur.length; i++) {
    const fn = cur[i]!
    fn._eq = EQ.Idle // consumed from curEffects — a re-enqueue now routes via _vg
    fn._vg = _b.g // mark visited this pass
    fn()
  }
  // A single-effect pass (the dominant shape: one write, one effect) empties
  // with `pop()`, which keeps the backing store; see `clearQueue`.
  if (cur.length === 1) cur.pop()
  else clearQueue(cur)
  // Promote next-pass entries (self-re-fire) into curEffects for the next pass.
  const next = nextEffects
  if (next.length > 0) {
    for (let i = 0; i < next.length; i++) {
      const f = next[i]!
      f._eq = EQ.Cur
      cur.push(f)
    }
    clearQueue(next)
  }
}

/**
 * Drain both queues to empty. Caller must hold `_b.d = 1` (so cascade
 * notifications enqueue instead of dispatching inline); this function resets
 * `_b.d` to 0 in its `finally` regardless of outcome.
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
      clearQueue(recomputeQueue)

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
    clearQueue(curEffects)
    for (let i = 0; i < nextEffects.length; i++) nextEffects[i]!._eq = EQ.Idle
    clearQueue(nextEffects)
    for (let i = 0; i < recomputeQueue.length; i++) recomputeQueue[i]!._rq = 0
    clearQueue(recomputeQueue)
    // Advance past every `_vg` this drain assigned so the NEXT drain's collection
    // window routes every effect to `curEffects`, not `nextEffects` — without
    // this an effect that ran in the previous drain would be misread as "already
    // visited" and silently skip its run.
    _b.g++
    _b.d = 0
  }
}

export function isBatching(): boolean {
  return _b.d > 0
}

// ─── Lazy-computed dirty cascade (depth-bounded) ────────────────────────────
//
// A pure lazy cascade (diamond, deep chain) is nothing but dirty-flag marking,
// so it runs at write time rather than through the batch queues.
//
// The SINGLE-SUBSCRIBER segment (the deep-chain shape) is a FUSED ITERATIVE
// WALK over the lazy computed's fields via the `notify._c` back-ref — zero
// closure calls, zero recompute lookups, zero JS-stack growth at any depth.
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
// Recurse inline up to this nesting depth, then defer to the stack. ~2 JS frames
// per hop, so 500 ~= 1000 frames — well below the V8 ceiling (a bare recursive
// cascade overflowed ~2,600 in a default-stack Node fork) while keeping the
// chunk count trivial (~20) even for a 10k chain.
const MAX_CASCADE_RECURSION = 500

/**
 * Propagate dirtiness from a computed whose value (potentially) changed.
 *
 * Always called under an open batch window (a signal write opens one before
 * dispatch; the tier-1 drain holds `_b.d = 1`; an `{ equals }` refresh
 * opens its own when pulled outside one), so `enqueuePendingNotification`'s
 * `isBatching()` invariant holds. A notify recompute is dirty-mark-only, so
 * processing one cannot mutate any `_s` mid-walk.
 */
export function propagateLazyDirty(
  host: LazySource,
  owner: LazyTarget | null = null,
  deep: 1 | 2 = 2,
): void {
  // `owner` — the computed whose GATE governs this level, or null when the caller
  // has ALREADY established that a real value change occurred. It tracks `host`
  // from the first hop onward but is NOT interchangeable with it at entry:
  // `dispatchEagerChange` passes a computed that has just gated and decided to
  // propagate, whose `_dirty` is already cleared — gating there would book a
  // refresh that no-ops and the update would be lost. So the two callers differ
  // exactly in this argument.
  //
  // When set, reaching a RUNNER (effect / raw listener) means "someone downstream
  // will actually execute", which is precisely the condition under which the
  // owner must be value-gated: book its tier-1 refresh instead of enqueueing the
  // runner. The owner advances with the walk, so the gate lands on the DEEPEST
  // computed that still sits above a runner.
  //

  // Fused single-subscriber walk — the deep-chain shape resolves here as a plain
  // LOOP over the lazy computed's fields via `notify._c`, replacing per hop a
  // [recompute check + closure call + re-entry] with plain field ops. Iterative, so
  // it consumes zero JS stack at any chain length.
  //
  // The inlined body MUST stay in lock-step with `_markLazyAndPropagate`:
  // already marked -> strengthen CHECK to DIRTY if this hop is DIRTY, then
  // stop; disposed -> stop; else mark at this hop's level; a direct subscriber books
  // the gated refresh; continue into the computed's own subscribers at CHECK.
  //
  // The chain hop reads the `_s1` INLINE SLOT — the shape a linear
  // signal->computed->computed chain always has — so a hop costs a field read
  // rather than materialising a Set iterator (`_s.values().next()`) per level.
  // Staleness level for the subscribers at the CURRENT hop: DIRECT subscribers
  // of a computed that really changed (`owner === null`) are DIRTY; anything
  // reached through a node that was only marked is `deep` — CHECK, or STRICT
  // CHECK below a self-gating node (see `Stale`). After the first hop `owner`
  // is always set, so every deeper hop is `deep`.
  let level: 1 | 2 | 3 = owner === null ? 3 : deep
  let subs: Iterable<() => void>
  for (;;) {
    const s1 = host._s1
    let sub: LazyNotify
    if (s1 !== null) {
      // Two inline subscribers: not a chain hop — fan out as a Set would.
      const s2 = host._s as (() => void) | null
      if (s2 !== null) {
        subs = [s1, s2]
        break
      }
      sub = s1 as LazyNotify
    } else {
      const s = host._s as Set<() => void> | null
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
      // No back-ref: either an EAGER (`{ equals }`) computed notify — which gates
      // at its own node and must run — or a genuine RUNNER. `_rc` is the
      // discriminator, the SAME lookup `enqueuePendingNotification` would have
      // made, hoisted so the runner branch can gate the owner instead of
      // enqueueing blindly.
      if ((sub as LazyNotify)._rc === true) {
        // EAGER `{ equals }` notify: hand it this hop's staleness level.
        ;(sub as (level: 1 | 2 | 3) => void)(level)
        return
      }
      if (owner !== null) {
        enqueueEagerRefresh(owner as unknown as () => void)
        return
      }
      enqueuePendingNotification(sub)
      return
    }
    const st = c._dirty
    if (st !== 0) {
      if (st < level) c._dirty = level
      return
    }
    if (c._disposed) return
    c._dirty = level
    // Direct updaters gate on `c`'s refresh; its tracking subscribers are still
    // walked (see `_markLazyAndPropagate`).
    if (c._d1 !== null || c._d !== null) {
      enqueueEagerRefresh(c as unknown as () => void)
      deep = 1
    }
    // From here on host and owner are the same node — the loop top handles the
    // no-subscriber exit, so there is no `_s === null` check to carry.
    host = c
    owner = c
    level = deep
  }
  // Fan-out (>=2 subscribers). Read the module counter into a local ONCE and bump
  // it once per LEVEL, not per subscriber. Computed notifies propagate the dirty
  // flag (inline while shallow, else deferred to the stack); everything else
  // enqueues into the two-tier flush.
  // A runner sighted behind a gating owner books the owner's tier-1 refresh
  // (once, after the loop) instead of being enqueued; the owner re-dispatches to
  // it on a real change. The walk does NOT stop there: every computed
  // subscriber after the runner is marked STRICT CHECK (before CHECK state they
  // were left unmarked), so a pull before the refresh (inside a batch, or from
  // another tier-1 refresh) re-validates through the owner instead of returning
  // a stale cache, and an unchanged owner leaves them evaluating nothing.
  let gated = false
  const depth = _b.c
  if (depth >= MAX_CASCADE_RECURSION) {
    // Too deep — defer every lazy branch to the explicit stack; each re-enters
    // at depth 0 and recurses another full window.
    for (const sub of subs) {
      if ((sub as LazyNotify)._rc === true) _lazyDirtyStack.push(sub)
      else if (owner !== null) gated = true
      else enqueuePendingNotification(sub)
    }
  } else {
    _b.c = depth + 1
    for (const sub of subs) {
      // The `_rc` check stays FIRST: an effect notify pays one absent-field
      // read, and only a recompute goes on to read `_c`.
      if ((sub as LazyNotify)._rc === true) {
        const c = (sub as LazyNotify)._c
        const lv = gated ? 1 : level
        if (c !== undefined) _markLazyAndPropagate(c, lv)
        else (sub as (level: 1 | 2 | 3) => void)(lv)
      } else if (owner !== null) gated = true
      else enqueuePendingNotification(sub)
    }
    _b.c = depth
  }
  if (gated) enqueueEagerRefresh(owner as unknown as () => void)
  // Drive the deferred stack ONLY from the outermost frame — a re-entrant call
  // from within the drain leaves its pushes for the active loop.
  if (depth === 0 && _lazyDirtyStack.length > 0 && !_b.r) {
    _b.r = true
    try {
      while (_lazyDirtyStack.length > 0) _lazyDirtyStack.pop()!()
    } finally {
      // Discard a partial stack on an unexpected throw so the next cascade
      // starts clean (belt-and-braces — dirty-marking never throws).
      _lazyDirtyStack.length = 0
      _b.r = false
    }
  }
}

export function enqueuePendingNotification(notify: () => void): void {
  if ((notify as LazyNotify)._rc === true) {
    // Propagate INLINE (idempotent via the computed's own `_dirty` guard): a
    // pure lazy cascade resolves here and never enters `drainQueuesLocked`.
    // A notify delivered here comes straight from a changed source (a signal
    // write, selector bucket, store detector): DIRTY.
    const c = (notify as LazyNotify)._c
    if (c !== undefined) _markLazyAndPropagate(c, 3)
    else notify()
    return
  }
  const q = notify as QueuedEffect
  if (q._vg === _b.g) {
    // Already ran this pass → route to the next pass (cross-pass re-fire,
    // ErrorBoundary's self-dispatch pattern). `_eq === Next` dedups it.
    if (q._eq !== EQ.Next) {
      q._eq = EQ.Next
      nextEffects.push(q)
    }
  } else if (q._eq !== EQ.Cur) {
    // Fresh effect: `_vg` 0/undefined never equals the monotonic `_b.g`.
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
