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
// 1. **Recomputes settle first.** A LAZY computed recompute (the default) is
//    dirty-mark-only + idempotent, so it propagates INLINE during the write's
//    notify phase (see `_lazyRecomputes` / `enqueuePendingNotification`) — a
//    pure-computed cascade never touches a queue. An EAGER (`{ equals }`)
//    computed recompute re-evaluates + pushes a value, so it goes to the
//    tier-1 `pendingRecomputes` Set, drained FIRST in a cascading-iteration
//    loop (Set.add idempotency dedupes; iteration visits entries added during
//    the drain). Either way, all computed values are settled before any effect
//    fires — so effects always read fully-propagated values.
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
// registers its `recompute` via `_markRecompute` (eager) / `_markLazyRecompute`
// (lazy) at creation; the `_recomputes` WeakSet catches recomputes first (a
// miss = an effect → the cheap fan-out path), then `_lazyRecomputes` splits
// lazy (inline) from eager (tier-1 queue).
const pendingRecomputes = new Set<() => void>()

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
// All computed recomputes (lazy + eager). Checked FIRST in the enqueue router:
// a miss (`false`) means an EFFECT (or raw subscribe listener / direct updater),
// which is the wide-fan-out hot path — so this must be the CHEAP, single lookup
// there. `WeakSet.has` on an absent key is measurably faster than `WeakMap.get`
// returning `undefined` (an A/B that used one `WeakMap<fn, kind>` here un-flipped
// both the fan-out and batch-50 wins), so the lazy/eager split is a SECOND
// `WeakSet.has` (`_lazyRecomputes`) that only recomputes — never effects — pay.
const _recomputes = new WeakSet<() => void>()
// LAZY computed recomputes (subset of `_recomputes`). A lazy recompute only
// marks its computed dirty + propagates dirtiness to ITS subscribers — it does
// no re-evaluation itself (that happens on the next READ, pull-style). So it is
// idempotent (guarded by the computed's `_dirty` flag) and safe to run INLINE
// during notification, exactly like Preact's write-time dirty-marking traversal.
// Running it inline (a DFS through the dependency graph) means a pure-computed
// cascade — a diamond `a→{b,c}→d`, a deep chain — NEVER touches the pending
// queues: everything settles during the write's notify phase and `drainQueues`
// is never even entered (both queues empty at `closeInlineBatch`). Only EAGER
// (`{ equals }`) recomputes — which push a re-evaluated value and must settle
// before effects — stay in the tier-1 queue; effects stay in tier-2.
const _lazyRecomputes = new WeakSet<() => void>()
const MAX_PASSES = 32

/**
 * Mark a callback as an EAGER computed recompute (called from
 * `computedWithEquals` at creation time). Routes future enqueues into the
 * tier-1 recompute queue so they re-evaluate + settle before any effects fire.
 */
export function _markRecompute(fn: () => void): void {
  _recomputes.add(fn)
}

/**
 * Mark a callback as a LAZY computed recompute (called from `computedLazy`).
 * Lazy recomputes are dirty-mark-only + idempotent, so `enqueuePendingNotification`
 * runs them INLINE (see `_lazyRecomputes` above) — a pure-computed cascade never
 * enters the pending queues. Added to `_recomputes` too so the enqueue router's
 * first check (`_recomputes.has`) still catches it before the effect-tier path.
 */
export function _markLazyRecompute(fn: () => void): void {
  _recomputes.add(fn)
  _lazyRecomputes.add(fn)
}

export function batch(fn: () => void): void {
  batchDepth++
  try {
    fn()
  } finally {
    batchDepth--
    if (batchDepth === 0 && (pendingRecomputes.size > 0 || curEffects.length > 0)) {
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
  if (batchDepth === 0 && (pendingRecomputes.size > 0 || curEffects.length > 0)) {
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
    // signal whose subscribers include lazy `computed.recompute`s — those
    // get enqueued into pendingRecomputes mid-effect, and we need to
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
    // sound because we gate on `pendingRecomputes.size === 0`.
    if (pendingRecomputes.size === 0 && curEffects.length > 0) {
      effectPass = 1
      runEffectPass()
      // No follow-up work → done in one pass.
      if (pendingRecomputes.size === 0 && curEffects.length === 0) {
        return
      }
      // else: a cascade enqueued recomputes/effects → continue with the general
      // multi-pass loop below (from pass 2).
    }

    while (pendingRecomputes.size > 0 || curEffects.length > 0) {
      // Tier 1: drain all recomputes via cascading iteration. Set
      // semantics visit entries added during iteration; Set.add
      // idempotency dedupes diamond cascades. Recomputes converge by
      // `equals` short-circuit (computedWithEquals returns early when
      // value is unchanged) and computedLazy's `if (dirty) return`
      // guard prevents re-fire.
      for (const r of pendingRecomputes) r()
      pendingRecomputes.clear()

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
    pendingRecomputes.clear()
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

export function enqueuePendingNotification(notify: () => void): void {
  // Route based on callback kind. Computed recomputes go to the tier-1 Set;
  // everything else is an effect-tier notify, queued into the intrusive-flag
  // array (see `runEffectPass` / the QueuedEffect field docs).
  if (_recomputes.has(notify)) {
    if (_lazyRecomputes.has(notify)) {
      // Lazy recompute — propagate dirtiness INLINE (idempotent via the
      // computed's own `_dirty` guard). A pure-computed cascade (diamond, deep
      // chain) resolves entirely here, never enqueuing, so `drainQueuesLocked`
      // isn't even entered. Effects/eager-computeds it reaches downstream still
      // enqueue normally (they're not in `_lazyRecomputes`).
      notify()
      return
    }
    // Eager (`{ equals }`) recompute → tier-1 queue.
    pendingRecomputes.add(notify)
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
