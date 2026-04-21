import { average, count, every, max, min, reduce, some, sum } from './aggregation'
import {
  chunk,
  compact,
  dropWhile,
  filter,
  find,
  first,
  flatten,
  groupBy,
  keyBy,
  last,
  map,
  mapValues,
  partition,
  reverse,
  sample,
  skip,
  sortBy,
  take,
  takeWhile,
  uniqBy,
  unique,
} from './collections'
import { combine, distinct, merge, scan, zip } from './operators'
import { pipe } from './pipe'
import { search } from './search'
import { debounce, throttle } from './timing'

export type { KeyOf, ReadableSignal } from './types'

/**
 * Signal-aware reactive transforms.
 *
 * Every function is overloaded:
 * - `Signal<T[]>` input → returns `Computed<R>` (reactive)
 * - `T[]` input → returns `R` (static)
 *
 * @example
 * ```ts
 * import { rx } from "@pyreon/rx"
 *
 * const users = signal<User[]>([])
 * const active = rx.filter(users, u => u.active)      // Computed<User[]>
 * const sorted = rx.sortBy(active, "name")             // Computed<User[]>
 * const top10 = rx.take(sorted, 10)                    // Computed<User[]>
 *
 * // Or pipe:
 * const result = rx.pipe(users,
 *   items => items.filter(u => u.active),
 *   items => items.sort((a, b) => a.name.localeCompare(b.name)),
 *   items => items.slice(0, 10),
 * )
 * ```
 */
export const rx = {
  // Collections
  filter,
  map,
  sortBy,
  groupBy,
  keyBy,
  uniqBy,
  take,
  skip,
  last,
  chunk,
  flatten,
  find,
  mapValues,
  first,
  compact,
  reverse,
  partition,
  takeWhile,
  dropWhile,
  unique,
  sample,

  // Aggregation
  count,
  sum,
  min,
  max,
  average,
  reduce,
  every,
  some,

  // Operators
  distinct,
  scan,
  combine,
  zip,
  merge,

  // Timing
  debounce,
  throttle,

  // Search
  search,

  // Pipe
  pipe,
} as const

// Also export individual functions for tree-shaking
export {
  average,
  chunk,
  combine,
  compact,
  count,
  debounce,
  distinct,
  dropWhile,
  every,
  filter,
  find,
  first,
  flatten,
  groupBy,
  keyBy,
  last,
  map,
  mapValues,
  max,
  merge,
  min,
  partition,
  pipe,
  reduce,
  reverse,
  sample,
  scan,
  search,
  skip,
  some,
  sortBy,
  sum,
  take,
  takeWhile,
  throttle,
  uniqBy,
  unique,
  zip,
}
