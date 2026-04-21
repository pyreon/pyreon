import { computed } from '@pyreon/reactivity'
import type { KeyOf, ReadableSignal } from './types'
import { isSignal, resolveKey } from './types'

// ─── Helpers ────────────────────────────────────────────────────────────────

function reactive<TIn, TOut>(
  source: TIn,
  fn: (val: any) => TOut,
): TIn extends ReadableSignal<any> ? ReturnType<typeof computed<TOut>> : TOut {
  if (isSignal(source)) {
    return computed(() => fn((source as ReadableSignal<any>)())) as any
  }
  return fn(source) as any
}

// ─── Collection transforms ──────────────────────────────────────────────────

/** Filter items by predicate. Signal in → Computed out. */
export function filter<T>(
  source: ReadableSignal<T[]>,
  predicate: (item: T, index: number) => boolean,
): ReturnType<typeof computed<T[]>>
export function filter<T>(source: T[], predicate: (item: T, index: number) => boolean): T[]
export function filter<T>(
  source: ReadableSignal<T[]> | T[],
  predicate: (item: T, index: number) => boolean,
): any {
  return reactive(source, (arr: T[]) => arr.filter(predicate))
}

/** Map items to a new type. */
export function map<T, U>(
  source: ReadableSignal<T[]>,
  fn: (item: T, index: number) => U,
): ReturnType<typeof computed<U[]>>
export function map<T, U>(source: T[], fn: (item: T, index: number) => U): U[]
export function map<T, U>(
  source: ReadableSignal<T[]> | T[],
  fn: (item: T, index: number) => U,
): any {
  return reactive(source, (arr: T[]) => arr.map(fn))
}

/** Sort items by key or comparator. */
export function sortBy<T>(
  source: ReadableSignal<T[]>,
  key: KeyOf<T>,
): ReturnType<typeof computed<T[]>>
export function sortBy<T>(source: T[], key: KeyOf<T>): T[]
export function sortBy<T>(source: ReadableSignal<T[]> | T[], key: KeyOf<T>): any {
  const getKey = resolveKey(key)
  return reactive(source, (arr: T[]) =>
    [...arr].sort((a, b) => {
      const ka = getKey(a)
      const kb = getKey(b)
      return ka < kb ? -1 : ka > kb ? 1 : 0
    }),
  )
}

/** Group items by key. Returns Record<string, T[]>. */
export function groupBy<T>(
  source: ReadableSignal<T[]>,
  key: KeyOf<T>,
): ReturnType<typeof computed<Record<string, T[]>>>
export function groupBy<T>(source: T[], key: KeyOf<T>): Record<string, T[]>
export function groupBy<T>(source: ReadableSignal<T[]> | T[], key: KeyOf<T>): any {
  const getKey = resolveKey(key)
  return reactive(source, (arr: T[]) => {
    const result: Record<string, T[]> = {}
    for (const item of arr) {
      const k = String(getKey(item))
      let group = result[k]
      if (!group) {
        group = []
        result[k] = group
      }
      group.push(item)
    }
    return result
  })
}

/** Index items by key. Returns Record<string, T> (last wins on collision). */
export function keyBy<T>(
  source: ReadableSignal<T[]>,
  key: KeyOf<T>,
): ReturnType<typeof computed<Record<string, T>>>
export function keyBy<T>(source: T[], key: KeyOf<T>): Record<string, T>
export function keyBy<T>(source: ReadableSignal<T[]> | T[], key: KeyOf<T>): any {
  const getKey = resolveKey(key)
  return reactive(source, (arr: T[]) => {
    const result: Record<string, T> = {}
    for (const item of arr) result[String(getKey(item))] = item
    return result
  })
}

/** Deduplicate items by key. */
export function uniqBy<T>(
  source: ReadableSignal<T[]>,
  key: KeyOf<T>,
): ReturnType<typeof computed<T[]>>
export function uniqBy<T>(source: T[], key: KeyOf<T>): T[]
export function uniqBy<T>(source: ReadableSignal<T[]> | T[], key: KeyOf<T>): any {
  const getKey = resolveKey(key)
  return reactive(source, (arr: T[]) => {
    const seen = new Set<string | number>()
    return arr.filter((item) => {
      const k = getKey(item)
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  })
}

/** Take the first n items. */
export function take<T>(source: ReadableSignal<T[]>, n: number): ReturnType<typeof computed<T[]>>
export function take<T>(source: T[], n: number): T[]
export function take<T>(source: ReadableSignal<T[]> | T[], n: number): any {
  return reactive(source, (arr: T[]) => arr.slice(0, n))
}

/** Split into chunks of given size. */
export function chunk<T>(
  source: ReadableSignal<T[]>,
  size: number,
): ReturnType<typeof computed<T[][]>>
export function chunk<T>(source: T[], size: number): T[][]
export function chunk<T>(source: ReadableSignal<T[]> | T[], size: number): any {
  return reactive(source, (arr: T[]) => {
    const result: T[][] = []
    for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size))
    return result
  })
}

