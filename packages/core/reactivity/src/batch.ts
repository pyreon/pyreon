// Batch multiple signal updates into a single notification pass.
// Two-tier flush: computed recomputes drain first (within-pass Set-dedup),
// THEN effects drain (multi-pass with cross-pass re-fire support).
//
// Dev-mode invariant gate: see https://github.com/pyreon/pyreon/blob/main/packages/core/reactivity/src/tests/batch.test.ts
// for the property-based test that fuzzes random cascade graphs against this
// invariant. The build-time gate folds to dead code in production bundles.

let batchDepth = 0

// Two-tier queue design:
//
// 1. **`pendingRecomputes`** — computed.recompute callbacks. Drained FIRST in
//    a cascading-iteration loop: cascading recomputes enqueued during a
//    drain land in the same Set (Set.add idempotency dedupes), iteration
//    visits added entries (JS Set iteration semantics), and the recompute
//    layer settles before any effect fires. This guarantees effects always
//    read fully-propagated computed values.
//
// 2. **`pendingEffects`** — effect.run callbacks. Drained SECOND, multi-pass.
//    Within a single pass, Set.add idempotency gives us within-pass dedup
//    (diamond / multi-dep selector). Across passes (entries re-enqueued
//    AFTER being visited in the current pass — see `_visitedThisPass`), they
//    fire AGAIN — needed for control flow that re-renders based on its own
//    dispatch (e.g. ErrorBoundary's handler calling `error.set(err)` during
//    the same run that mounted the throwing child). MAX_PASSES caps total
//    passes at 32 to prevent pathological infinite re-enqueue loops.
//
// **Why two tiers, not one Set:**
//   - Single-Set iteration (the prior design) worked for shallow cascades
//     because the cascading recompute → effect re-enqueue happened BEFORE
//     iteration reached the effect. For deep cascades (3+ hops), iteration
//     reached the effect (with its stale upstream value) BEFORE the cascade
//     finished propagating. Effect read stale values; subsequent cascade
//     re-enqueues were dropped by Set.add idempotency.
//   - Splitting recomputes from effects fixes this: all computed recomputes
//     settle before any effect runs. The cascade-asymmetry contract is
//     preserved (effects still fire once per batched change), AND
//     deep-cascade correctness is added (effects always read settled
//     values).
//   - Multi-pass effect drain unblocks ErrorBoundary's "re-fire after
//     dispatching from inside own run" pattern without breaking the
//     single-fire contract for non-self-dispatching effects.
//
// **How a callback gets routed:** computed registers its `recompute` via
// `_markRecompute(fn)` at creation time. The internal `_recomputes` WeakSet
// tracks them. `enqueuePendingNotification` checks the WeakSet to route.
const pendingRecomputes = new Set<() => void>()
const pendingEffects = new Set<() => void>()
const _nextEffectPass = new Set<() => void>()
let _visitedThisPass: Set<() => void> | null = null
// Persistent visited Set reused across passes + flushes (cleared, never
// reallocated) — `_visitedThisPass` points at it while a pass is running. A
// batched single-subscriber notify previously allocated a fresh `Set` per pass.
const _visitedScratch = new Set<() => void>()
const _recomputes = new WeakSet<() => void>()
const MAX_PASSES = 32

/**
 * Mark a callback as a computed recompute (called from computed.ts at
 * creation time). Routes future enqueues into the recompute queue so they
 * settle before any effects fire.
 */
export function _markRecompute(fn: () => void): void {
  _recomputes.add(fn)
}

