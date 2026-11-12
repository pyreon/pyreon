/**
 * @pyreon/preact-compat/signals
 *
 * Preact Signals compatibility layer (`@preact/signals` style).
 * Wraps Pyreon's signal/computed in `{ value }` accessor objects.
 */

import type { Effect } from '@pyreon/reactivity'
import { useEffect, useMemo, useRef } from './hooks'
import {
  batch as pyreonBatch,
  computed as pyreonComputed,
  effect as pyreonEffect,
  runUntracked as pyreonRunUntracked,
  signal as pyreonSignal,
} from '@pyreon/reactivity'

// ─── Signal ──────────────────────────────────────────────────────────────────

export interface ReadonlySignal<T> {
  readonly value: T
  peek(): T
}

export interface WritableSignal<T> extends ReadonlySignal<T> {
  value: T
}

/**
 * Create a Preact-style signal with `.value` accessor.
 *
 * @example
 * const count = signal(0)
 * count.value++       // write
 * console.log(count.value)  // read (tracked)
 */
export function signal<T>(initial: T): WritableSignal<T> {
  const s = pyreonSignal<T>(initial)
  return {
    get value(): T {
      return s()
    },
    set value(v: T) {
      s.set(v)
    },
    peek(): T {
      return s.peek()
    },
  }
}

// ─── Computed ────────────────────────────────────────────────────────────────

/**
 * Create a Preact-style computed with `.value` accessor.
 *
 * @example
 * const doubled = computed(() => count.value * 2)
 * console.log(doubled.value)
 */
export function computed<T>(fn: () => T): ReadonlySignal<T> {
  const c = pyreonComputed(fn)
  return {
    get value(): T {
      return c()
    },
    peek(): T {
      return pyreonRunUntracked(() => c())
    },
  }
}

// ─── Effect ──────────────────────────────────────────────────────────────────

/**
 * Run a side-effect that auto-tracks signal reads.
 * Returns a dispose function.
 */
export function effect(fn: () => void | (() => void)): () => void {
  // Pyreon's effect() natively supports cleanup return values
  const e: Effect = pyreonEffect(fn)
  return () => {
    e.dispose()
  }
}

// ─── Batch ───────────────────────────────────────────────────────────────────

/**
 * Batch multiple signal writes into a single update.
 */
export { pyreonBatch as batch }

// ─── Component hooks: useSignal / useComputed / useSignalEffect ─────────────
//
// `@preact/signals` also exports these three hooks, and the compat alias
// points `@preact/signals` here, so `import { useSignal } from
// '@preact/signals'` under `compat: 'preact'` failed at import (#4366). They
// follow `@preact/signals`' own implementation: one signal / computed / effect
// per component instance, created on the first render, the computed and the
// effect always calling the LATEST callback, and the effect disposed on
// unmount.

/**
 * A signal owned by the component: created once, on the first render, from
 * `initial`; later renders return the same signal.
 *
 * @example
 * const count = useSignal(0)
 * return <button onClick={() => count.value++}>{count.value}</button>
 */
export function useSignal<T>(initial: T): WritableSignal<T> {
  return useMemo(() => signal(initial), [])
}

/**
 * A computed owned by the component. It is created once and always runs the
 * callback from the latest render, so it can read props through the closure.
 */
export function useComputed<T>(fn: () => T): ReadonlySignal<T> {
  const latest = useRef(fn)
  latest.current = fn
  return useMemo(() => computed(() => latest.current()), [])
}

/**
 * An effect owned by the component: it tracks the signals the callback reads,
 * re-runs when they change, runs the callback from the latest render, and is
 * disposed on unmount. A returned function is its cleanup.
 */
export function useSignalEffect(fn: () => void | (() => void)): void {
  const latest = useRef(fn)
  latest.current = fn
  useEffect(() => effect(() => latest.current()), [])
}
