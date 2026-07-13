import { computed } from '@pyreon/reactivity'
import type { ReadableSignal } from './types'
import { isSignal } from './types'


// Dev-time counter sink — see packages/internals/perf-harness for contract.
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

/**
 * Pipe a signal through a chain of transform functions.
 * Each transform receives the resolved value (not the signal) and returns a new value.
 * The entire chain is wrapped in a single `computed()`.
 *
 * @example
 * ```ts
 * const topRisks = rx.pipe(
 *   findings,
 *   (items) => items.filter(f => f.severity === "critical"),
 *   (items) => items.sort((a, b) => b.score - a.score),
 *   (items) => items.slice(0, 10),
 * )
 * // topRisks() → reactive, type-safe
 * ```
 */
export function pipe<A, B>(
  source: ReadableSignal<A>,
  f1: (a: A) => B,
): ReturnType<typeof computed<B>>
export function pipe<A, B, C>(
  source: ReadableSignal<A>,
  f1: (a: A) => B,
  f2: (b: B) => C,
): ReturnType<typeof computed<C>>
export function pipe<A, B, C, D>(
  source: ReadableSignal<A>,
  f1: (a: A) => B,
  f2: (b: B) => C,
  f3: (c: C) => D,
): ReturnType<typeof computed<D>>
export function pipe<A, B, C, D, E>(
  source: ReadableSignal<A>,
  f1: (a: A) => B,
  f2: (b: B) => C,
  f3: (c: C) => D,
  f4: (d: D) => E,
): ReturnType<typeof computed<E>>
export function pipe<A, B, C, D, E, F>(
  source: ReadableSignal<A>,
  f1: (a: A) => B,
  f2: (b: B) => C,
  f3: (c: C) => D,
  f4: (d: D) => E,
  f5: (e: E) => F,
): ReturnType<typeof computed<F>>
export function pipe<A, B, C, D, E, F, G>(
  source: ReadableSignal<A>,
  f1: (a: A) => B,
  f2: (b: B) => C,
  f3: (c: C) => D,
  f4: (d: D) => E,
  f5: (e: E) => F,
  f6: (f: F) => G,
): ReturnType<typeof computed<G>>
export function pipe<A, B, C, D, E, F, G, H>(
  source: ReadableSignal<A>,
  f1: (a: A) => B,
  f2: (b: B) => C,
  f3: (c: C) => D,
  f4: (d: D) => E,
  f5: (e: E) => F,
  f6: (f: F) => G,
  f7: (g: G) => H,
): ReturnType<typeof computed<H>>
// Plain value overloads
export function pipe<A, B>(source: A, f1: (a: A) => B): B
export function pipe<A, B, C>(source: A, f1: (a: A) => B, f2: (b: B) => C): C
export function pipe<A, B, C, D>(source: A, f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D): D
export function pipe<A, B, C, D, E>(
  source: A,
  f1: (a: A) => B,
  f2: (b: B) => C,
  f3: (c: C) => D,
  f4: (d: D) => E,
): E
export function pipe<A, B, C, D, E, F>(
  source: A,
  f1: (a: A) => B,
  f2: (b: B) => C,
  f3: (c: C) => D,
  f4: (d: D) => E,
  f5: (e: E) => F,
): F
export function pipe<A, B, C, D, E, F, G>(
  source: A,
  f1: (a: A) => B,
  f2: (b: B) => C,
  f3: (c: C) => D,
  f4: (d: D) => E,
  f5: (e: E) => F,
  f6: (f: F) => G,
): G
export function pipe<A, B, C, D, E, F, G, H>(
  source: A,
  f1: (a: A) => B,
  f2: (b: B) => C,
  f3: (c: C) => D,
  f4: (d: D) => E,
  f5: (e: E) => F,
  f6: (f: F) => G,
  f7: (g: G) => H,
): H
export function pipe(source: any, ...fns: Array<(v: any) => any>): any {
  // One emit per pipe() call regardless of chain depth — pipe collapses
  // the entire chain into ONE computed (not one per step). The
  // structural win of pipe vs separate-call composition is "1 computed
  // vs N computeds" — the diff between this counter and
  // `rx.transform.signal` summed across the same chain proves it.
  if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('rx.pipe')
  if (isSignal(source)) {
    return computed(() => {
      let val = (source as ReadableSignal<any>)()
      for (const fn of fns) val = fn(val)
      return val
    })
  }
  let val = source
  for (const fn of fns) val = fn(val)
  return val
}
