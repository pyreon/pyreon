import { computed } from "@pyreon/reactivity"
import type { KeyOf, ReadableSignal } from "./types"
import { isSignal, resolveKey } from "./types"

// ─── Helpers ────────────────────────────────────────────────────────────────

function resolve<T>(source: ReadableSignal<T> | T): T {
  return isSignal(source) ? (source as ReadableSignal<T>)() : source
}

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
      if (!result[k]) result[k] = []
      result[k]!.push(item)
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
