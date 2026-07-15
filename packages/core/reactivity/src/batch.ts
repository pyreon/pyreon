// Batch multiple signal updates into a single notification pass.
// Two-tier flush: computed recomputes settle first, THEN effects drain
// (multi-pass with cross-pass re-fire support).
//
// Dev-mode invariant gate: see https://github.com/pyreon/pyreon/blob/main/packages/core/reactivity/src/tests/batch.test.ts
// for the property-based test that fuzzes random cascade graphs against this
// invariant. The build-time gate folds to dead code in production bundles.

let batchDepth = 0

// Two-tier queue design:
//
// 1. **Recomputes settle first.** EVERY computed's source-subscribed callback
//    (lazy default AND `{ equals }`) is a dirty-mark-only + idempotent NOTIFY,
//    so it runs INLINE during the write's notify phase (see `_recomputes` /
//    `enqueuePendingNotification`) — a pure lazy-computed cascade never touches
//    a queue. An `{ equals }` computed's notify ADDITIONALLY books a guaranteed
//    evaluation by enqueuing its refresh (the read fn) into the tier-1
//    `recomputeQueue` (`enqueueEagerRefresh`), drained FIRST in a
//    clear-flag-before-run cascading-iteration loop. Because dirtiness is
//    established at NOTIFY time, a tier-1 visitor that pull-reads a dirty dep
//    evaluates it in place — subscription order ≠ topological order is fine —
//    and the clear-flag-before-run shape lets a genuine post-visit re-dirty (a
//    lazy intermediate whose dirtiness only materialized when an upstream
//    `{ equals }` computed refreshed later in the drain) RE-PUSH the visited
//    entry for another (idempotent, `_dirty`-guarded) sweep. Either way, all
//    computed values are settled before any effect fires — so effects always
//    read fully-propagated values.
//
// 2. **Effects — the `curEffects` array + intrusive flags.** Drained SECOND,
//    multi-pass. Was two Sets + a scratch Set; the array + a per-effect
//    membership flag (`_eq`) + a pass-generation counter (`_vg`) is measurably
//    faster on the wide-fan-out hot path (Set hashing on function-object keys
//    was the cost — a structurally-faithful micro-bench measured ~8× on the
//    enqueue+drain of 100 effects), and it's the array-of-closures analogue of
//    Preact's intrusive-linked-list + NOTIFIED-bitflag batching. Within-pass
//    dedup (diamond / multi-dep selector) is the `_eq === Cur` guard; cross-pass
//    re-fire — needed for control flow that re-renders on its own dispatch (e.g.
//    ErrorBoundary's handler calling `error.set(err)` during the run that
//    mounted the throwing child) — routes an already-ran effect (`_vg ===
//    _passGen`) to `nextEffects`. MAX_PASSES caps total passes at 32 to prevent
//    pathological infinite re-enqueue loops.
//
// **Why two tiers:** all computed recomputes settle before any effect runs, so
// a deep cascade (3+ hops) can't have an effect read a stale upstream value.
// The cascade-asymmetry contract is preserved (effects fire once per batched
// change) AND multi-pass unblocks ErrorBoundary's self-dispatch pattern without
// breaking the single-fire contract for non-self-dispatching effects.
//
// **How a callback gets routed** (`enqueuePendingNotification`): a computed
// registers its notify `recompute` via `_markRecompute` at creation; the
// `_recomputes` WeakSet catches recomputes first (a miss = an effect → the
// cheap fan-out path) and runs them INLINE (all recomputes are dirty-marking
// notifies now — `{ equals }` refreshes reach tier-1 only via
// `enqueueEagerRefresh`, called by the notify itself).
//
// Tier-1 storage is an ARRAY + an intrusive membership flag (`_rq`) on the
// refresh fn — the same design (and for the same measured reason: Set hashing
// on function-object keys dominated) as the tier-2 effect queue below. The
// flag is cleared BEFORE each entry runs (the array analogue of
// delete-before-run), so a genuine post-visit re-dirty re-PUSHES the entry and
// the length-re-reading drain loop visits it again.
interface QueuedRefresh {
  (): void
  /** @internal tier-1 membership flag — 1 = queued, 0/undefined = idle. Created lazily on first enqueue. */
  _rq?: 0 | 1
}
const recomputeQueue: QueuedRefresh[] = []

