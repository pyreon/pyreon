// Batch multiple signal updates into a single notification pass.
// Two-tier flush: computed recomputes drain first (within-pass Set-dedup),
// THEN effects drain (multi-pass with cross-pass re-fire support).
//
// Dev-mode invariant gate: see https://github.com/pyreon/pyreon/blob/main/packages/core/reactivity/src/tests/batch.test.ts
// for the property-based test that fuzzes random cascade graphs against this
// invariant. The build-time gate folds to dead code in production bundles.

import { defineCrossModuleState } from './cross-module-state'

const __DEV__ = process.env.NODE_ENV !== 'production'

// Two-tier queue design (full rationale below the state block):
//
// 1. **`pendingRecomputes`** — computed.recompute callbacks. Drained FIRST in
//    a cascading-iteration loop: cascading recomputes enqueued during a
//    drain land in the same Set (Set.add idempotency dedupes), iteration
//    visits added entries (JS Set iteration semantics), and the recompute
//    layer settles before any effect fires.
//
// 2. **`pendingEffects`** — effect.run callbacks. Drained SECOND, multi-pass.
//    Within a single pass, Set.add idempotency gives within-pass dedup
//    (diamond / multi-dep selector). Across passes (entries re-enqueued
//    AFTER being visited in the current pass — see `visitedThisPass`), they
//    fire AGAIN — needed for control flow that re-renders based on its own
//    dispatch (e.g. ErrorBoundary's handler calling `error.set(err)` during
//    the same run that mounted the throwing child). MAX_PASSES caps total
//    passes at 32 to prevent pathological infinite re-enqueue loops.
//
// **How a callback gets routed:** computed registers its `recompute` via
// `_markRecompute(fn)` at creation time. The internal `recomputes` WeakSet
// tracks them. `enqueuePendingNotification` checks the WeakSet to route.
//
// **Cross-module-instance safety:** all batch state lives on a single
// `defineCrossModuleState`-hosted object so a `signal.set()` resolved
// against one `@pyreon/reactivity` instance enqueues into the SAME queues
// that another instance's `batch()` is draining. Without this, two-instance
// scenarios silently lose enqueued notifications mid-batch.
interface BatchState {
  batchDepth: number
  pendingRecomputes: Set<() => void>
  pendingEffects: Set<() => void>
  nextEffectPass: Set<() => void>
  visitedThisPass: Set<() => void> | null
  recomputes: WeakSet<() => void>
}

const _state = defineCrossModuleState<BatchState>('pyreon-reactivity/batch-state', () => ({
  batchDepth: 0,
  pendingRecomputes: new Set(),
  pendingEffects: new Set(),
  nextEffectPass: new Set(),
  visitedThisPass: null,
  recomputes: new WeakSet(),
}))

const MAX_PASSES = 32

/**
 * Mark a callback as a computed recompute (called from computed.ts at
 * creation time). Routes future enqueues into the recompute queue so they
 * settle before any effects fire.
 */
export function _markRecompute(fn: () => void): void {
  _state.recomputes.add(fn)
}

export function batch(fn: () => void): void {
  _state.batchDepth++
  try {
    fn()
  } finally {
    _state.batchDepth--
    if (
      _state.batchDepth === 0 &&
      (_state.pendingRecomputes.size > 0 || _state.pendingEffects.size > 0)
    ) {
      _state.batchDepth = 1
      try {
        let effectPass = 0
        while (_state.pendingRecomputes.size > 0 || _state.pendingEffects.size > 0) {
          for (const r of _state.pendingRecomputes) r()
          _state.pendingRecomputes.clear()

          if (_state.pendingEffects.size > 0) {
            if (++effectPass > MAX_PASSES) {
              if (__DEV__) {
                const droppedCount = _state.pendingEffects.size
                const labels: string[] = []
                for (const notify of _state.pendingEffects) {
                  const label = (notify as { _label?: string })._label
                  if (label) labels.push(label)
                  if (labels.length >= 5) break
                }
                const labelHint = labels.length
                  ? ` Sample labels: ${labels.join(', ')}${droppedCount > labels.length ? `, …${droppedCount - labels.length} more` : ''}.`
                  : ''
                // oxlint-disable-next-line no-console
                console.warn(
                  '[pyreon] batch effect flush exceeded MAX_PASSES (32) — possible infinite re-enqueue loop. ' +
                    `${droppedCount} pending effects dropped.${labelHint} ` +
                    'Common cause: an effect that writes to a signal it also reads, without a guard. ' +
                    'See packages/core/reactivity/src/batch.ts for the multi-pass flush contract.',
                )
              }
              _state.pendingEffects.clear()
              _state.nextEffectPass.clear()
              break
            }
            _state.visitedThisPass = new Set<() => void>()
            for (const notify of _state.pendingEffects) {
              _state.visitedThisPass.add(notify)
              notify()
            }
            _state.pendingEffects.clear()
            for (const next of _state.nextEffectPass) _state.pendingEffects.add(next)
            _state.nextEffectPass.clear()
          }
        }
      } finally {
        _state.pendingRecomputes.clear()
        _state.pendingEffects.clear()
        _state.nextEffectPass.clear()
        _state.visitedThisPass = null
        _state.batchDepth = 0
      }
    }
  }
}

export function isBatching(): boolean {
  return _state.batchDepth > 0
}

export function enquePendingNotificationDeprecated(): void {
  // Kept as a comment placeholder — actual export is below. (Empty body to
  // keep this file's exports list stable across the refactor.)
}

export function enqueuePendingNotification(notify: () => void): void {
  // Route based on callback kind. Computed recomputes go to tier-1 queue,
  // effects to tier-2. Within tier 2, already-visited-this-pass entries
  // route to next-pass for cross-pass re-fire (ErrorBoundary's pattern).
  if (_state.recomputes.has(notify)) {
    _state.pendingRecomputes.add(notify)
  } else if (_state.visitedThisPass !== null && _state.visitedThisPass.has(notify)) {
    _state.nextEffectPass.add(notify)
  } else {
    _state.pendingEffects.add(notify)
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
