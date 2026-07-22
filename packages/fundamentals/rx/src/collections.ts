import { computed } from '@pyreon/reactivity'
import type { KeyOf, ReadableSignal } from './types'
import { isSignal, resolveKey } from './types'


// Dev-time counter sink — see packages/internals/perf-harness for contract.
// Globalthis sink (no @pyreon/perf-harness import) so this file stays
// publishable without a dev-only dep, and the counter strings + guard
// tree-shake out at consumer build time.
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

// ─── Helpers ────────────────────────────────────────────────────────────────

function reactive<TIn, TOut>(
  source: TIn,
  fn: (val: any) => TOut,
): TIn extends ReadableSignal<any> ? ReturnType<typeof computed<TOut>> : TOut {
  if (isSignal(source)) {
    // Signal input → allocate a tracked computed. Counter pairs with
    // `rx.transform.raw` for the signal-vs-raw distribution diagnostic.
    if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('rx.transform.signal')
    return computed(() => fn((source as ReadableSignal<any>)())) as any
  }
  // Raw array input → direct call, no computed. A spike in this counter
  // means consumers passed resolved values where signals were expected
  // (no reactive update, the result becomes stale).
  if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('rx.transform.raw')
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

/** Sort items by key or selector, ascending by default (`'desc'` to invert). */
export function sortBy<T>(
  source: ReadableSignal<T[]>,
  key: KeyOf<T>,
  direction?: 'asc' | 'desc',
): ReturnType<typeof computed<T[]>>
export function sortBy<T>(source: T[], key: KeyOf<T>, direction?: 'asc' | 'desc'): T[]
export function sortBy<T>(
  source: ReadableSignal<T[]> | T[],
  key: KeyOf<T>,
  direction: 'asc' | 'desc' = 'asc',
): any {
  const getKey = resolveKey(key)
  const flip = direction === 'desc' ? -1 : 1
  return reactive(source, (arr: T[]) =>
    [...arr].sort((a, b) => {
      const ka = getKey(a)
      const kb = getKey(b)
      return ka < kb ? -flip : ka > kb ? flip : 0
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

/**
 * Count items per key bucket. Returns `Record<string, number>` (keys are
 * `String()`-coerced, like {@link groupBy}). The counting companion to
 * `groupBy` — equivalent to `mapValues(groupBy(src, key), g => g.length)`
 * but single-pass.
 *
 * @example
 * ```ts
 * countBy(users, 'role')       // { admin: 2, viewer: 1 }
 * countBy([1, 2, 2, 3], n => n % 2 === 0 ? 'even' : 'odd') // { odd: 2, even: 2 }
 * ```
 */
export function countBy<T>(
  source: ReadableSignal<T[]>,
  key: KeyOf<T>,
): ReturnType<typeof computed<Record<string, number>>>
export function countBy<T>(source: T[], key: KeyOf<T>): Record<string, number>
export function countBy<T>(source: ReadableSignal<T[]> | T[], key: KeyOf<T>): any {
  const getKey = resolveKey(key)
  return reactive(source, (arr: T[]) => {
    const result: Record<string, number> = {}
    for (const item of arr) {
      const k = String(getKey(item))
      result[k] = (result[k] ?? 0) + 1
    }
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

/**
 * Map each item to an array and flatten ONE level (like `Array.prototype.flatMap`).
 * The mapper returns an array per item; the results are concatenated.
 *
 * @example
 * ```ts
 * flatMap([1, 2, 3], n => [n, n * 10]) // [1, 10, 2, 20, 3, 30]
 * const tags = rx.flatMap(posts, p => p.tags) // Computed<string[]>
 * ```
 */
export function flatMap<T, U>(
  source: ReadableSignal<T[]>,
  fn: (item: T, index: number) => U[],
): ReturnType<typeof computed<U[]>>
export function flatMap<T, U>(source: T[], fn: (item: T, index: number) => U[]): U[]
export function flatMap<T, U>(
  source: ReadableSignal<T[]> | T[],
  fn: (item: T, index: number) => U[],
): any {
  return reactive(source, (arr: T[]) => arr.flatMap(fn))
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

/**
 * Items of `source` also present in `other` (by identity, or by `key`
 * selector when given). Signal-aware on BOTH inputs — either may be a
 * signal; the result recomputes when either changes. O(n + m) via a Set.
 */
export function intersection<T>(
  source: ReadableSignal<T[]>,
  other: ReadableSignal<T[]> | T[],
  key?: KeyOf<T>,
): ReturnType<typeof computed<T[]>>
export function intersection<T>(
  source: T[],
  other: ReadableSignal<T[]>,
  key?: KeyOf<T>,
): ReturnType<typeof computed<T[]>>
export function intersection<T>(source: T[], other: T[], key?: KeyOf<T>): T[]
export function intersection<T>(
  source: ReadableSignal<T[]> | T[],
  other: ReadableSignal<T[]> | T[],
  key?: KeyOf<T>,
): any {
  const getKey = key ? resolveKey(key) : (item: T) => item as unknown
  return reactiveSetOp(source, other, (arr, otherArr) => {
    const keep = new Set(otherArr.map(getKey))
    return arr.filter((item) => keep.has(getKey(item)))
  })
}

/**
 * Items of `source` NOT present in `other` (by identity, or by `key`).
 * Signal-aware on both inputs. O(n + m).
 */
export function difference<T>(
  source: ReadableSignal<T[]>,
  other: ReadableSignal<T[]> | T[],
  key?: KeyOf<T>,
): ReturnType<typeof computed<T[]>>
export function difference<T>(
  source: T[],
  other: ReadableSignal<T[]>,
  key?: KeyOf<T>,
): ReturnType<typeof computed<T[]>>
export function difference<T>(source: T[], other: T[], key?: KeyOf<T>): T[]
export function difference<T>(
  source: ReadableSignal<T[]> | T[],
  other: ReadableSignal<T[]> | T[],
  key?: KeyOf<T>,
): any {
  const getKey = key ? resolveKey(key) : (item: T) => item as unknown
  return reactiveSetOp(source, other, (arr, otherArr) => {
    const drop = new Set(otherArr.map(getKey))
    return arr.filter((item) => !drop.has(getKey(item)))
  })
}

/**
 * `source` plus the items of `other` not already present (by identity, or by
 * `key`) — order-preserving, source first. Signal-aware on both inputs.
 */
export function union<T>(
  source: ReadableSignal<T[]>,
  other: ReadableSignal<T[]> | T[],
  key?: KeyOf<T>,
): ReturnType<typeof computed<T[]>>
export function union<T>(
  source: T[],
  other: ReadableSignal<T[]>,
  key?: KeyOf<T>,
): ReturnType<typeof computed<T[]>>
export function union<T>(source: T[], other: T[], key?: KeyOf<T>): T[]
export function union<T>(
  source: ReadableSignal<T[]> | T[],
  other: ReadableSignal<T[]> | T[],
  key?: KeyOf<T>,
): any {
  const getKey = key ? resolveKey(key) : (item: T) => item as unknown
  return reactiveSetOp(source, other, (arr, otherArr) => {
    const seen = new Set(arr.map(getKey))
    const out = [...arr]
    for (const item of otherArr) {
      const k = getKey(item)
      if (!seen.has(k)) {
        seen.add(k)
        out.push(item)
      }
    }
    return out
  })
}

/**
 * Two-input variant of the `reactive` helper: static when BOTH inputs are
 * plain arrays, a computed tracking whichever inputs are signals otherwise.
 */
function reactiveSetOp<T>(
  source: ReadableSignal<T[]> | T[],
  other: ReadableSignal<T[]> | T[],
  op: (a: T[], b: T[]) => T[],
): any {
  const sSig = isSignal(source)
  const oSig = isSignal(other)
  if (!sSig && !oSig) return op(source as T[], other as T[])
  return computed(() => {
    const a = sSig ? (source as ReadableSignal<T[]>)() : (source as T[])
    const b = oSig ? (other as ReadableSignal<T[]>)() : (other as T[])
    return op(a, b)
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