// ─── Effect queue: array + intrusive flags (was two Sets + a scratch Set) ────
//
// The effect tier is the wide-fan-out hot path (one signal → N effects). The
// prior Set-based queue paid, per enqueued effect, a `pendingEffects.add`, a
// `_visitedScratch.add` in the drain, and Set iteration + `.clear()`. A
// structurally-faithful micro-bench measured 100 effects enqueued+drained at
// ~434k ops/s with Sets vs ~3.6M ops/s (8.4×) with an array + a per-effect
// boolean "queued" flag — the Set hashing/rehashing on function-object keys is
// the cost. Preact's signals get the same win from an intrusive linked list +
// a NOTIFIED bitflag; this is the array-of-closures analogue.
//
// The effect closure carries TWO intrusive fields, created LAZILY the first
// time the effect is enqueued/run (NOT at effect creation) so an effect that
// never re-fires stays a bare closure with zero added retained bytes — the
// dominant "create, run once, never notified again" shape. An effect that does
// participate in the queue pays the fields once, on first enqueue, when it's
// already doing work; after that every effect that has fired shares ONE hidden
// class so the per-enqueue flag reads stay (steady-state) monomorphic:
//   - `_eq` : queue membership — 0/undefined = idle, 1 = in `curEffects` (this
//             pass), 2 = in `nextEffects` (next pass). Cur/Next are mutually
//             exclusive in time (an effect leaves `curEffects` before it can
//             enter `nextEffects`), so one tri-state field dedups BOTH queues.
//   - `_vg` : the pass GENERATION in which it last ran. `_vg === _passGen`
//             ⇔ "already ran this pass" → a re-enqueue routes to the NEXT pass
//             (ErrorBoundary's self-dispatch pattern). A generation counter
//             replaces the Set's wholesale `.clear()` with an O(1) `_passGen++`
//             at each pass boundary — matching the Set version's clear-at-pass-
//             start timing exactly (a stale `_vg` from a prior pass/drain never
//             collides with the monotonic `_passGen`).
//
// A never-enqueued effect, a raw `signal.subscribe` listener, or a `direct`
// updater reads these fields as `undefined`/falsy (correct: treated as
// not-queued/not-visited), the field created on first enqueue.
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
// Monotonic pass generation. Incremented at each effect-pass boundary; an
// effect whose `_vg` equals the current value ran in the current pass. Never
// reset — a JS double is unbounded for practical purposes, and monotonicity is
// what makes stale generations from prior passes/drains automatically "not
// visited".
let _passGen = 1
// All computed NOTIFY recomputes (lazy default AND `{ equals }` — since the
// topo-staleness fix both variants' source-subscribed callback is a
// dirty-mark-only + idempotent notify, guarded by the computed's `_dirty`
// flag, safe to run INLINE during notification — exactly like Preact's
// write-time dirty-marking traversal). Checked FIRST in the enqueue router: a
// miss (`false`) means an EFFECT (or raw subscribe listener / direct updater),
// which is the wide-fan-out hot path — so this must be the CHEAP, single lookup
// there. `WeakSet.has` on an absent key is measurably faster than `WeakMap.get`
// returning `undefined` (an A/B that used one `WeakMap<fn, kind>` here
// un-flipped both the fan-out and batch-50 wins). Running notifies inline (a
// DFS through the dependency graph) means a pure lazy-computed cascade — a
// diamond `a→{b,c}→d`, a deep chain — NEVER touches the pending queues:
// everything settles during the write's notify phase and `drainQueues` is
// never even entered (both queues empty at `closeInlineBatch`). An
// `{ equals }` computed's notify ALSO books its guaranteed evaluation via
// `enqueueEagerRefresh` (tier-1); effects stay in tier-2.
//
// (Collapsing the former second `_lazyRecomputes` WeakSet — every marked
// callback is now inline-safe — also removed one `WeakSet.has` from the
// cascade hot path.)
const _recomputes = new WeakSet<() => void>()
const MAX_PASSES = 32

/**
 * Mark a callback as a computed NOTIFY recompute (called from `computedLazy` /
 * `computedWithEquals` at creation time). Notifies are dirty-mark-only +
 * idempotent, so `enqueuePendingNotification` and `propagateLazyDirty` run
 * them INLINE during the write's notify phase — a pure-computed cascade never
 * enters the pending queues.
 */
export function _markRecompute(fn: () => void): void {
  _recomputes.add(fn)
}

