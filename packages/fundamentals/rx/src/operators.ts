import { computed, effect, signal } from '@pyreon/reactivity'
import type { ReadableSignal } from './types'
import { isSignal } from './types'

/**
 * Distinct — skip consecutive duplicate values from a signal.
 * Uses `Object.is` by default, or a custom equality function.
 */
export function distinct<T>(
  source: ReadableSignal<T>,
  equals: (a: T, b: T) => boolean = Object.is,
): ReadableSignal<T> {
  const result = signal(source())

  effect(() => {
    const val = source()
    if (!equals(val, result.peek())) {
      result.set(val)
    }
  })

  return result
}

/**
 * Scan — running accumulator over signal changes.
 * Like Array.reduce but emits the accumulated value on each source change.
 *
 * @example
 * ```ts
 * const clicks = signal(0)
 * const total = rx.scan(clicks, (acc, val) => acc + val, 0)
 * // clicks: 1 → total: 1
 * // clicks: 3 → total: 4
 * // clicks: 2 → total: 6
 * ```
 */
export function scan<T, U>(
  source: ReadableSignal<T>,
  reducer: (acc: U, value: T) => U,
  initial: U,
): ReadableSignal<U> {
  const result = signal(initial)

  effect(() => {
    const val = source()
    result.set(reducer(result.peek(), val))
  })

  return result
}

/**
 * Combine multiple signals into a single computed value.
 *
 * @example
 * ```ts
 * const fullName = rx.combine(firstName, lastName, (f, l) => `${f} ${l}`)
 * ```
 */
export function combine<A, B, R>(
  a: ReadableSignal<A>,
  b: ReadableSignal<B>,
  fn: (a: A, b: B) => R,
): ReturnType<typeof computed<R>>
export function combine<A, B, C, R>(
  a: ReadableSignal<A>,
  b: ReadableSignal<B>,
  c: ReadableSignal<C>,
  fn: (a: A, b: B, c: C) => R,
): ReturnType<typeof computed<R>>
export function combine(...args: any[]): any {
  const fn = args[args.length - 1] as (...vals: any[]) => any
  const sources = args.slice(0, -1) as ReadableSignal<any>[]
  return computed(() => fn(...sources.map((s) => s())))
}

/**
 * Zip multiple arrays element-by-element. Truncates to the shortest array.
 * Signal inputs produce a reactive Computed that updates when any source changes.
 *
 * @example
 * ```ts
 * const names = signal(['Alice', 'Bob'])
 * const ages = signal([30, 25])
 * const pairs = rx.zip(names, ages) // Computed<[string, number][]>
 * // [['Alice', 30], ['Bob', 25]]
 * ```
 */
export function zip<A, B>(
  a: ReadableSignal<A[]> | A[],
  b: ReadableSignal<B[]> | B[],
): ReturnType<typeof computed<[A, B][]>>
export function zip<A, B>(a: A[], b: B[]): [A, B][]
export function zip<A, B, C>(
  a: ReadableSignal<A[]> | A[],
  b: ReadableSignal<B[]> | B[],
  c: ReadableSignal<C[]> | C[],
): ReturnType<typeof computed<[A, B, C][]>>
export function zip<A, B, C>(a: A[], b: B[], c: C[]): [A, B, C][]
export function zip(...sources: any[]): any {
  const hasSignal = sources.some(isSignal)
  const resolve = () => {
    const arrays = sources.map((s) => (isSignal(s) ? (s as ReadableSignal<any>)() : s)) as any[][]
    const minLen = Math.min(...arrays.map((a) => a.length))
    const result: any[][] = []
    for (let i = 0; i < minLen; i++) {
      result.push(arrays.map((a) => a[i]))
    }
    return result
  }
  return hasSignal ? computed(resolve) : resolve()
}

/**
 * Concatenate multiple arrays into one. Signal inputs produce a reactive Computed.
 *
 * @example
 * ```ts
 * const a = signal([1, 2])
 * const b = signal([3, 4])
 * const all = rx.merge(a, b) // Computed<number[]> → [1, 2, 3, 4]
 * ```
 */
export function merge<T>(a: ReadableSignal<T[]>, ...rest: (ReadableSignal<T[]> | T[])[]): ReturnType<typeof computed<T[]>>
export function merge<T>(...sources: T[][]): T[]
export function merge<T>(...sources: any[]): any {
  const hasSignal = sources.some(isSignal)
  const resolve = () => {
    const arrays = sources.map((s) => (isSignal(s) ? (s as ReadableSignal<any>)() : s)) as T[][]
    return arrays.flat()
  }
  return hasSignal ? computed(resolve) : resolve()
}