/** Flatten one level of nesting. */
export function flatten<T>(source: ReadableSignal<T[][]>): ReturnType<typeof computed<T[]>>
export function flatten<T>(source: T[][]): T[]
export function flatten<T>(source: ReadableSignal<T[][]> | T[][]): any {
  return reactive(source, (arr: T[][]) => arr.flat())
}

/** Find the first item matching a predicate. */
export function find<T>(
  source: ReadableSignal<T[]>,
  predicate: (item: T) => boolean,
): ReturnType<typeof computed<T | undefined>>
export function find<T>(source: T[], predicate: (item: T) => boolean): T | undefined
export function find<T>(source: ReadableSignal<T[]> | T[], predicate: (item: T) => boolean): any {
  return reactive(source, (arr: T[]) => arr.find(predicate))
}

/** Skip the first n items. */
export function skip<T>(source: ReadableSignal<T[]>, n: number): ReturnType<typeof computed<T[]>>
export function skip<T>(source: T[], n: number): T[]
export function skip<T>(source: ReadableSignal<T[]> | T[], n: number): any {
  return reactive(source, (arr: T[]) => arr.slice(n))
}

/** Take the last n items. */
export function last<T>(source: ReadableSignal<T[]>, n: number): ReturnType<typeof computed<T[]>>
export function last<T>(source: T[], n: number): T[]
export function last<T>(source: ReadableSignal<T[]> | T[], n: number): any {
  return reactive(source, (arr: T[]) => arr.slice(-n))
}

/**
 * Get the first element of an array.
 *
 * @example
 * ```ts
 * const items = signal([1, 2, 3])
 * const head = rx.first(items) // Computed<number | undefined>
 * ```
 */
export function first<T>(
  source: ReadableSignal<T[]>,
): ReturnType<typeof computed<T | undefined>>
export function first<T>(source: T[]): T | undefined
export function first<T>(source: ReadableSignal<T[]> | T[]): any {
  return reactive(source, (arr: T[]) => arr[0])
}

/**
 * Remove all falsy values (null, undefined, false, 0, '').
 *
 * @example
 * ```ts
 * compact([0, 1, null, 2, '', 3, false]) // [1, 2, 3]
 * ```
 */
export function compact<T>(
  source: ReadableSignal<(T | null | undefined | false | 0 | '')[]>,
): ReturnType<typeof computed<T[]>>
export function compact<T>(source: (T | null | undefined | false | 0 | '')[]): T[]
export function compact<T>(
  source: ReadableSignal<(T | null | undefined | false | 0 | '')[]> | (T | null | undefined | false | 0 | '')[],
): any {
  return reactive(source, (arr: any[]) => arr.filter(Boolean))
}

/**
 * Reverse an array (returns a new copy).
 *
 * @example
 * ```ts
 * reverse([1, 2, 3]) // [3, 2, 1]
 * ```
 */
export function reverse<T>(source: ReadableSignal<T[]>): ReturnType<typeof computed<T[]>>
export function reverse<T>(source: T[]): T[]
export function reverse<T>(source: ReadableSignal<T[]> | T[]): any {
  return reactive(source, (arr: T[]) => [...arr].reverse())
}

/**
 * Split an array into two groups: items that match the predicate and items that don't.
 *
 * @example
 * ```ts
 * const [even, odd] = partition([1, 2, 3, 4], n => n % 2 === 0)
 * // even: [2, 4], odd: [1, 3]
 * ```
 */