/**
 * Book a guaranteed tier-1 evaluation of an `{ equals }` computed — called by
 * its notify with the computed's READ function (whose dirty branch is the
 * refresh: verify-eval + equals gate + propagate-on-change). Drained FIRST,
 * before any effect, in the clear-flag-before-run loop below — so a genuine
 * post-visit re-dirty re-pushes the entry (the drain re-reads the length and
 * visits it again) instead of being dropped by dedup, and an entry whose
 * value was already pulled fresh by an earlier visitor no-ops via its own
 * `_dirty` guard.
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
      // Keep batching active during flush so cascade-notifications emitted
      // by flushing subscribers enqueue into the same queues (dedup against
      // already-queued entries) instead of firing inline.
      batchDepth = 1
      drainQueuesLocked()
    }
  }
}

/**
 * Open an inline batch window WITHOUT the per-call closure `batch(fn)` costs.
 * The caller delivers its own notifications directly (signal.set's unbatched
 * single-write fast path), then MUST call {@link closeInlineBatch} in a
 * `finally`. Cascade writes emitted by the directly-invoked subscriber see
 * `isBatching() === true` and enqueue into the shared queues, which
 * `closeInlineBatch` drains with the exact same two-tier machinery as
 * `batch()` — semantics (tier ordering, diamond dedup, multi-pass re-fire,
 * MAX_PASSES) are identical by construction because the drain is the SAME
 * function.
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
 * Run ONE effect pass over `curEffects` and promote `nextEffects` for the next.
 *
 * `_passGen++` is the O(1) replacement for the old `_visitedScratch.clear()` —
 * an effect is "visited this pass" iff `_vg === _passGen`, so a re-enqueue
 * during the pass routes to `nextEffects` (see `enqueuePendingNotification`).
 * `curEffects.length` is re-read each iteration so newly-enqueued (not-yet-
 * visited) effects run THIS pass — matching JS Set iteration visiting entries
 * added during iteration.
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
    // Outer loop: alternate between tier-1 (recomputes) and tier-2
    // (effects) until both queues are empty. An effect can write a
    // signal whose subscribers include `{ equals }` computed notifies — those
    // book refreshes into recomputeQueue mid-effect, and we need to
    // drain them BEFORE the next effect pass so downstream effects see
    // the propagated dirty flag. MAX_PASSES caps the OUTER loop —
    // counts effect-tier passes only since recomputes converge by
    // `equals` short-circuit and don't infinite-loop in practice.
    let effectPass = 0

    // FAST PATH — the dominant case: effects only (no computed recomputes
    // pending) draining in a SINGLE pass because the effects don't cascade
    // (the overwhelming majority of batched writes — a handful of subscribers
    // / bindings that read + do work without writing more signals). The general
    // multi-pass loop below pays an outer-loop check + a recompute-tier drain
    // even when none of that is needed.
    //
    // This runs exactly ONE effect pass (`effectPass = 1`) and returns if it
    // produced no follow-up work. A cascade (an effect that enqueues a
    // recompute, a new effect, or re-enqueues itself) falls through to the
    // general loop as pass 2+ — IDENTICAL run-counts and MAX_PASSES semantics
    // to the general path (both call `runEffectPass`). Skipping tier-1 here is
    // sound because we gate on `recomputeQueue.length === 0`.
    if (recomputeQueue.length === 0 && curEffects.length > 0) {
      effectPass = 1
      runEffectPass()
      // No follow-up work → done in one pass.
      if (recomputeQueue.length === 0 && curEffects.length === 0) {
        return
      }
      // else: a cascade enqueued recomputes/effects → continue with the general
      // multi-pass loop below (from pass 2).
    }

    while (recomputeQueue.length > 0 || curEffects.length > 0) {
      // Tier 1: drain all `{ equals }` refreshes via CLEAR-FLAG-BEFORE-RUN
      // cascading iteration. The loop re-reads `recomputeQueue.length` each
      // step, so entries pushed during the drain are visited — including an
      // entry that was visited, flag-cleared, and re-PUSHED. That re-push
      // path is the topo-staleness fix's tier-1 half: when an upstream
      // `{ equals }` computed refreshes LATER in the drain (subscription
      // order ≠ topo order) and re-dirties an already-visited entry THROUGH a
      // lazy intermediate (whose dirtiness only materialized at that
      // refresh), the re-notify re-enqueues the visited entry instead of
      // being dropped by dedup. Convergence: each refresh no-ops unless its
      // `_dirty` flag is set (a re-push costs a real change upstream), and
      // `equals` short-circuits repeated propagation — a DAG settles in ≤
      // depth sweeps (the dominant shapes settle in one: dirty-at-notify +
      // pull-reads make visit order irrelevant when deps are dirty-at-visit).
      for (let i = 0; i < recomputeQueue.length; i++) {
        const r = recomputeQueue[i]!
        r._rq = 0 // consumed — a genuine post-visit re-dirty re-pushes
        r()
      }
      recomputeQueue.length = 0

      // Tier 2: drain ONE pass of effects in multi-pass mode. Within-pass
      // dedup + cross-pass re-fire routing are handled by the intrusive flags
      // (`_q`/`_vg`/`_qn`) in `enqueuePendingNotification`. After the pass,
      // loop back to tier 1 to drain any recomputes the effects enqueued.
      if (curEffects.length > 0) {
        if (++effectPass > MAX_PASSES) {
          if (process.env.NODE_ENV !== 'production') {
            // Surface labels of dropped effects when available — helps
            // identify the offending effect in a real app. Falls back to
            // bare count for anonymous effects.
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
            // reactive graph inconsistent (some effects ran, some didn't), a
            // silent correctness failure the dev-only branch above hid from
            // production. Kept deliberately TERSE (the detailed message + label
            // scan live in the dev branch, which tree-shakes out of prod) so the
            // prod diagnostic costs the core minimal-import only ~one short
            // string; fires per trip, matching the dev warning (a tripping
            // effect is a user bug that must be fixed, not throttled away).
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
    // Reset intrusive flags on anything still queued (a notify threw mid-pass,
    // or MAX_PASSES broke out) so the next batch starts clean. `_vg` is
    // generation-based and self-stales — only the boolean membership flags
    // (`_q`/`_qn`) need clearing. On the NORMAL completion path both arrays are
    // already empty (drained in `runEffectPass`), so these loops are no-ops.
    // Effects wrap their callbacks in try/catch internally so a throw-through is
    // rare, but raw `signal.subscribe` listeners can throw straight past.
    for (let i = 0; i < curEffects.length; i++) curEffects[i]!._eq = EQ.Idle
    curEffects.length = 0
    for (let i = 0; i < nextEffects.length; i++) nextEffects[i]!._eq = EQ.Idle
    nextEffects.length = 0
    for (let i = 0; i < recomputeQueue.length; i++) recomputeQueue[i]!._rq = 0
    recomputeQueue.length = 0
    // Advance the pass generation past every `_vg` this drain assigned, so the
    // NEXT drain's collection window (enqueues that happen before its first
    // `runEffectPass`) sees `_vg !== _passGen` for every effect and routes them
    // to `curEffects` (this pass), not `nextEffects`. This is the generation-
    // counter equivalent of the old `_visitedThisPass = null` reset — without
    // it, an effect that ran in the previous drain would be misrouted as
    // "already visited" on the next external write and silently skip its run.
    _passGen++
    batchDepth = 0
  }
}

export function isBatching(): boolean {
  return batchDepth > 0
}

// ─── Lazy-computed dirty cascade (depth-bounded recursion) ───────────────────
//
// A pure lazy-computed cascade (a diamond `a→{b,c}→d`, a deep chain) is nothing
// but dirty-flag marking: every hop is one lazy recompute dirty-marking the
// NEXT lazy recompute. Routing each hop through the generic batch enqueue paid,
// per node, a `notifySubscribers` call + an `enqueuePendingNotification` call +
// TWO `WeakSet.has` (`_recomputes` then `_lazyRecomputes`) — the write-time
// cascade was measured as the entire diamond/chain gap vs @preact/signals-core
// (Preact's write-time dirty propagation is a bare linked-list flag walk).
//
// #2284/#2296 made the hop an INLINE recursive call (one `_recomputes.has`,
// no queue) — fast, but UNBOUNDED: a deep chain (~8000+) overflowed the JS
// stack; the caught RangeError cleared a computed's `_dirty` with a STALE value
// → a silent lost update (the tail never re-derived). 0.45.0 propagated
// iteratively and was correct at 10,000.
//
// This keeps the FAST recursive hop for the common shallow case (a `_cascadeDepth`
// counter tracks nesting) and switches to an EXPLICIT stack ONLY past
// `MAX_CASCADE_RECURSION` — so a diamond / a depth-50 chain pays zero stack/array
// overhead (byte-identical to #2296's inline recursion) while a genuinely deep
// chain is chunked (recurse ~N, defer the tail, unwind, recurse ~N again) with a
// BOUNDED live stack and no overflow. A pure recursion-only or pure-iterative
// form was measured: pure-iterative regressed the diamond ~12% (the push/pop +
// re-push per hop on 4 nodes); the hybrid restores it.
//
// A deferred recompute popped from the stack re-enters at `_cascadeDepth === 0`,
// so it recurses another full `MAX_CASCADE_RECURSION` window before deferring
// again — the live JS stack never exceeds ~`MAX_CASCADE_RECURSION` cascade
// frames regardless of chain length. `_lazyDirtyDraining` makes the OUTERMOST
// entry own the stack drain.
//
// This is NOT on the signal fan-out path (`_set` → `notifySubscribers` for a
// multi-subscriber signal), so the wide-fan-out / batch-50 hot paths are
// untouched.
const _lazyDirtyStack: Array<() => void> = []
let _lazyDirtyDraining = false
let _cascadeDepth = 0
// Recurse inline up to this nesting depth, then defer to the stack. ~2 JS
// frames per hop (`propagateLazyDirty` + `recompute`), so 500 ≈ 1000 frames —
// comfortably below the default V8 JS-stack ceiling (a bare recursive cascade
// overflowed ~2,600 in a default-stack Node fork) with wide margin, while
// keeping the chunk count for even a 10k chain trivial (~20).
const MAX_CASCADE_RECURSION = 500

/**
 * Propagate dirtiness from a computed whose value (potentially) changed to its
 * subscribers.
 *
 * Called from a computed's notify `recompute` (lazy) or from an `{ equals }`
 * computed's refresh after a real change — both always run under an open batch
 * window (a signal write opens one before dispatch; the tier-1 drain holds
 * `batchDepth = 1`; the `{ equals }` refresh opens its own when pulled outside
 * one), so `enqueuePendingNotification`'s `isBatching()` invariant holds. A
 * notify recompute is dirty-mark-only (it reads nothing), so processing one
 * cannot mutate any `_s` mid-walk.
 */