export function batch(fn: () => void): void {
  batchDepth++
  try {
    fn()
  } finally {
    batchDepth--
    if (batchDepth === 0 && (pendingRecomputes.size > 0 || pendingEffects.size > 0)) {
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
  if (batchDepth === 0 && (pendingRecomputes.size > 0 || pendingEffects.size > 0)) {
    batchDepth = 1
    drainQueuesLocked()
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
    // multi-pass loop below pays an outer-loop check + a recompute-tier drain +
    // (previously) a per-pass `new Set()` even when none of that is needed.
    //
    // This runs exactly ONE effect pass with the reused visited Set and returns
    // if it produced no follow-up work. It IS pass 1 (`effectPass = 1`), so a
    // cascade (an effect that enqueues a recompute, a new effect, or re-enqueues
    // itself) falls through to the general loop as pass 2+ — IDENTICAL run-counts
    // and MAX_PASSES semantics to the original. Equivalence rests on: the fast
    // pass uses the same `_visitedThisPass`-routing as a general pass (so a
    // same-pass re-enqueue still routes to `_nextEffectPass`); diamond dedup is
    // the same `Set.add` idempotency; and skipping tier-1 here is sound because
    // we gate on `pendingRecomputes.size === 0`.
    if (pendingRecomputes.size === 0 && pendingEffects.size > 0) {
      effectPass = 1
      _visitedScratch.clear()
      _visitedThisPass = _visitedScratch
      for (const notify of pendingEffects) {
        _visitedScratch.add(notify)
        notify()
      }
      pendingEffects.clear()
      // Promote a same-pass re-enqueue (self-re-fire) to the pending queue,
      // mirroring the general loop's end-of-pass promotion.
      if (_nextEffectPass.size > 0) {
        for (const next of _nextEffectPass) pendingEffects.add(next)
        _nextEffectPass.clear()
      }
      // No follow-up work → done in one pass.
      if (pendingRecomputes.size === 0 && pendingEffects.size === 0) {
        return
      }
      // else: a cascade enqueued recomputes/effects → continue with the general
      // multi-pass loop below (from pass 2).
    }

    while (pendingRecomputes.size > 0 || pendingEffects.size > 0) {
      // Tier 1: drain all recomputes via cascading iteration. Set
      // semantics visit entries added during iteration; Set.add
      // idempotency dedupes diamond cascades. Recomputes converge by
      // `equals` short-circuit (computedWithEquals returns early when
      // value is unchanged) and computedLazy's `if (dirty) return`
      // guard prevents re-fire.
      for (const r of pendingRecomputes) r()
      pendingRecomputes.clear()

      // Tier 2: drain ONE pass of effects in multi-pass mode. Within-
      // pass dedup preserved by Set.add idempotency on entries not yet
      // visited this pass. Cross-pass re-fire enabled by routing
      // already-visited entries to `_nextEffectPass` (handled in
      // `enqueuePendingNotification`). After the pass, loop back to
      // tier 1 to drain any recomputes the effects enqueued.
      if (pendingEffects.size > 0) {
        if (++effectPass > MAX_PASSES) {
          if (process.env.NODE_ENV !== 'production') {
            // Surface labels of dropped effects when available — helps
            // identify the offending effect in a real app. Falls back to
            // bare count for anonymous effects.
            const droppedCount = pendingEffects.size
            const labels: string[] = []
            /* v8 ignore start — forward-looking diagnostic: no effect notify
               currently carries `_label`, so the push/break/labelHint branches
               are unreachable until a future PR populates the field. */
            for (const notify of pendingEffects) {
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
          // Drop the queue so subsequent batches start clean — without
          // this, the next batch would re-encounter the offending effect
          // immediately on its first pass and trip MAX_PASSES instantly,
          // making the original error harder to diagnose.
          pendingEffects.clear()
          _nextEffectPass.clear()
          break
        }
        _visitedScratch.clear()
        _visitedThisPass = _visitedScratch
        for (const notify of pendingEffects) {
          _visitedScratch.add(notify)
          notify()
        }
        // Promote next-pass entries to pending for the next iteration.
        pendingEffects.clear()
        for (const next of _nextEffectPass) pendingEffects.add(next)
        _nextEffectPass.clear()
      }
    }
  } finally {
    // Clear ALWAYS — even if a notify threw mid-iteration. Without
    // this, the unflushed remainder leaks into the next batch and
    // refires. Effects wrap their callbacks in try/catch internally
    // so this is rarely reachable in practice, but raw signal
    // subscribers (signal.subscribe) and lower-level consumers can
    // throw straight through, and a future refactor that swallows
    // less aggressively would silently regress without this guard.
    pendingRecomputes.clear()
    pendingEffects.clear()
    _nextEffectPass.clear()
    _visitedScratch.clear()
    _visitedThisPass = null
    batchDepth = 0
  }
}

export function isBatching(): boolean {
  return batchDepth > 0
}

export function enqueuePendingNotification(notify: () => void): void {
  // Route based on callback kind. Computed recomputes go to tier-1 queue,
  // effects to tier-2. Within tier 2, already-visited-this-pass entries
  // route to next-pass for cross-pass re-fire (ErrorBoundary's pattern).
  if (_recomputes.has(notify)) {
    pendingRecomputes.add(notify)
  } else if (_visitedThisPass !== null && _visitedThisPass.has(notify)) {
    _nextEffectPass.add(notify)
  } else {
    pendingEffects.add(notify)
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