export function partition<T>(
  source: ReadableSignal<T[]>,
  predicate: (item: T, index: number) => boolean,
): ReturnType<typeof computed<[T[], T[]]>>
export function partition<T>(
  source: T[],
  predicate: (item: T, index: number) => boolean,
): [T[], T[]]
export function partition<T>(
  source: ReadableSignal<T[]> | T[],
  predicate: (item: T, index: number) => boolean,
): any {
  return reactive(source, (arr: T[]) => {
    const pass: T[] = []
    const fail: T[] = []
    for (let i = 0; i < arr.length; i++) {
      ;(predicate(arr[i] as T, i) ? pass : fail).push(arr[i] as T)
    }
    return [pass, fail] as [T[], T[]]
  })
}

/**
 * Take items from the start while the predicate returns true.
 * Stops at the first item that doesn't match.
 *
 * @example
 * ```ts
 * takeWhile([1, 2, 3, 1, 2], n => n < 3) // [1, 2]
 * ```
 */
export function takeWhile<T>(
  source: ReadableSignal<T[]>,
  predicate: (item: T, index: number) => boolean,
): ReturnType<typeof computed<T[]>>
export function takeWhile<T>(
  source: T[],
  predicate: (item: T, index: number) => boolean,
): T[]
export function takeWhile<T>(
  source: ReadableSignal<T[]> | T[],
  predicate: (item: T, index: number) => boolean,
): any {
  return reactive(source, (arr: T[]) => {
    const result: T[] = []
    for (let i = 0; i < arr.length; i++) {
      if (!predicate(arr[i] as T, i)) break
      result.push(arr[i] as T)
    }
    return result
  })
}

/**
 * Skip items from the start while the predicate returns true.
 * Returns remaining items from the first non-matching item.
 *
 * @example
 * ```ts
 * dropWhile([1, 2, 3, 1, 2], n => n < 3) // [3, 1, 2]
 * ```
 */
export function dropWhile<T>(
  source: ReadableSignal<T[]>,
  predicate: (item: T, index: number) => boolean,
): ReturnType<typeof computed<T[]>>
export function dropWhile<T>(
  source: T[],
  predicate: (item: T, index: number) => boolean,
): T[]
export function dropWhile<T>(
  source: ReadableSignal<T[]> | T[],
  predicate: (item: T, index: number) => boolean,
): any {
  return reactive(source, (arr: T[]) => {
    let i = 0
    while (i < arr.length && predicate(arr[i] as T, i)) i++
    return arr.slice(i)
  })
}

/**
 * Deduplicate primitive values using Set.
 * For objects, use `uniqBy` with a key function instead.
 *
 * @example
 * ```ts
 * unique([1, 2, 2, 3, 1]) // [1, 2, 3]
 * ```
 */
export function unique<T>(source: ReadableSignal<T[]>): ReturnType<typeof computed<T[]>>
export function unique<T>(source: T[]): T[]
export function unique<T>(source: ReadableSignal<T[]> | T[]): any {
  return reactive(source, (arr: T[]) => [...new Set(arr)])
}

/**
 * Pick n random items from the array (Fisher-Yates partial shuffle).
 * Returns all items if n >= array length.
 *
 * @example
 * ```ts
 * sample([1, 2, 3, 4, 5], 2) // e.g. [3, 1]
 * ```
 */
export function sample<T>(source: ReadableSignal<T[]>, n: number): ReturnType<typeof computed<T[]>>
export function sample<T>(source: T[], n: number): T[]
export function sample<T>(source: ReadableSignal<T[]> | T[], n: number): any {
  return reactive(source, (arr: T[]) => {
    const copy = [...arr]
    const count = Math.min(n, copy.length)
    // Fisher-Yates partial shuffle — only shuffle the first `count` positions
    for (let i = 0; i < count; i++) {
      const j = i + Math.floor(Math.random() * (copy.length - i))
      const tmp = copy[i]
      copy[i] = copy[j] as T
      copy[j] = tmp as T
    }
    return copy.slice(0, count)
  })
}

/** Map over values of a Record. Useful after groupBy. */
export function mapValues<T, U>(
  source: ReadableSignal<Record<string, T>>,
  fn: (value: T, key: string) => U,
): ReturnType<typeof computed<Record<string, U>>>
export function mapValues<T, U>(
  source: Record<string, T>,
  fn: (value: T, key: string) => U,
): Record<string, U>
export function mapValues<T, U>(
  source: ReadableSignal<Record<string, T>> | Record<string, T>,
  fn: (value: T, key: string) => U,
): any {
  return reactive(source, (obj: Record<string, T>) => {
    const result: Record<string, U> = {}
    for (const key of Object.keys(obj)) result[key] = fn(obj[key] as T, key)
    return result
  })
}