export function propagateLazyDirty(subs: Set<() => void>): void {
  // Read the module counter into a local ONCE (V8 keeps it in a register across
  // the call — cheaper than the per-hop module read/write the naive form pays);
  // bump it ONCE per call (a whole subscriber level shares one depth), not per
  // subscriber. Split: computed notifies propagate the dirty flag (recurse
  // inline while shallow, else defer to the stack; an `{ equals }` notify
  // doesn't recurse further — it dirty-marks + enqueues its refresh);
  // everything else (effects, raw `subscribe()` listeners) enqueues into the
  // two-tier flush exactly as before.
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
    // Single-subscriber fast path — the deep-chain shape (each computed has
    // exactly one downstream). Avoids the extra `for..of` iterator step.
    if (subs.size === 1) {
      const sub = subs.values().next().value as () => void
      // `recompute` marks dirty (idempotent via its own `_dirty` guard — a
      // diamond re-visit early-returns) + enqueues its direct subscribers for
      // the drain.
      if (_recomputes.has(sub)) sub()
      else enqueuePendingNotification(sub)
    } else {
      for (const sub of subs) {
        if (_recomputes.has(sub)) sub()
        else enqueuePendingNotification(sub)
      }
    }
    _cascadeDepth = depth
  }
  // Drive the deferred stack ONLY from the outermost frame (depth 0) with work
  // pending — a re-entrant call from within the drain just leaves its pushes for
  // the active loop.
  if (depth === 0 && _lazyDirtyStack.length > 0 && !_lazyDirtyDraining) {
    _lazyDirtyDraining = true
    try {
      while (_lazyDirtyStack.length > 0) _lazyDirtyStack.pop()!()
    } finally {
      // Normal completion drains to empty; on an unexpected throw, discard the
      // partial stack so the next cascade starts clean (dirty-marking never
      // throws — this is belt-and-braces).
      _lazyDirtyStack.length = 0
      _lazyDirtyDraining = false
    }
  }
}

export function enqueuePendingNotification(notify: () => void): void {
  // Route based on callback kind. Computed NOTIFY recomputes (lazy AND
  // `{ equals }` — both dirty-mark-only + idempotent) run INLINE; everything
  // else is an effect-tier notify, queued into the intrusive-flag array (see
  // `runEffectPass` / the QueuedEffect field docs).
  if (_recomputes.has(notify)) {
    // Propagate dirtiness INLINE (idempotent via the computed's own `_dirty`
    // guard). A pure lazy-computed cascade (diamond, deep chain) resolves
    // entirely here, never enqueuing, so `drainQueuesLocked` isn't even
    // entered; an `{ equals }` notify books its refresh into tier-1 itself
    // (`enqueueEagerRefresh`). Effects reached downstream still enqueue
    // normally.
    notify()
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
    // Not yet queued for this pass (a fresh effect has `_vg` 0/undefined, never
    // equal to the monotonic `_passGen`; `_eq` 0/undefined is not Cur).
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
